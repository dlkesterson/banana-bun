import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join, dirname, basename, extname } from 'path';
import { logger } from '../utils/logger';
import { config } from '../config';

export interface AudioFeatures {
    is_music: boolean;
    genre?: string;
    bpm?: number;
    key_signature?: string;
    mood?: string;
    energy_level?: number;
    danceability?: number;
    valence?: number; // Musical positivity
    loudness?: number;
    speechiness?: number;
    instrumentalness?: number;
    liveness?: number;
    acousticness?: number;
    language?: string;
    features_json?: string; // Full feature set as JSON
}

export interface AudioAnalysisOptions {
    analysisType?: 'full' | 'classification' | 'features';
    extractSpectogram?: boolean;
    sampleDuration?: number; // Analyze only first N seconds
    outputDir?: string;
}

export interface AudioAnalysisResult {
    success: boolean;
    features?: AudioFeatures;
    error?: string;
    processing_time_ms?: number;
    analysis_model?: string;
    file_path?: string;
}

export class AudioAnalyzerService {
    private initialized = false;
    private ffmpegPath: string;
    private ffprobePath: string;

    constructor() {
        this.ffmpegPath = 'ffmpeg';
        this.ffprobePath = 'ffprobe';
        this.initialize();
    }

    private async initialize() {
        try {
            // Check if FFmpeg is available for audio processing
            await this.checkFFmpegAvailability();
            this.initialized = true;
            await logger.info('Audio analyzer service initialized successfully');
        } catch (error) {
            await logger.error('Failed to initialize audio analyzer service', {
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    private async checkFFmpegAvailability(): Promise<void> {
        return new Promise((resolve, reject) => {
            const ffmpeg = spawn(this.ffmpegPath, ['-version']);
            
            ffmpeg.on('error', (error) => {
                reject(new Error(`FFmpeg not found: ${error.message}`));
            });
            
            ffmpeg.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`FFmpeg check failed with code ${code}`));
                }
            });
        });
    }

    async analyzeAudio(audioPath: string, options: AudioAnalysisOptions = {}): Promise<AudioAnalysisResult> {
        const startTime = Date.now();

        if (!this.initialized) {
            return {
                success: false,
                error: 'Audio analyzer service not initialized - FFmpeg may not be available'
            };
        }

        try {
            const {
                analysisType = 'full',
                extractSpectogram = false,
                sampleDuration = 30,
                outputDir = config.paths.outputs
            } = options;

            await logger.info('Starting audio analysis', {
                audioPath,
                analysisType,
                sampleDuration,
                extractSpectogram
            });

            // Ensure output directory exists
            await fs.mkdir(outputDir, { recursive: true });

            // Extract basic audio metadata
            const metadata = await this.extractAudioMetadata(audioPath);
            
            // Analyze audio features
            const features = await this.analyzeAudioFeatures(audioPath, metadata, sampleDuration);

            // Extract spectogram if requested
            if (extractSpectogram) {
                await this.extractSpectogram(audioPath, outputDir, sampleDuration);
            }

            const processingTime = Date.now() - startTime;
            await logger.info('Audio analysis completed', {
                audioPath,
                processingTimeMs: processingTime,
                isMusic: features.is_music,
                genre: features.genre
            });

            return {
                success: true,
                features,
                processing_time_ms: processingTime,
                analysis_model: 'ffmpeg_heuristic',
                file_path: audioPath
            };

        } catch (error) {
            const processingTime = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);

            await logger.error('Audio analysis failed', {
                audioPath,
                error: errorMessage,
                processingTimeMs: processingTime
            });

            return {
                success: false,
                error: errorMessage,
                processing_time_ms: processingTime,
                file_path: audioPath
            };
        }
    }

    private async extractAudioMetadata(audioPath: string): Promise<any> {
        return new Promise((resolve, reject) => {
            const ffprobe = spawn(this.ffprobePath, [
                '-v', 'quiet',
                '-print_format', 'json',
                '-show_format',
                '-show_streams',
                '-select_streams', 'a:0', // First audio stream
                audioPath
            ]);

            let output = '';
            ffprobe.stdout.on('data', (data) => {
                output += data.toString();
            });

            ffprobe.on('close', (code) => {
                if (code === 0) {
                    try {
                        const metadata = JSON.parse(output);
                        resolve(metadata);
                    } catch (error) {
                        reject(new Error('Failed to parse audio metadata'));
                    }
                } else {
                    reject(new Error(`FFprobe failed with code ${code}`));
                }
            });

            ffprobe.on('error', (error) => {
                reject(new Error(`FFprobe execution failed: ${error.message}`));
            });
        });
    }

    private async analyzeAudioFeatures(audioPath: string, metadata: any, sampleDuration: number): Promise<AudioFeatures> {
        // Extract basic features from metadata
        const audioStream = metadata.streams?.find((s: any) => s.codec_type === 'audio');
        const format = metadata.format;

        if (!audioStream) {
            throw new Error('No audio stream found in file');
        }

        // Get audio statistics using FFmpeg
        const audioStats = await this.getAudioStatistics(audioPath, sampleDuration);
        
        // Analyze spectral features
        const spectralFeatures = await this.analyzeSpectralFeatures(audioPath, sampleDuration);

        // Combine all features
        const features: AudioFeatures = {
            is_music: this.classifyMusicVsSpeech(audioStats, spectralFeatures, audioStream),
            genre: this.estimateGenre(spectralFeatures, audioStats),
            bpm: this.estimateBPM(audioStats),
            key_signature: this.estimateKey(spectralFeatures),
            mood: this.estimateMood(spectralFeatures, audioStats),
            energy_level: this.calculateEnergyLevel(audioStats),
            danceability: this.calculateDanceability(audioStats, spectralFeatures),
            valence: this.calculateValence(spectralFeatures),
            loudness: audioStats.mean_volume || 0,
            speechiness: this.calculateSpeechiness(audioStats, spectralFeatures),
            instrumentalness: this.calculateInstrumentalness(audioStats, spectralFeatures),
            liveness: this.calculateLiveness(audioStats),
            acousticness: this.calculateAcousticness(spectralFeatures),
            language: this.detectLanguage(audioStats, spectralFeatures),
            features_json: JSON.stringify({
                sample_rate: audioStream.sample_rate,
                channels: audioStream.channels,
                duration: parseFloat(format.duration || '0'),
                bit_rate: parseInt(format.bit_rate || '0'),
                codec: audioStream.codec_name,
                raw_stats: audioStats,
                spectral_features: spectralFeatures
            })
        };

        return features;
    }

    private async getAudioStatistics(audioPath: string, duration: number): Promise<any> {
        return new Promise((resolve, reject) => {
            const ffmpeg = spawn(this.ffmpegPath, [
                '-i', audioPath,
                '-t', duration.toString(),
                '-af', 'astats=metadata=1:reset=1',
                '-f', 'null',
                '-'
            ]);

            let output = '';
            ffmpeg.stderr.on('data', (data) => {
                output += data.toString();
            });

            ffmpeg.on('close', (code) => {
                if (code === 0) {
                    try {
                        const stats = this.parseAudioStats(output);
                        resolve(stats);
                    } catch (error) {
                        reject(new Error('Failed to parse audio statistics'));
                    }
                } else {
                    reject(new Error(`Audio statistics extraction failed with code ${code}`));
                }
            });

            ffmpeg.on('error', (error) => {
                reject(new Error(`FFmpeg audio stats failed: ${error.message}`));
            });
        });
    }

    private parseAudioStats(output: string): any {
        const stats: any = {};
        const lines = output.split('\n');

        for (const line of lines) {
            // Parse FFmpeg astats output
            if (line.includes('Mean volume:')) {
                const match = line.match(/Mean volume:\s*([-\d.]+)/);
                if (match) stats.mean_volume = parseFloat(match[1]);
            }
            if (line.includes('Max volume:')) {
                const match = line.match(/Max volume:\s*([-\d.]+)/);
                if (match) stats.max_volume = parseFloat(match[1]);
            }
            if (line.includes('RMS level:')) {
                const match = line.match(/RMS level:\s*([-\d.]+)/);
                if (match) stats.rms_level = parseFloat(match[1]);
            }
            if (line.includes('Peak level:')) {
                const match = line.match(/Peak level:\s*([-\d.]+)/);
                if (match) stats.peak_level = parseFloat(match[1]);
            }
            if (line.includes('Dynamic range:')) {
                const match = line.match(/Dynamic range:\s*([\d.]+)/);
                if (match) stats.dynamic_range = parseFloat(match[1]);
            }
        }

        // Add derived metrics
        stats.loudness_range = (stats.max_volume || 0) - (stats.mean_volume || 0);
        stats.compression_ratio = stats.dynamic_range ? Math.max(0, 1 - (stats.dynamic_range / 60)) : 0;

        return stats;
    }

    private async analyzeSpectralFeatures(audioPath: string, duration: number): Promise<any> {
        // For now, return mock spectral features
        // In a production system, you'd use a proper audio analysis library
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve({
                    spectral_centroid: 1500 + Math.random() * 2000,
                    spectral_bandwidth: 800 + Math.random() * 1200,
                    spectral_rolloff: 3000 + Math.random() * 5000,
                    zero_crossing_rate: 0.1 + Math.random() * 0.3,
                    mfcc: Array.from({ length: 13 }, () => Math.random() * 2 - 1),
                    chroma: Array.from({ length: 12 }, () => Math.random()),
                    tempo_confidence: Math.random()
                });
            }, 100);
        });
    }

    private classifyMusicVsSpeech(audioStats: any, spectralFeatures: any, audioStream: any): boolean {
        // Heuristic classification based on audio characteristics
        let musicScore = 0;

        // Music typically has more consistent volume
        if (audioStats.dynamic_range && audioStats.dynamic_range > 20) musicScore += 0.3;
        
        // Music typically has higher spectral complexity
        if (spectralFeatures.spectral_bandwidth > 1000) musicScore += 0.2;
        
        // Music typically has lower zero crossing rate
        if (spectralFeatures.zero_crossing_rate < 0.2) musicScore += 0.2;
        
        // Music typically has more stereo content
        if (audioStream.channels > 1) musicScore += 0.1;
        
        // Music typically has higher bit rates
        if (parseInt(audioStream.bit_rate || '0') > 128000) musicScore += 0.2;

        return musicScore > 0.5;
    }

    private estimateGenre(spectralFeatures: any, audioStats: any): string {
        // Simple genre estimation based on spectral features
        const centroid = spectralFeatures.spectral_centroid;
        const bandwidth = spectralFeatures.spectral_bandwidth;
        const energy = audioStats.rms_level || 0;

        if (centroid > 3000 && bandwidth > 1500) return 'electronic';
        if (centroid < 1000 && energy < -20) return 'classical';
        if (bandwidth > 2000 && energy > -15) return 'rock';
        if (centroid > 2000 && centroid < 3000) return 'pop';
        if (centroid < 1500 && bandwidth < 1000) return 'folk';
        
        return 'unknown';
    }

    private estimateBPM(audioStats: any): number {
        // Mock BPM estimation - in production, use proper tempo detection
        const baselineBPM = 120;
        const variation = Math.random() * 60 - 30; // ±30 BPM variation
        return Math.round(Math.max(60, Math.min(200, baselineBPM + variation)));
    }

    private estimateKey(spectralFeatures: any): string {
        // Mock key estimation based on chroma features
        const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const modes = ['major', 'minor'];
        
        const keyIndex = Math.floor(Math.random() * keys.length);
        const modeIndex = Math.floor(Math.random() * modes.length);
        
        return `${keys[keyIndex]} ${modes[modeIndex]}`;
    }

    private estimateMood(spectralFeatures: any, audioStats: any): string {
        const energy = audioStats.rms_level || 0;
        const centroid = spectralFeatures.spectral_centroid;
        
        if (energy > -10 && centroid > 2000) return 'energetic';
        if (energy < -25 && centroid < 1500) return 'calm';
        if (centroid > 2500) return 'bright';
        if (centroid < 1000) return 'dark';
        if (energy > -15) return 'upbeat';
        
        return 'neutral';
    }

    private calculateEnergyLevel(audioStats: any): number {
        // Normalize RMS level to 0-1 scale
        const rms = audioStats.rms_level || -30;
        return Math.max(0, Math.min(1, (rms + 30) / 30));
    }

    private calculateDanceability(audioStats: any, spectralFeatures: any): number {
        // Combine tempo confidence and energy for danceability
        const tempoConfidence = spectralFeatures.tempo_confidence || 0.5;
        const energy = this.calculateEnergyLevel(audioStats);
        return (tempoConfidence + energy) / 2;
    }

    private calculateValence(spectralFeatures: any): number {
        // Use spectral centroid as proxy for musical positivity
        const centroid = spectralFeatures.spectral_centroid;
        return Math.max(0, Math.min(1, (centroid - 1000) / 3000));
    }

    private calculateSpeechiness(audioStats: any, spectralFeatures: any): number {
        // Higher zero crossing rate indicates more speech-like content
        const zcr = spectralFeatures.zero_crossing_rate;
        return Math.max(0, Math.min(1, zcr / 0.4));
    }

    private calculateInstrumentalness(audioStats: any, spectralFeatures: any): number {
        // Inverse of speechiness
        return 1 - this.calculateSpeechiness(audioStats, spectralFeatures);
    }

    private calculateLiveness(audioStats: any): number {
        // Use dynamic range as proxy for liveness
        const dynamicRange = audioStats.dynamic_range || 20;
        return Math.max(0, Math.min(1, dynamicRange / 40));
    }

    private calculateAcousticness(spectralFeatures: any): number {
        // Lower spectral centroid indicates more acoustic content
        const centroid = spectralFeatures.spectral_centroid;
        return Math.max(0, Math.min(1, 1 - (centroid - 500) / 3000));
    }

    private detectLanguage(audioStats: any, spectralFeatures: any): string {
        // Mock language detection - in production, use proper speech recognition
        const speechiness = this.calculateSpeechiness(audioStats, spectralFeatures);
        
        if (speechiness > 0.7) {
            const languages = ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ko'];
            return languages[Math.floor(Math.random() * languages.length)];
        }
        
        return 'instrumental';
    }

    private async extractSpectogram(audioPath: string, outputDir: string, duration: number): Promise<string> {
        const outputPath = join(outputDir, 'spectrograms', `${basename(audioPath, extname(audioPath))}_spectrogram.png`);
        await fs.mkdir(dirname(outputPath), { recursive: true });

        return new Promise((resolve, reject) => {
            const ffmpeg = spawn(this.ffmpegPath, [
                '-i', audioPath,
                '-t', duration.toString(),
                '-lavfi', 'showspectrumpic=s=1024x512:mode=combined:color=rainbow',
                '-y',
                outputPath
            ]);

            ffmpeg.on('close', (code) => {
                if (code === 0) {
                    resolve(outputPath);
                } else {
                    reject(new Error(`Spectrogram extraction failed with code ${code}`));
                }
            });

            ffmpeg.on('error', (error) => {
                reject(new Error(`FFmpeg spectrogram extraction failed: ${error.message}`));
            });
        });
    }

    /**
     * Analyze audio for a specific media file from database
     */
    async analyzeMediaAudio(mediaId: number, options: AudioAnalysisOptions = {}): Promise<AudioAnalysisResult & { media_id?: number }> {
        try {
            // Import here to avoid circular dependencies
            const { getDatabase } = await import('../db');
            const db = getDatabase();

            // Get media file path
            const mediaRow = db.prepare('SELECT file_path FROM media_metadata WHERE id = ?').get(mediaId) as { file_path: string } | undefined;

            if (!mediaRow) {
                return {
                    success: false,
                    error: `No media found for ID ${mediaId}`
                };
            }

            const result = await this.analyzeAudio(mediaRow.file_path, options);
            
            return {
                ...result,
                media_id: mediaId
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            await logger.error('Failed to analyze media audio', {
                mediaId,
                error: errorMessage
            });

            return {
                success: false,
                error: errorMessage
            };
        }
    }

    /**
     * Check if the service is properly initialized
     */
    isInitialized(): boolean {
        return this.initialized;
    }

    /**
     * Get supported audio formats
     */
    getSupportedFormats(): string[] {
        return ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'wma'];
    }
}

// Export singleton instance
export const audioAnalyzerService = new AudioAnalyzerService();
