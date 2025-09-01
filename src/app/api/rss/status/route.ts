import { NextRequest, NextResponse } from 'next/server';
import { rssFetcher } from '@/lib/rss-fetcher';
import { hoaxProcessor } from '@/lib/hoax-data-processor';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!
});

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const detailed = url.searchParams.get('detailed') === 'true';

    // Get RSS fetcher health
    const fetcherHealth = await rssFetcher.getHealthStatus();

    // Get hoax processor health
    const processorHealth = await hoaxProcessor.healthCheck();

    // Get database statistics
    const hoaxStats = await hoaxProcessor.getStats();

    // Get Redis/cache statistics
    const cacheStats = await getCacheStats();

    const overallHealth = {
      status: (fetcherHealth.isHealthy && processorHealth.database && processorHealth.redis)
        ? 'healthy'
        : 'unhealthy',
      timestamp: new Date().toISOString(),
      services: {
        rss_fetcher: fetcherHealth.isHealthy ? 'healthy' : 'unhealthy',
        hoax_processor: {
          database: processorHealth.database ? 'healthy' : 'unhealthy',
          redis: processorHealth.redis ? 'healthy' : 'unhealthy',
          openai: processorHealth.openai ? 'healthy' : 'unhealthy'
        }
      }
    };

    if (!detailed) {
      // Basic health check response
      return NextResponse.json({
        status: overallHealth.status,
        message: overallHealth.status === 'healthy'
          ? 'RSS integration is working correctly'
          : 'Some services are experiencing issues',
        lastFetch: fetcherHealth.lastFetch,
        totalHoaxes: hoaxStats.total,
        timestamp: overallHealth.timestamp
      });
    }

    // Detailed health check response
    const detailedResponse = {
      ...overallHealth,
      rss_fetcher: {
        lastFetch: fetcherHealth.lastFetch,
        lastGuid: fetcherHealth.lastGuid,
        errorCount: fetcherHealth.errorCount,
        isHealthy: fetcherHealth.isHealthy
      },
      hoax_processor: {
        database: processorHealth.database,
        redis: processorHealth.redis,
        openai: processorHealth.openai
      },
      database: {
        totalHoaxes: hoaxStats.total,
        hoaxCategories: hoaxStats.byCategory,
        recentHoaxes: hoaxStats.recent,
        hoaxesWithEmbeddings: hoaxStats.withEmbeddings
      },
      cache: cacheStats,
      configuration: {
        feedUrl: 'https://turnbackhoax.id/feed/',
        pollingInterval: '15 minutes',
        maxRetries: 3,
        rateLimit: '10 requests/hour for fetch endpoint'
      }
    };

    return NextResponse.json(detailedResponse);

  } catch (error) {
    console.error('RSS status API error:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to check RSS system status',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

async function getCacheStats(): Promise<any> {
  try {
    const keys = [
      'turnbackhoax:last_guid',
      'turnbackhoax:last_fetch',
      'turnbackhoax:error_count',
      'hoax:stats:category:SALAH',
      'hoax:stats:category:PENIPUAN',
      'hoax:stats:total'
    ];

    const values = await Promise.all(
      keys.map(key => redis.get(key).catch(() => null))
    );

    const stats: Record<string, any> = {};
    keys.forEach((key, index) => {
      const cleanKey = key.replace('turnbackhoax:', '').replace('hoax:stats:', '');
      stats[cleanKey] = values[index];
    });

    return {
      ...stats,
      cacheHitRate: await calculateCacheHitRate(),
      memoryUsage: 'N/A' // Upstash doesn't provide memory usage stats
    };

  } catch (error) {
    console.error('Error getting cache stats:', error);
    return {
      error: 'Failed to retrieve cache statistics',
      cacheHitRate: 0,
      memoryUsage: 'N/A'
    };
  }
}

async function calculateCacheHitRate(): Promise<number> {
  try {
    // This is a simplified cache hit rate calculation
    // In a production system, you'd track this more precisely
    const totalRequests = await redis.get('cache:total_requests');
    const cacheHits = await redis.get('cache:hits');

    if (!totalRequests || !cacheHits) {
      return 0; // No data available
    }

    const hitRate = parseInt(cacheHits) / parseInt(totalRequests);
    return Math.round(hitRate * 100) / 100; // Round to 2 decimal places

  } catch (error) {
    console.error('Error calculating cache hit rate:', error);
    return 0;
  }
}

// POST endpoint for manual testing/triggering
export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json();

    if (action === 'test_fetch') {
      // Test RSS fetch without processing
      console.log('Testing RSS fetch...');
      const result = await rssFetcher.fetchAndProcess();

      return NextResponse.json({
        success: result.success,
        message: result.success
          ? `Successfully fetched ${result.newItems} new items`
          : `Fetch failed: ${result.error}`,
        newItems: result.newItems,
        timestamp: new Date().toISOString()
      });
    }

    if (action === 'clear_cache') {
      // Clear RSS-related cache
      const keysToDelete = [
        'turnbackhoax:last_guid',
        'turnbackhoax:last_fetch',
        'turnbackhoax:error_count',
        'turnbackhoax:new_items',
        'hoax:stats:category:SALAH',
        'hoax:stats:category:PENIPUAN',
        'hoax:stats:total'
      ];

      await Promise.all(keysToDelete.map(key => redis.del(key)));

      return NextResponse.json({
        success: true,
        message: 'Cache cleared successfully',
        clearedKeys: keysToDelete.length,
        timestamp: new Date().toISOString()
      });
    }

    if (action === 'reset_stats') {
      // Reset error counters and stats
      await redis.set('turnbackhoax:error_count', 0);
      await redis.set('rss:api_errors', 0);

      return NextResponse.json({
        success: true,
        message: 'Statistics reset successfully',
        timestamp: new Date().toISOString()
      });
    }

    return NextResponse.json(
      { success: false, error: 'Invalid action. Use: test_fetch, clear_cache, or reset_stats' },
      { status: 400 }
    );

  } catch (error) {
    console.error('RSS status POST error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
