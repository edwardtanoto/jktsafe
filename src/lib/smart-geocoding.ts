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
 * Google Maps Geocoding API result interface
 */
export interface GoogleMapsGeocodeResult {
  success: boolean;
  lat?: number;
  lng?: number;
  formatted_address?: string;
  error?: string;
}

/**
 * Geocode location using Google Maps Geocoding API
 */
async function geocodeWithGoogleMaps(location: string): Promise<GoogleMapsGeocodeResult> {
  try {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
    
    if (!apiKey) {
      return {
        success: false,
        error: 'Google Maps API key not configured'
      };
    }

    // Use Google Geocoding API with Indonesian bias
    const params = new URLSearchParams({
      address: location,
      key: apiKey,
      language: 'id',
      region: 'id' // Bias towards Indonesia
    });

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`
    );

    if (!response.ok) {
      throw new Error(`Google Geocoding API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const result = data.results[0];
      const location = result.geometry.location;
      
      return {
        success: true,
        lat: location.lat,
        lng: location.lng,
        formatted_address: result.formatted_address
      };
    } else if (data.status === 'ZERO_RESULTS') {
      return {
        success: false,
        error: 'No results found'
      };
    } else {
      return {
        success: false,
        error: data.error_message || `Google Geocoding failed with status: ${data.status}`
      };
    }

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown Google Geocoding error'
    };
  }
}

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

    // Step 3: Try SERP first, then Google Maps as fallback
    console.log(`🌐 Trying SERP geocoding for: "${location}"`);
    const serpResult = await geocodeWithSerp(location);

    let result: UnifiedGeocodeResult;
    let source: 'serp' | 'google';

    if (serpResult.success) {
      result = convertSerpToUnified(serpResult);
      source = 'serp';
      console.log(`✅ SERP geocoding successful for: "${location}"`);
    } else {
      console.log(`❌ SERP failed for "${location}": ${serpResult.error}`);
      console.log(`🗺️ Trying Google Maps geocoding as fallback...`);
      
      // Fallback to Google Maps
      const googleResult = await geocodeWithGoogleMaps(location);
      
      if (googleResult.success) {
        result = convertGoogleMapsToUnified(googleResult);
        source = 'google';
        console.log(`✅ Google Maps geocoding successful for: "${location}"`);
      } else {
        console.log(`❌ All geocoding attempts failed for: "${location}"`);
        console.log(`   SERP error: ${serpResult.error}`);
        console.log(`   Google Maps error: ${googleResult.error}`);

        result = {
          success: false,
          error: `SERP: ${serpResult.error}; Google Maps: ${googleResult.error}`
        };
        source = 'serp'; // Default fallback
      }
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
 * Convert Google Maps geocoding result to unified format
 */
function convertGoogleMapsToUnified(googleResult: GoogleMapsGeocodeResult): UnifiedGeocodeResult {
  return {
    success: googleResult.success,
    lat: googleResult.lat,
    lng: googleResult.lng,
    formattedAddress: googleResult.formatted_address,
    source: 'google',
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
