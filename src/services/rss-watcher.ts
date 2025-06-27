/**
 * RSS Feed Watcher Service
 * Monitors RSS feeds for new content and creates download tasks
 */

import { config } from '../config';
import { logger } from '../utils/logger';
import { getDatabase } from '../db';

export interface RssItem {
    title: string;
    link: string;
    description?: string;
    pubDate?: string;
    guid?: string;
    enclosure?: {
        url: string;
        type: string;
        length?: number;
    };
}

export interface RssFeed {
    url: string;
    title?: string;
    lastChecked?: string;
    lastItemDate?: string;
    enabled: boolean;
}

export class RssWatcher {
    private feeds: RssFeed[] = [];
    private checkInterval: number;
    private intervalId?: Timer;

    constructor() {
        this.checkInterval = config.downloaders.rss.checkInterval * 1000; // Convert to milliseconds
        this.loadFeeds();
    }

    private loadFeeds(): void {
        // Load feeds from configuration
        this.feeds = config.downloaders.rss.feeds.map(url => ({
            url,
            enabled: true
        }));

        // Load additional feeds from database if needed
        // This could be extended to support user-added feeds
    }

    /**
     * Start watching RSS feeds
     */
    start(): void {
        if (!config.downloaders.rss.enabled) {
            logger.info('RSS watcher is disabled in configuration');
            return;
        }

        if (this.feeds.length === 0) {
            logger.info('No RSS feeds configured');
            return;
        }

        logger.info('Starting RSS watcher', { 
            feedCount: this.feeds.length, 
            checkInterval: this.checkInterval / 1000 
        });

        // Initial check
        this.checkAllFeeds();

        // Set up periodic checking
        this.intervalId = setInterval(() => {
            this.checkAllFeeds();
        }, this.checkInterval);
    }

    /**
     * Stop watching RSS feeds
     */
    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
        }
        logger.info('RSS watcher stopped');
    }

    /**
     * Add a new RSS feed to watch
     */
    addFeed(url: string): void {
        if (this.feeds.some(feed => feed.url === url)) {
            logger.warn('RSS feed already exists', { url });
            return;
        }

        this.feeds.push({
            url,
            enabled: true
        });

        logger.info('Added RSS feed', { url });
    }

    /**
     * Remove an RSS feed
     */
    removeFeed(url: string): void {
        const index = this.feeds.findIndex(feed => feed.url === url);
        if (index === -1) {
            logger.warn('RSS feed not found', { url });
            return;
        }

        this.feeds.splice(index, 1);
        logger.info('Removed RSS feed', { url });
    }

    /**
     * Check all enabled feeds for new content
     */
    private async checkAllFeeds(): Promise<void> {
        const enabledFeeds = this.feeds.filter(feed => feed.enabled);
        
        logger.debug('Checking RSS feeds', { count: enabledFeeds.length });

        for (const feed of enabledFeeds) {
            try {
                await this.checkFeed(feed);
            } catch (error) {
                logger.error('Error checking RSS feed', { 
                    url: feed.url, 
                    error: error instanceof Error ? error.message : String(error) 
                });
            }
        }
    }

    /**
     * Check a single RSS feed for new content
     */
    private async checkFeed(feed: RssFeed): Promise<void> {
        try {
            const response = await fetch(feed.url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const xmlContent = await response.text();
            const items = this.parseRssFeed(xmlContent);

            if (items.length === 0) {
                logger.debug('No items found in RSS feed', { url: feed.url });
                return;
            }

            // Filter for new items
            const newItems = this.filterNewItems(feed, items);
            
            if (newItems.length > 0) {
                logger.info('Found new RSS items', { 
                    url: feed.url, 
                    newItemCount: newItems.length 
                });

                // Create download tasks for new items
                for (const item of newItems) {
                    await this.createDownloadTask(item, feed);
                }

                // Update last checked timestamp
                feed.lastChecked = new Date().toISOString();
                if (newItems.length > 0) {
                    feed.lastItemDate = newItems[0].pubDate;
                }
            }

        } catch (error) {
            logger.error('Failed to check RSS feed', { 
                url: feed.url, 
                error: error instanceof Error ? error.message : String(error) 
            });
        }
    }

    /**
     * Parse RSS XML content and extract items
     */
    private parseRssFeed(xmlContent: string): RssItem[] {
        // Simple RSS parsing - in production, you'd want to use a proper XML parser
        const items: RssItem[] = [];
        
        try {
            // Extract items using regex (basic implementation)
            const itemMatches = xmlContent.match(/<item[^>]*>[\s\S]*?<\/item>/gi);
            
            if (!itemMatches) {
                return items;
            }

            for (const itemXml of itemMatches) {
                const item: RssItem = {
                    title: this.extractXmlValue(itemXml, 'title') || 'Untitled',
                    link: this.extractXmlValue(itemXml, 'link') || '',
                    description: this.extractXmlValue(itemXml, 'description'),
                    pubDate: this.extractXmlValue(itemXml, 'pubDate'),
                    guid: this.extractXmlValue(itemXml, 'guid')
                };

                // Extract enclosure if present
                const enclosureMatch = itemXml.match(/<enclosure[^>]*>/i);
                if (enclosureMatch) {
                    const enclosureXml = enclosureMatch[0];
                    const url = this.extractAttribute(enclosureXml, 'url');
                    const type = this.extractAttribute(enclosureXml, 'type');
                    const length = this.extractAttribute(enclosureXml, 'length');
                    
                    if (url) {
                        item.enclosure = {
                            url,
                            type: type || 'unknown',
                            length: length ? parseInt(length) : undefined
                        };
                    }
                }

                items.push(item);
            }
        } catch (error) {
            logger.error('Error parsing RSS XML', { error });
        }

        return items;
    }

    private extractXmlValue(xml: string, tagName: string): string | undefined {
        const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
        const match = xml.match(regex);
        return match ? match[1].trim() : undefined;
    }

    private extractAttribute(xml: string, attrName: string): string | undefined {
        const regex = new RegExp(`${attrName}=["']([^"']*)["']`, 'i');
        const match = xml.match(regex);
        return match ? match[1] : undefined;
    }

    /**
     * Filter items to find only new ones since last check
     */
    private filterNewItems(feed: RssFeed, items: RssItem[]): RssItem[] {
        if (!feed.lastItemDate) {
            // First time checking this feed, only take the most recent item
            return items.slice(0, 1);
        }

        const lastDate = new Date(feed.lastItemDate);
        return items.filter(item => {
            if (!item.pubDate) return false;
            const itemDate = new Date(item.pubDate);
            return itemDate > lastDate;
        });
    }

    /**
     * Create a download task for an RSS item
     */
    private async createDownloadTask(item: RssItem, feed: RssFeed): Promise<void> {
        try {
            const db = getDatabase();
            
            // Determine download URL - prefer enclosure URL for media content
            const downloadUrl = item.enclosure?.url || item.link;
            
            if (!downloadUrl) {
                logger.warn('No download URL found for RSS item', { title: item.title });
                return;
            }

            // Create media download task
            const taskArgs = {
                source: 'rss' as const,
                url: downloadUrl,
                media_type: this.guessMediaType(item),
                destination_path: config.paths.media
            };

            const description = `RSS download: ${item.title} from ${feed.url}`;

            const result = db.run(
                `INSERT INTO tasks (type, description, status, args)
                 VALUES (?, ?, ?, ?)`,
                [
                    'media_download',
                    description,
                    'pending',
                    JSON.stringify(taskArgs)
                ]
            );

            const taskId = result.lastInsertRowid as number;

            logger.info('Created RSS download task', {
                taskId,
                title: item.title,
                url: downloadUrl,
                feedUrl: feed.url
            });

        } catch (error) {
            logger.error('Failed to create RSS download task', {
                title: item.title,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * Guess media type based on RSS item content
     */
    private guessMediaType(item: RssItem): 'video' | 'music' | undefined {
        const title = item.title.toLowerCase();
        const description = (item.description || '').toLowerCase();
        const enclosureType = item.enclosure?.type?.toLowerCase();

        // Check enclosure MIME type first
        if (enclosureType) {
            if (enclosureType.startsWith('video/')) return 'video';
            if (enclosureType.startsWith('audio/')) return 'music';
        }

        // Check title and description for keywords
        const videoKeywords = ['video', 'episode', 'show', 'series', 'movie', 'film'];
        const audioKeywords = ['audio', 'podcast', 'music', 'song', 'album'];

        const content = `${title} ${description}`;
        
        if (videoKeywords.some(keyword => content.includes(keyword))) {
            return 'video';
        }
        
        if (audioKeywords.some(keyword => content.includes(keyword))) {
            return 'music';
        }

        return undefined;
    }
}

// Export singleton instance
export const rssWatcher = new RssWatcher();
