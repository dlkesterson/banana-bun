import { ChromaClient } from 'chromadb';
import type { Collection } from 'chromadb';
import { config } from '../config';
import { logger } from '../utils/logger';
import { toolRunner } from '../tools/tool_runner';
import { getDatabase } from '../db';

export interface MediaEmbedding {
    id: string;
    media_id: number;
    embedding_text: string;
    metadata: {
        title?: string;
        tags?: string[];
        genre?: string;
        summary?: string;
        transcript?: string;
        file_path?: string;
        duration?: number;
        format?: string;
    };
}

export interface SimilarMediaResult {
    media_id: number;
    similarity_score: number;
    metadata: any;
    distance: number;
}

export class MediaEmbeddingService {
    private client: ChromaClient;
    private collection!: Collection;
    private readonly COLLECTION_NAME = 'media_embeddings';
    private readonly EMBEDDING_MODEL = 'qwen3:8b';

    constructor() {
        this.client = new ChromaClient({
            host: config.paths.chroma.host,
            port: config.paths.chroma.port,
            ssl: config.paths.chroma.ssl
        });
    }

    async initialize() {
        try {
            // Get or create collection for media embeddings
            this.collection = await this.client.getOrCreateCollection({
                name: this.COLLECTION_NAME,
                metadata: {
                    description: 'Media content embeddings for similarity search',
                    model: this.EMBEDDING_MODEL
                }
            });

            await logger.info('Media embedding service initialized', {
                collection: this.COLLECTION_NAME,
                model: this.EMBEDDING_MODEL
            });
        } catch (error) {
            await logger.error('Failed to initialize media embedding service', {
                error: error instanceof Error ? error.message : String(error)
            });
            // Don't throw error to allow system to continue without embeddings
            console.warn('Media embedding service initialization failed, continuing without embeddings');
        }
    }

    async generateEmbedding(text: string): Promise<number[]> {
        try {
            const result = await toolRunner.run('ollama', {
                model: this.EMBEDDING_MODEL,
                prompt: text,
                options: {
                    embedding: true
                }
            });

            if (!result.success || !result.embedding) {
                throw new Error('Failed to generate embedding');
            }

            return result.embedding;
        } catch (error) {
            await logger.error('Failed to generate embedding', {
                error: error instanceof Error ? error.message : String(error),
                textLength: text.length
            });
            throw error;
        }
    }

    async addMediaEmbedding(mediaEmbedding: MediaEmbedding): Promise<void> {
        try {
            // Generate embedding from combined text
            const embedding = await this.generateEmbedding(mediaEmbedding.embedding_text);

            // Add to ChromaDB
            await this.collection.add({
                ids: [mediaEmbedding.id],
                embeddings: [embedding],
                metadatas: [{
                    media_id: mediaEmbedding.media_id,
                    title: mediaEmbedding.metadata.title || '',
                    tags: JSON.stringify(mediaEmbedding.metadata.tags || []),
                    genre: mediaEmbedding.metadata.genre || '',
                    summary: mediaEmbedding.metadata.summary || '',
                    file_path: mediaEmbedding.metadata.file_path || '',
                    duration: mediaEmbedding.metadata.duration || 0,
                    format: mediaEmbedding.metadata.format || ''
                }]
            });

            await logger.info('Added media embedding', { 
                mediaId: mediaEmbedding.media_id,
                embeddingId: mediaEmbedding.id
            });
        } catch (error) {
            await logger.error('Failed to add media embedding', {
                mediaId: mediaEmbedding.media_id,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async findSimilarMedia(mediaId: number, topK: number = 10): Promise<SimilarMediaResult[]> {
        try {
            // Get the embedding for the source media
            const sourceEmbedding = await this.collection.get({
                ids: [`media_${mediaId}`],
                include: ['embeddings', 'metadatas']
            });

            if (!sourceEmbedding.embeddings || sourceEmbedding.embeddings.length === 0) {
                throw new Error(`No embedding found for media ID ${mediaId}`);
            }

            // Query for similar embeddings
            const results = await this.collection.query({
                queryEmbeddings: sourceEmbedding.embeddings,
                nResults: topK + 1, // +1 to exclude the source media itself
                include: ['metadatas', 'distances']
            });

            if (!results.metadatas || !results.distances || !results.ids) {
                return [];
            }

            const similarMedia: SimilarMediaResult[] = [];
            
            for (let i = 0; i < results.ids[0].length; i++) {
                const id = results.ids[0][i];
                const metadata = results.metadatas[0][i];
                const distance = results.distances[0][i];
                
                // Skip the source media itself
                if (metadata && metadata.media_id !== mediaId) {
                    similarMedia.push({
                        media_id: metadata.media_id as number,
                        similarity_score: 1 - distance, // Convert distance to similarity
                        metadata: metadata,
                        distance: distance
                    });
                }
            }

            await logger.info('Found similar media', {
                sourceMediaId: mediaId,
                resultsCount: similarMedia.length
            });

            return similarMedia.slice(0, topK); // Ensure we return exactly topK results
        } catch (error) {
            await logger.error('Failed to find similar media', {
                mediaId,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async searchMediaByText(query: string, topK: number = 10): Promise<SimilarMediaResult[]> {
        try {
            // Generate embedding for the search query
            const queryEmbedding = await this.generateEmbedding(query);

            // Search for similar embeddings
            const results = await this.collection.query({
                queryEmbeddings: [queryEmbedding],
                nResults: topK,
                include: ['metadatas', 'distances']
            });

            if (!results.metadatas || !results.distances || !results.ids) {
                return [];
            }

            const searchResults: SimilarMediaResult[] = [];
            
            for (let i = 0; i < results.ids[0].length; i++) {
                const metadata = results.metadatas[0][i];
                const distance = results.distances[0][i];
                
                if (metadata) {
                    searchResults.push({
                        media_id: metadata.media_id as number,
                        similarity_score: 1 - distance,
                        metadata: metadata,
                        distance: distance
                    });
                }
            }

            await logger.info('Searched media by text', {
                query,
                resultsCount: searchResults.length
            });

            return searchResults;
        } catch (error) {
            await logger.error('Failed to search media by text', {
                query,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async getMediaEmbeddingStats(): Promise<{
        total_embeddings: number;
        collection_name: string;
        model_used: string;
    }> {
        try {
            const count = await this.collection.count();
            
            return {
                total_embeddings: count,
                collection_name: this.COLLECTION_NAME,
                model_used: this.EMBEDDING_MODEL
            };
        } catch (error) {
            await logger.error('Failed to get embedding stats', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async deleteMediaEmbedding(mediaId: number): Promise<void> {
        try {
            await this.collection.delete({
                ids: [`media_${mediaId}`]
            });

            await logger.info('Deleted media embedding', { mediaId });
        } catch (error) {
            await logger.error('Failed to delete media embedding', {
                mediaId,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    isInitialized(): boolean {
        return !!this.collection;
    }
}

// Export singleton instance
export const mediaEmbeddingService = new MediaEmbeddingService();
