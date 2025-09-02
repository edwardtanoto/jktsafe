import { NextRequest, NextResponse } from 'next/server';
import { rssFetcher } from '@/lib/rss-fetcher';
import { hoaxParser } from '@/lib/hoax-content-parser';
import { hoaxProcessor } from '@/lib/hoax-data-processor';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Rate limiting for RSS fetch endpoint
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!
});

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, '1 h'), // 60 requests per hour
});

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const ip = request.headers.get('x-forwarded-for') || 'anonymous';
    const { success } = await ratelimit.limit(ip);

    if (!success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded' },
        { status: 429 }
      );
    }

    // Authenticate request (simple API key check)
    // Allow cron jobs with special header authentication
    const authHeader = request.headers.get('authorization');
    const cronHeader = request.headers.get('x-internal-cron');
    const cronSecret = request.headers.get('x-rss-secret');
    const expectedKey = process.env.RSS_API_KEY;
    const cronRssSecret = process.env.CRON_SECRET || expectedKey; // Fallback to RSS_API_KEY

    // Check authentication - allow either Bearer token OR cron internal auth
    const isAuthenticated =
      (expectedKey && authHeader === `Bearer ${expectedKey}`) || // Normal API auth
      (cronHeader === 'true' && cronSecret === cronRssSecret); // Cron job auth

    if (!isAuthenticated) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('Starting RSS fetch process...');

    // Step 1: Fetch RSS feed
    const fetchResult = await rssFetcher.fetchAndProcess();

    if (!fetchResult.success) {
      console.error('RSS fetch failed:', fetchResult.error);
      return NextResponse.json(
        {
          success: false,
          error: fetchResult.error,
          step: 'fetch'
        },
        { status: 500 }
      );
    }

    if (fetchResult.newItems === 0) {
      console.log('No new items to process');
      return NextResponse.json({
        success: true,
        message: 'No new items to process',
        newItems: 0
      });
    }

    console.log(`Found ${fetchResult.newItems} new items`);

    // Step 2: Get new items from cache
    const cachedItems = await redis.get('turnbackhoax:new_items');
    if (!cachedItems) {
      return NextResponse.json(
        { success: false, error: 'No cached items found', step: 'cache' },
        { status: 500 }
      );
    }

    const newItems = JSON.parse(cachedItems as string);
    console.log(`Processing ${newItems.length} cached items`);

    // Step 3: Parse items into hoax data
    const parsedHoaxes = [];
    for (const item of newItems) {
      try {
        const rssItem = {
          guid: item.guid,
          title: item.title,
          description: item.description,
          link: item.link,
          pubDate: item.pubDate,
          'dc:creator': item.creator
        };

        const parsed = hoaxParser.parseItem(rssItem);
        if (parsed) {
          parsedHoaxes.push(parsed);
        }
      } catch (error) {
        console.error('Error parsing item:', error);
        // Continue with other items
      }
    }

    console.log(`Successfully parsed ${parsedHoaxes.length} out of ${newItems.length} items`);

    if (parsedHoaxes.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No valid hoax items found',
        parsed: 0,
        total: newItems.length
      });
    }

    // Step 4: Process and store hoaxes
    const processingResult = await hoaxProcessor.processBatch(parsedHoaxes);

    console.log(`Processing complete: ${processingResult.successful} successful, ${processingResult.failed} failed`);

    // Step 5: Clean up cache
    await redis.del('turnbackhoax:new_items');

    // Step 6: Update RSS metrics
    await updateRSSMetrics(fetchResult.newItems, processingResult.successful, processingResult.failed);

    const response = {
      success: true,
      message: 'RSS fetch and processing complete',
      stats: {
        fetched: fetchResult.newItems,
        parsed: parsedHoaxes.length,
        processed: processingResult.successful,
        failed: processingResult.failed
      },
      timestamp: new Date().toISOString()
    };

    console.log('RSS processing complete - returning response');
    return NextResponse.json(response);

  } catch (error) {
    console.error('RSS fetch API error:', error);

    // Update error metrics
    await redis.incr('rss:api_errors');

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

// GET endpoint for health check and manual trigger
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    if (action === 'health') {
      // Health check
      const [fetcherHealth, processorHealth] = await Promise.all([
        rssFetcher.getHealthStatus(),
        hoaxProcessor.healthCheck()
      ]);

      return NextResponse.json({
        success: true,
        health: {
          rssFetcher: fetcherHealth,
          hoaxProcessor: processorHealth,
          overall: fetcherHealth.isHealthy && processorHealth.database && processorHealth.redis
        },
        timestamp: new Date().toISOString()
      });
    }

    if (action === 'stats') {
      // Get processing statistics
      const [hoaxStats, rssMetrics] = await Promise.all([
        hoaxProcessor.getStats(),
        getRSSMetrics()
      ]);

      return NextResponse.json({
        success: true,
        stats: {
          hoaxes: hoaxStats,
          rss: rssMetrics
        }
      });
    }

    // Default: Return endpoint info
    return NextResponse.json({
      success: true,
      message: 'RSS Fetch API',
      endpoints: {
        'POST /api/rss/fetch': 'Trigger RSS fetch and processing',
        'GET /api/rss/fetch?action=health': 'Health check',
        'GET /api/rss/fetch?action=stats': 'Processing statistics'
      },
      lastFetch: await redis.get('turnbackhoax:last_fetch'),
      rateLimit: '60 requests per hour'
    });

  } catch (error) {
    console.error('RSS fetch GET error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    );
  }
}

async function updateRSSMetrics(fetched: number, successful: number, failed: number): Promise<void> {
  try {
    const metrics = {
      timestamp: new Date().toISOString(),
      fetched,
      successful,
      failed,
      successRate: successful / Math.max(fetched, 1)
    };

    await redis.set('rss:last_metrics', JSON.stringify(metrics), {
      ex: 86400 * 7 // 7 days
    });

    // Update counters
    await redis.incrby('rss:total_fetched', fetched);
    await redis.incrby('rss:total_processed', successful);
    await redis.incrby('rss:total_failed', failed);

  } catch (error) {
    console.error('Error updating RSS metrics:', error);
  }
}

async function getRSSMetrics(): Promise<Record<string, unknown>> {
  try {
    const [totalFetched, totalProcessed, totalFailed, lastMetrics] = await Promise.all([
      redis.get('rss:total_fetched'),
      redis.get('rss:total_processed'),
      redis.get('rss:total_failed'),
      redis.get('rss:last_metrics')
    ]);

    return {
      totalFetched: parseInt(String(totalFetched || '0')),
      totalProcessed: parseInt(String(totalProcessed || '0')),
      totalFailed: parseInt(String(totalFailed || '0')),
      lastMetrics: lastMetrics ? JSON.parse(String(lastMetrics)) : null
    };

  } catch (error) {
    console.error('Error getting RSS metrics:', error);
    return {
      totalFetched: 0,
      totalProcessed: 0,
      totalFailed: 0,
      lastMetrics: null
    };
  }
}
