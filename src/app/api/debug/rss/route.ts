import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!
});

export async function GET(request: NextRequest) {
  try {
    // Get all relevant RSS cache data
    const [
      lastGuid,
      lastFetch,
      lastSuccessfulFetch,
      newItems,
      lastMetrics,
      errorCount
    ] = await Promise.all([
      redis.get('turnbackhoax:last_guid'),
      redis.get('turnbackhoax:last_fetch'),
      redis.get('turnbackhoax:last_successful_fetch'),
      redis.get('turnbackhoax:new_items'),
      redis.get('turnbackhoax:last_metrics'),
      redis.get('turnbackhoax:error_count')
    ]);

    // Parse cached new items if they exist
    let parsedNewItems = null;
    if (newItems) {
      try {
        parsedNewItems = JSON.parse(newItems as string);
      } catch {
        parsedNewItems = 'Failed to parse cached items';
      }
    }

    // Parse last metrics if they exist
    let parsedMetrics = null;
    if (lastMetrics) {
      try {
        parsedMetrics = JSON.parse(lastMetrics as string);
      } catch {
        parsedMetrics = 'Failed to parse metrics';
      }
    }

    // Calculate time since last fetch
    let timeSinceLastFetch = null;
    if (lastSuccessfulFetch) {
      const lastFetchTime = new Date(lastSuccessfulFetch as string);
      const now = new Date();
      timeSinceLastFetch = {
        milliseconds: now.getTime() - lastFetchTime.getTime(),
        minutes: Math.floor((now.getTime() - lastFetchTime.getTime()) / (1000 * 60)),
        shouldSkip: (now.getTime() - lastFetchTime.getTime()) < (30 * 60 * 1000)
      };
    }

    return NextResponse.json({
      success: true,
      debug: {
        cache: {
          lastGuid,
          lastFetch,
          lastSuccessfulFetch,
          errorCount: errorCount || 0,
          timeSinceLastFetch,
          cachedNewItems: parsedNewItems,
          lastMetrics: parsedMetrics
        },
        analysis: {
          hasLastGuid: !!lastGuid,
          hasRecentFetch: !!lastSuccessfulFetch,
          shouldSkipFetch: timeSinceLastFetch?.shouldSkip || false,
          hasCachedItems: !!newItems,
          cacheItemCount: parsedNewItems?.length || 0
        },
        actions: {
          clearLastGuid: '/api/debug/rss?action=clear-guid',
          clearCache: '/api/debug/rss?action=clear-cache',
          forceFetch: '/api/debug/rss?action=force-fetch'
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('RSS Debug error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown debug error'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    switch (action) {
      case 'clear-guid':
        await redis.del('turnbackhoax:last_guid');
        return NextResponse.json({
          success: true,
          message: 'Cleared last GUID - next fetch will process all items'
        });

      case 'clear-cache':
        await Promise.all([
          redis.del('turnbackhoax:last_guid'),
          redis.del('turnbackhoax:last_fetch'),
          redis.del('turnbackhoax:last_successful_fetch'),
          redis.del('turnbackhoax:new_items'),
          redis.del('turnbackhoax:last_metrics'),
          redis.del('turnbackhoax:error_count')
        ]);
        return NextResponse.json({
          success: true,
          message: 'Cleared all RSS cache - next fetch will start fresh'
        });

      case 'force-fetch':
        // Clear the skip conditions
        await redis.del('turnbackhoax:last_successful_fetch');
        
        // Trigger a fetch by calling the RSS cron endpoint
        const baseUrl = process.env.NODE_ENV === 'production'
          ? 'https://safe.100ai.id'
          : 'http://localhost:3000';
          
        const response = await fetch(`${baseUrl}/api/rss/cron`);
        const result = await response.json();
        
        return NextResponse.json({
          success: true,
          message: 'Forced RSS fetch',
          result
        });

      default:
        return NextResponse.json(
          { success: false, error: 'Unknown action. Use: clear-guid, clear-cache, or force-fetch' },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('RSS Debug POST error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown debug error'
      },
      { status: 500 }
    );
  }
}
