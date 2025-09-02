import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!
});

export async function POST(request: NextRequest) {
  try {
    console.log('🧹 Clearing RSS cache to fix stuck state...');
    
    // Clear all RSS-related cache keys
    const keysToDelete = [
      'turnbackhoax:last_guid',
      'turnbackhoax:last_guid_timestamp', 
      'turnbackhoax:last_successful_fetch',
      'turnbackhoax:new_items',
      'turnbackhoax:last_fetch'
    ];
    
    const results: Record<string, boolean> = {};
    
    for (const key of keysToDelete) {
      const result = await redis.del(key);
      results[key] = result > 0;
      console.log(`🗑️  ${key}: ${result > 0 ? 'DELETED' : 'NOT FOUND'}`);
    }
    
    console.log('✅ RSS cache cleared successfully!');
    
    // Trigger immediate fetch
    console.log('🚀 Triggering immediate RSS fetch...');
    
    const baseUrl = process.env.NODE_ENV === 'production'
      ? 'https://safe.100ai.id'
      : 'http://localhost:3000';
      
    const fetchResponse = await fetch(`${baseUrl}/api/rss/cron`);
    const fetchResult = await fetchResponse.json();
    
    return NextResponse.json({
      success: true,
      message: 'RSS cache cleared and fetch triggered',
      cacheCleared: results,
      fetchResult,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error clearing RSS cache:', error);
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

export async function GET() {
  return NextResponse.json({
    success: false,
    error: 'Use POST method to clear RSS cache',
    usage: 'POST /api/debug/clear-rss-cache'
  }, { status: 405 });
}
