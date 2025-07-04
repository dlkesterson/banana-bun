import { MeiliSearch } from 'meilisearch';
import { config } from '../config';
import { logger } from '../utils/logger';
import type { MediaMetadata } from '../types/media';
import type { IMeilisearchService, SearchOptions, SearchResult } from '../types/service-interfaces';

export interface MeiliMediaDocument {
    id: string;
    media_id: number;
    title?: string;
    description?: string;
    tags: string[];
    transcript?: string;
    transcript_snippet?: string;
    summary?: string;
    file_path: string;
    filename: string;
    duration: number;
    format: string;
    guessed_type?: string;
    year?: number;
    genre?: string;
    artist?: string;
    album?: string;
    language?: string;
    created_at: number; // timestamp
}

export class MeilisearchService implements IMeilisearchService {
    private client: MeiliSearch;
    private indexName: string;

    constructor() {
        this.client = new MeiliSearch({
            host: config.meilisearch.url,
            apiKey: config.meilisearch.masterKey,
        });
        this.indexName = config.meilisearch.indexName;
    }

    async initialize(): Promise<void> {
        try {
            // Create index if it doesn't exist
            await this.client.createIndex(this.indexName, { primaryKey: 'id' });
            await logger.info('Meilisearch index created or already exists', { indexName: this.indexName });
        } catch (error: any) {
            if (error.code === 'index_already_exists') {
                await logger.info('Meilisearch index already exists', { indexName: this.indexName });
            } else {
                await logger.error('Failed to create Meilisearch index', { 
                    error: error.message,
                    indexName: this.indexName 
                });
                throw error;
            }
        }

        // Configure filterable attributes
        const index = this.client.index(this.indexName);
        await index.updateFilterableAttributes([
            'tags',
            'guessed_type',
            'format',
            'year',
            'genre',
            'language',
            'duration',
            'media_id'
        ]);

        // Configure sortable attributes
        await index.updateSortableAttributes([
            'created_at',
            'duration',
            'year',
            'media_id'
        ]);

        // Configure searchable attributes with weights
        await index.updateSearchableAttributes([
            'title',
            'description',
            'transcript',
            'summary',
            'tags',
            'filename',
            'artist',
            'album',
            'genre'
        ]);

        await logger.info('Meilisearch index configured successfully');
    }

    async indexMedia(mediaId: number, metadata: MediaMetadata): Promise<string> {
        try {
            const document = this.createMeiliDocument(mediaId, metadata);
            const index = this.client.index(this.indexName);
            
            const task = await index.addDocuments([document]);
            await logger.info('Media indexed in Meilisearch', { 
                mediaId, 
                documentId: document.id,
                taskUid: task.taskUid 
            });
            
            return document.id;
        } catch (error) {
            await logger.error('Failed to index media in Meilisearch', {
                mediaId,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async updateMedia(mediaId: number, metadata: MediaMetadata): Promise<void> {
        try {
            const document = this.createMeiliDocument(mediaId, metadata);
            const index = this.client.index(this.indexName);
            
            const task = await index.updateDocuments([document]);
            await logger.info('Media updated in Meilisearch', { 
                mediaId, 
                documentId: document.id,
                taskUid: task.taskUid 
            });
        } catch (error) {
            await logger.error('Failed to update media in Meilisearch', {
                mediaId,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async deleteMedia(mediaId: number): Promise<void> {
        try {
            const documentId = `media_${mediaId}`;
            const index = this.client.index(this.indexName);
            
            const task = await index.deleteDocument(documentId);
            await logger.info('Media deleted from Meilisearch', { 
                mediaId, 
                documentId,
                taskUid: task.taskUid 
            });
        } catch (error) {
            await logger.error('Failed to delete media from Meilisearch', {
                mediaId,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async search(index: string, query: string, options?: SearchOptions): Promise<SearchResult> {
        try {
            const meiliIndex = this.client.index(index);
            const searchOptions: any = {
                limit: options?.limit || 20,
                offset: options?.offset || 0,
            };

            if (options?.filter) {
                searchOptions.filter = options.filter;
            }

            if (options?.sort) {
                searchOptions.sort = options.sort;
            }

            const result = await meiliIndex.search(query, searchOptions);

            return {
                hits: result.hits,
                totalHits: result.estimatedTotalHits || result.hits.length,
                processingTimeMs: result.processingTimeMs,
                query: result.query
            };
        } catch (error) {
            await logger.error('Meilisearch search failed', {
                query,
                options,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    async getStats(): Promise<any> {
        try {
            const index = this.client.index(this.indexName);
            const stats = await index.getStats();
            return stats;
        } catch (error) {
            await logger.error('Failed to get Meilisearch stats', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    private createMeiliDocument(mediaId: number, metadata: MediaMetadata): MeiliMediaDocument {
        // Create transcript snippet (first 500 characters)
        const transcriptSnippet = metadata.transcript 
            ? metadata.transcript.substring(0, 500) + (metadata.transcript.length > 500 ? '...' : '')
            : undefined;

        return {
            id: `media_${mediaId}`,
            media_id: mediaId,
            title: metadata.title,
            description: metadata.description,
            tags: metadata.tags || [],
            transcript: metadata.transcript,
            transcript_snippet: transcriptSnippet,
            summary: metadata.summary,
            file_path: metadata.filepath,
            filename: metadata.filename,
            duration: metadata.duration,
            format: metadata.format,
            guessed_type: metadata.guessed_type,
            year: metadata.year,
            genre: metadata.genre,
            artist: metadata.artist,
            album: metadata.album,
            language: metadata.language,
            created_at: Date.now()
        };
    }

    /**
     * Index a single document in the specified index
     */
    async indexDocument(index: string, document: any): Promise<void> {
        try {
            const meiliIndex = this.client.index(index);
            const task = await meiliIndex.addDocuments([document]);

            await logger.info('Document indexed in Meilisearch', {
                index,
                documentId: document.id,
                taskUid: task.taskUid
            });
        } catch (error) {
            await logger.error('Failed to index document in Meilisearch', {
                index,
                documentId: document.id,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    /**
     * Index multiple documents in the specified index
     */
    async indexDocuments(index: string, documents: any[]): Promise<void> {
        try {
            const meiliIndex = this.client.index(index);
            const task = await meiliIndex.addDocuments(documents);

            await logger.info('Documents indexed in Meilisearch', {
                index,
                documentsCount: documents.length,
                taskUid: task.taskUid
            });
        } catch (error) {
            await logger.error('Failed to index documents in Meilisearch', {
                index,
                documentsCount: documents.length,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    /**
     * Delete a document from the specified index
     */
    async deleteDocument(index: string, id: string): Promise<void> {
        try {
            const meiliIndex = this.client.index(index);
            const task = await meiliIndex.deleteDocument(id);

            await logger.info('Document deleted from Meilisearch', {
                index,
                documentId: id,
                taskUid: task.taskUid
            });
        } catch (error) {
            await logger.error('Failed to delete document from Meilisearch', {
                index,
                documentId: id,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }
}

// Export lazy singleton instance
let _meilisearchService: MeilisearchService | null = null;

export function getMeilisearchService(): MeilisearchService {
    if (!_meilisearchService) {
        _meilisearchService = new MeilisearchService();
    }
    return _meilisearchService;
}

// For backward compatibility - use a getter to make it lazy
export const meilisearchService = new Proxy({} as MeilisearchService, {
    get(target, prop) {
        return getMeilisearchService()[prop as keyof MeilisearchService];
    }
});
