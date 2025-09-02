#!/usr/bin/env node

/**
 * Emergency RSS Cache Clear Script
 * 
 * This script clears the RSS cache that might be causing the system
 * to skip new items. Run this to force the next RSS fetch to process all items.
 */

const { Redis } = require('@upstash/redis');

async function clearRSSCache() {
  console.log('🧹 Clearing RSS cache to fix stuck state...\n');
  
  // Initialize Redis
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN
  });
  
  try {
    // Clear all RSS-related cache keys
    const keysToDelete = [
      'turnbackhoax:last_guid',
      'turnbackhoax:last_guid_timestamp',
      'turnbackhoax:last_successful_fetch',
      'turnbackhoax:new_items',
      'turnbackhoax:last_fetch'
    ];
    
    console.log('🗑️  Deleting cache keys:');
    for (const key of keysToDelete) {
      const result = await redis.del(key);
      console.log(`   ${key}: ${result ? 'DELETED' : 'NOT FOUND'}`);
    }
    
    console.log('\n✅ RSS cache cleared successfully!');
    console.log('📡 Next RSS fetch will process all items as new');
    
    // Trigger immediate fetch
    console.log('\n🚀 Triggering immediate RSS fetch...');
    
    const baseUrl = 'https://safe.100ai.id';
    const response = await fetch(`${baseUrl}/api/rss/cron`);
    const result = await response.json();
    
    console.log('📊 Fetch result:', JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('❌ Error clearing cache:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  clearRSSCache().catch(console.error);
}

module.exports = { clearRSSCache };
