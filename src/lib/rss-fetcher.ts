import { Redis } from '@upstash/redis'
import axios, { AxiosResponse } from 'axios'
import { XMLParser } from 'fast-xml-parser'

interface RSSConfig {
  feedUrl: string;
  pollingInterval: number; // milliseconds
  maxRetries: number;
  rateLimitDelay: number;
  userAgent: string;
  cacheTTL: number;
}

interface RSSItem {
  guid?: string | { '#text': string };
  title?: string | { '#text': string };
  description?: string | { '#text': string };
  link?: string | { '#text': string };
  pubDate?: string;
  'dc:creator'?: string;
}

interface RSSFeed {
  rss?: {
    channel?: {
      item?: RSSItem[] | RSSItem;
    };
  };
}

export class TurnBackHoaxFetcher {
  private redis: Redis;
  private config: RSSConfig;
  private parser: XMLParser;

  constructor(config?: Partial<RSSConfig>) {
    this.redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!
    });

    this.config = {
      feedUrl: 'https://turnbackhoax.id/feed/',
      pollingInterval: 2 * 60 * 60 * 1000, // 2 hours (more cost-effective)
      maxRetries: 3,
      rateLimitDelay: 5000,
      userAgent: 'SafeJakarta-Bot/1.0 (+https://safe-jakarta.vercel.app)',
      cacheTTL: 4 * 60 * 60 * 1000, // 4 hours
      ...config
    };

    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text'
    });
  }

  async fetchAndProcess(): Promise<{
    success: boolean;
    newItems: number;
    error?: string;
  }> {
    const lockKey = 'turnbackhoax:processing_lock';
    const lockValue = Date.now().toString();

    try {
      // Acquire distributed lock
      const acquired = await this.redis.set(lockKey, lockValue, {
        ex: 300, // 5 minutes
        nx: true  // Only set if key doesn't exist
      });

      if (!acquired) {
        console.log('Another instance is processing RSS feed');
        return { success: true, newItems: 0 };
      }

      const result = await this.processFeed();
      return result;

    } catch (error) {
      console.error('RSS Fetcher error:', error);
      return {
        success: false,
        newItems: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    } finally {
      // Release lock
      await this.redis.del(lockKey);
    }
  }

  private async processFeed(): Promise<{
    success: boolean;
    newItems: number;
    error?: string;
  }> {
    try {
      // Smart change detection - check if we should skip this fetch
      console.log('🔍 Checking if fetch should be skipped...');
      const shouldSkip = await this.shouldSkipFetch();
      if (shouldSkip) {
        console.log('⏭️  Skipping fetch - no changes detected or too recent');
        return { success: true, newItems: 0 };
      }
      console.log('✅ Proceeding with RSS fetch...');

      // Get last processed GUID from cache
      const lastGuid = await this.redis.get('turnbackhoax:last_guid') as string | null;
      console.log(`📋 Last processed GUID: ${lastGuid || 'None (first run)'}`);

      // Check if last GUID is too old (more than 7 days) and clear it
      if (lastGuid) {
        const lastGuidTime = await this.redis.get('turnbackhoax:last_guid_timestamp') as string | null;
        if (lastGuidTime) {
          const timeSinceLastGuid = Date.now() - new Date(lastGuidTime).getTime();
          const daysSinceLastGuid = timeSinceLastGuid / (1000 * 60 * 60 * 24);
          
          if (daysSinceLastGuid > 7) {
            console.log(`🧹 Last GUID is ${daysSinceLastGuid.toFixed(1)} days old - clearing to prevent stuck state`);
            await this.redis.del('turnbackhoax:last_guid');
            await this.redis.del('turnbackhoax:last_guid_timestamp');
            // Continue with lastGuid as null
          }
        }
      }

      // Fetch RSS feed
      console.log('📡 Fetching RSS feed...');
      const feedData = await this.fetchFeed();

      if (!feedData) {
        return { success: false, newItems: 0, error: 'Failed to fetch RSS feed' };
      }

      // Parse items
      console.log('📄 Parsing RSS items...');
      const items = this.parseItems(feedData);
      console.log(`📊 Total items in feed: ${items.length}`);

      // Filter new items
      console.log('🔍 Filtering new items...');
      const newItems = this.filterNewItems(items, lastGuid);

      console.log(`📈 Found ${newItems.length} new items out of ${items.length} total items`);
      
      if (newItems.length > 0) {
        console.log('🆕 New items found:');
        newItems.slice(0, 3).forEach((item, index) => {
          const guid = this.extractGuid(item);
          const title = this.extractText(item.title);
          console.log(`  ${index + 1}. ${guid} - ${title?.substring(0, 50)}...`);
        });
      }

      if (newItems.length > 0) {
        // Cache new items for processing
        await this.cacheNewItems(newItems);

        // Update last processed GUID
        const firstNewItemGuid = this.extractGuid(newItems[0]);
        await this.redis.set('turnbackhoax:last_guid', firstNewItemGuid, {
          ex: 86400 * 30 // 30 days
        });
        
        // Store timestamp for GUID age tracking
        await this.redis.set('turnbackhoax:last_guid_timestamp', new Date().toISOString(), {
          ex: 86400 * 30 // 30 days
        });

        // Update last fetch timestamp
        await this.redis.set('turnbackhoax:last_fetch', new Date().toISOString(), {
          ex: 86400 * 7 // 7 days
        });
      }

      // Track successful fetch
      await this.redis.set('turnbackhoax:last_successful_fetch', new Date().toISOString(), {
        ex: 86400 * 7 // 7 days
      });

      // Track metrics
      await this.trackMetrics(true, newItems.length);

      return { success: true, newItems: newItems.length };

    } catch (error) {
      console.error('Feed processing error:', error);
      await this.trackMetrics(false, 0, error instanceof Error ? error.message : 'Unknown error');
      return {
        success: false,
        newItems: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async fetchFeed(): Promise<RSSFeed | null> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        console.log(`Fetching RSS feed (attempt ${attempt}/${this.config.maxRetries})`);

        const response: AxiosResponse<string> = await axios.get(this.config.feedUrl, {
          headers: {
            'User-Agent': this.config.userAgent,
            'Accept': 'application/rss+xml, application/xml, text/xml'
          },
          timeout: 30000, // 30 seconds
          maxRedirects: 5
        });

        if (response.status !== 200) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const parsedData = this.parser.parse(response.data);
        return parsedData;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown fetch error');
        console.error(`Attempt ${attempt} failed:`, lastError.message);

        if (attempt < this.config.maxRetries) {
          console.log(`Waiting ${this.config.rateLimitDelay}ms before retry...`);
          await this.delay(this.config.rateLimitDelay);
        }
      }
    }

    throw lastError || new Error('Failed to fetch RSS feed after all retries');
  }

  private parseItems(feedData: RSSFeed): RSSItem[] {
    try {
      const channel = feedData.rss?.channel;
      if (!channel) {
        throw new Error('Invalid RSS structure: no channel found');
      }

      const items = channel.item;
      if (!items) {
        return [];
      }

      // Handle both single item and array of items
      const itemArray = Array.isArray(items) ? items : [items];
      return itemArray;

    } catch (error) {
      console.error('Error parsing RSS items:', error);
      return [];
    }
  }

  private filterNewItems(items: RSSItem[], lastGuid: string | null): RSSItem[] {
    if (!items.length) {
      console.log('📭 No items in RSS feed');
      return [];
    }

    console.log(`📊 Processing ${items.length} RSS items...`);
    
    // If no last GUID, take latest 3 items to avoid overwhelming
    if (!lastGuid) {
      console.log('🚀 First run - taking latest 3 items');
      const newItems = items.slice(0, 3);
      newItems.forEach((item, index) => {
        const guid = this.extractGuid(item);
        const title = this.extractText(item.title);
        console.log(`  ${index + 1}. ${guid} - ${title?.substring(0, 50)}...`);
      });
      return newItems;
    }

    // Smart filtering: find items that come before the last processed GUID
    const newItems: RSSItem[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const itemGuid = this.extractGuid(item);
      
      if (itemGuid === lastGuid) {
        console.log(`✅ Found last processed GUID at position ${i} - stopping here`);
        break;
      }
      
      newItems.push(item);
      console.log(`🆕 New item found: ${itemGuid}`);
    }
    
    console.log(`📈 Found ${newItems.length} new items from ${items.length} total items`);
    return newItems;
  }

  private extractGuid(item: RSSItem): string | null {
    if (!item.guid) return null;

    if (typeof item.guid === 'string') {
      return item.guid;
    }

    if (typeof item.guid === 'object' && item.guid['#text']) {
      return item.guid['#text'];
    }

    return null;
  }

  private async cacheNewItems(items: RSSItem[]): Promise<void> {
    const cacheKey = 'turnbackhoax:new_items';
    const itemsData = items.map(item => ({
      guid: this.extractGuid(item),
      title: this.extractText(item.title),
      description: this.extractText(item.description),
      link: this.extractText(item.link),
      pubDate: item.pubDate,
      creator: item['dc:creator']
    }));

    await this.redis.set(cacheKey, JSON.stringify(itemsData), {
      ex: 3600 // 1 hour
    });
  }

  private extractText(field: string | { '#text': string } | undefined): string {
    if (!field) return '';
    if (typeof field === 'string') return field;
    if (typeof field === 'object' && field['#text']) return field['#text'];
    return '';
  }

  private async trackMetrics(success: boolean, newItemsCount: number, error?: string): Promise<void> {
    const metrics = {
      timestamp: new Date().toISOString(),
      success,
      newItemsCount,
      error: error || null
    };

    // Store in Redis for quick access
    await this.redis.set('turnbackhoax:last_metrics', JSON.stringify(metrics), {
      ex: 86400 // 24 hours
    });

    // Update error count if failed
    if (!success) {
      await this.redis.incr('turnbackhoax:error_count');
    } else {
      // Reset error count on success
      await this.redis.set('turnbackhoax:error_count', 0);
    }
  }

  private async shouldSkipFetch(): Promise<boolean> {
    try {
      // Check if we recently processed items
      const lastFetch = await this.redis.get('turnbackhoax:last_successful_fetch') as string | null;
      const lastProcessedGuid = await this.redis.get('turnbackhoax:last_guid') as string | null;

      console.log(`🕒 Last successful fetch: ${lastFetch || 'Never'}`);
      console.log(`🔖 Last processed GUID: ${lastProcessedGuid || 'None'}`);

      if (!lastFetch) {
        console.log('🚀 First run detected - proceeding with fetch');
        return false;
      }

      const lastFetchTime = new Date(lastFetch);
      const now = new Date();
      const timeSinceLastFetch = now.getTime() - lastFetchTime.getTime();

      // If it's been less than 5 minutes since last successful fetch, skip
      // This prevents over-fetching but allows frequent updates
      if (timeSinceLastFetch < 5 * 60 * 1000) {
        console.log(`⏭️  Skipping fetch - only ${Math.floor(timeSinceLastFetch / (1000 * 60))} minutes since last fetch`);
        return true;
      }

      // If we have a last processed GUID, check if feed has actually changed
      if (lastProcessedGuid) {
        // Quick HEAD request to check if feed has been modified
        try {
          const axios = (await import('axios')).default;
          const response = await axios.head(this.config.feedUrl, {
            headers: {
              'User-Agent': this.config.userAgent
            },
            timeout: 5000 // 5 second timeout for quick check
          });

          const lastModified = response.headers['last-modified'];
          const etag = response.headers['etag'];

          if (lastModified || etag) {
            const cacheKey = `feed:headers:${this.config.feedUrl}`;
            const cachedHeaders = await this.redis.get(cacheKey) as string | null;

            if (cachedHeaders) {
              const parsed = JSON.parse(cachedHeaders);
              // If headers haven't changed, feed likely hasn't changed
              if (parsed.lastModified === lastModified && parsed.etag === etag) {
                console.log('📋 Feed headers unchanged, likely no new content');
                return true;
              }
            }

            // Cache new headers
            await this.redis.set(cacheKey, JSON.stringify({
              lastModified,
              etag,
              checkedAt: now.toISOString()
            }), { ex: 3600 }); // Cache for 1 hour
          }
        } catch (error) {
          // If HEAD request fails, proceed with normal fetch
          console.log('⚠️  HEAD request failed, proceeding with normal fetch');
        }
      }

      return false; // Don't skip

    } catch (error) {
      console.warn('Error in shouldSkipFetch:', error);
      return false; // On error, don't skip to ensure we don't miss updates
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Health check method
  async getHealthStatus(): Promise<{
    lastFetch: string | null;
    lastGuid: string | null;
    errorCount: number;
    isHealthy: boolean;
  }> {
    try {
      const results = await Promise.all([
        this.redis.get('turnbackhoax:last_fetch'),
        this.redis.get('turnbackhoax:last_guid'),
        this.redis.get('turnbackhoax:error_count')
      ]);

      const [lastFetch, lastGuid, errorCount] = results as [string | null, string | null, string | null];

      const errorCountNum = parseInt(errorCount || '0');
      const isHealthy = errorCountNum < 5; // Consider unhealthy if 5+ consecutive errors

      return {
        lastFetch: lastFetch || null,
        lastGuid: lastGuid || null,
        errorCount: errorCountNum,
        isHealthy
      };
    } catch (error) {
      console.error('Health check error:', error);
      return {
        lastFetch: null,
        lastGuid: null,
        errorCount: 0,
        isHealthy: false
      };
    }
  }
}

// Export singleton instance
export const rssFetcher = new TurnBackHoaxFetcher();

