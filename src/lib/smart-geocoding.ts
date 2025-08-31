import { geocodeWithSerp, SerpGeocodeResult } from './serp-geocoding';
import { globalRateLimiter } from './rate-limiter';
import {
  getCachedGeocode,
  storeGeocodeInCache,
  updateCacheUsage,
  cachedToUnifiedResult,
  UnifiedGeocodeResult
} from './geocoding-cache';

/**
 * Smart geocoding function that uses cache-first approach
 * Falls back to API calls only when cache misses occur
 */
export async function smartGeocodeLocation(location: string): Promise<UnifiedGeocodeResult> {
  try {
    // Step 1: Check cache first
    console.log(`🔍 Checking cache for location: "${location}"`);
    const cached = await getCachedGeocode(location);

    if (cached) {
      console.log(`✅ Cache hit! Using cached result for: "${location}"`);
      await updateCacheUsage(cached.id);
      return cachedToUnifiedResult(cached);
    }

    console.log(`❌ Cache miss for: "${location}" - calling APIs`);

    // Step 2: Apply rate limiting before API calls
    await globalRateLimiter.waitForNextCall();

    // Step 3: Try geocoding with both services concurrently
    console.log(`🌐 Geocoding concurrently with SERP: "${location}"`);

    const [serpResult] = await Promise.allSettled([
      geocodeWithSerp(location)
    ]);

    // Step 4: Use best available result
    let result: UnifiedGeocodeResult;
    let source: 'serp';

    if (serpResult.status === 'fulfilled' && serpResult.value.success) {
      result = convertSerpToUnified(serpResult.value);
      source = 'serp';
      console.log(`✅ SERP geocoding successful for: "${location}"`);
    } else {
      // Both services failed
      const serpError = serpResult.status === 'rejected' ? serpResult.reason :
                       serpResult.status === 'fulfilled' ? serpResult.value.error : 'Unknown error';

      console.log(`❌ All geocoding attempts failed for: "${location}"`);
      console.log(`   SERP error: ${serpError}`);

      result = {
        success: false,
      };
      source = 'serp'; // Default fallback
    }

    // Step 5: Cache successful results for future use
    if (result.success) {
      await storeGeocodeInCache(location, result, source);
    }

    return result;

  } catch (error) {
    console.error(`❌ Error in smart geocoding for "${location}":`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown geocoding error'
    };
  }
}

/**
 * Convert SERP geocoding result to unified format
 */
function convertSerpToUnified(serpResult: SerpGeocodeResult): UnifiedGeocodeResult {
  return {
    success: serpResult.success,
    lat: serpResult.lat,
    lng: serpResult.lng,
    formattedAddress: serpResult.formatted_address,
    source: 'serp',
    cached: false
  };
}


/**
 * Batch geocoding for multiple locations (with cache optimization)
 */
export async function smartGeocodeLocations(locations: string[]): Promise<Map<string, UnifiedGeocodeResult>> {
  const results = new Map<string, UnifiedGeocodeResult>();

  // Process locations in smaller batches to avoid overwhelming the cache and APIs
  const BATCH_SIZE = 5;

  for (let i = 0; i < locations.length; i += BATCH_SIZE) {
    const batch = locations.slice(i, i + BATCH_SIZE);
    console.log(`🔄 Processing geocoding batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(locations.length / BATCH_SIZE)} (${batch.length} locations)`);

    // Process batch concurrently
    const batchPromises = batch.map(async (location) => {
      const result = await smartGeocodeLocation(location);
      return { location, result };
    });

    const batchResults = await Promise.all(batchPromises);

    // Store results
    batchResults.forEach(({ location, result }) => {
      results.set(location, result);
    });

    // Small delay between batches to be respectful to APIs
    if (i + BATCH_SIZE < locations.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return results;
}
