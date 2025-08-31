import { prisma } from './prisma';

export interface CachedGeocodeResult {
  id: number;
  locationText: string;
  latitude: number;
  longitude: number;
  formattedAddress?: string;
  source: string;
  confidenceScore?: number;
  createdAt: Date;
  lastUsedAt: Date;
  usageCount: number;
}

export interface UnifiedGeocodeResult {
  success: boolean;
  lat?: number;
  lng?: number;
  formattedAddress?: string;
  source?: string;
  cached?: boolean;
  error?: string;
}

// Cache validity constants
const CACHE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days
const CACHE_UNUSED_THRESHOLD = 7 * 24 * 60 * 60 * 1000; // 7 days
const CACHE_MAX_ENTRIES = 10000; // Maximum cache entries

/**
 * Check if a cached geocoding result is still valid
 */
function isCacheValid(cachedEntry: CachedGeocodeResult): boolean {
  const now = Date.now();

  // Check if cache entry is too old
  const age = now - cachedEntry.createdAt.getTime();
  if (age > CACHE_MAX_AGE) {
    console.log(`⚠️ Cache entry too old (${Math.round(age / (24 * 60 * 60 * 1000))} days): ${cachedEntry.locationText}`);
    return false;
  }

  // Check if location has been used recently enough
  const timeSinceLastUse = now - cachedEntry.lastUsedAt.getTime();
  if (timeSinceLastUse > CACHE_UNUSED_THRESHOLD) {
    console.log(`⚠️ Cache entry not used recently (${Math.round(timeSinceLastUse / (24 * 60 * 60 * 1000))} days): ${cachedEntry.locationText}`);
    return false;
  }

  return true;
}

/**
 * Get cached geocoding result for a location
 */
export async function getCachedGeocode(location: string): Promise<CachedGeocodeResult | null> {
  try {
    const cachedEntry = await prisma.geocodeCache.findFirst({
      where: {
        locationText: location
      }
    });

    if (!cachedEntry) {
      return null;
    }

    if (!isCacheValid(cachedEntry)) {
      // Remove invalid cache entry
      await prisma.geocodeCache.delete({
        where: { id: cachedEntry.id }
      });
      return null;
    }

    return cachedEntry;
  } catch (error) {
    console.error('Error checking geocoding cache:', error);
    return null;
  }
}

/**
 * Store a geocoding result in the cache
 */
export async function storeGeocodeInCache(
  location: string,
  result: UnifiedGeocodeResult,
  source: 'serp' | 'mapbox'
): Promise<void> {
  if (!result.success || !result.lat || !result.lng) {
    console.log(`⚠️ Not caching failed geocoding result for: ${location}`);
    return;
  }

  try {
    // Check if we need to clean up old entries
    await cleanupCacheIfNeeded();

    await prisma.geocodeCache.upsert({
      where: {
        locationText: location
      },
      update: {
        latitude: result.lat,
        longitude: result.lng,
        formattedAddress: result.formattedAddress,
        source: source,
        lastUsedAt: new Date(),
        usageCount: {
          increment: 1
        }
      },
      create: {
        locationText: location,
        latitude: result.lat,
        longitude: result.lng,
        formattedAddress: result.formattedAddress,
        source: source,
        confidenceScore: 0.9, // Default confidence for new entries
        usageCount: 1
      }
    });

    console.log(`💾 Cached geocoding result for: "${location}" (${source})`);
  } catch (error) {
    console.error('Error storing geocoding result in cache:', error);
  }
}

/**
 * Update cache usage statistics when a cached result is used
 */
export async function updateCacheUsage(cacheId: number): Promise<void> {
  try {
    await prisma.geocodeCache.update({
      where: { id: cacheId },
      data: {
        lastUsedAt: new Date(),
        usageCount: {
          increment: 1
        }
      }
    });
  } catch (error) {
    console.error('Error updating cache usage:', error);
  }
}

/**
 * Clean up old/unused cache entries if cache is getting too large
 */
async function cleanupCacheIfNeeded(): Promise<void> {
  try {
    const cacheCount = await prisma.geocodeCache.count();

    if (cacheCount >= CACHE_MAX_ENTRIES) {
      console.log(`🧹 Cleaning up geocoding cache (${cacheCount} entries)`);

      // Remove oldest entries first
      const entriesToDelete = await prisma.geocodeCache.findMany({
        orderBy: { lastUsedAt: 'asc' },
        take: Math.floor(CACHE_MAX_ENTRIES * 0.2) // Remove 20% of entries
      });

      if (entriesToDelete.length > 0) {
        await prisma.geocodeCache.deleteMany({
          where: {
            id: {
              in: entriesToDelete.map(entry => entry.id)
            }
          }
        });

        console.log(`🗑️ Removed ${entriesToDelete.length} old cache entries`);
      }
    }
  } catch (error) {
    console.error('Error cleaning up geocoding cache:', error);
  }
}

/**
 * Get cache statistics for monitoring
 */
export async function getCacheStats() {
  try {
    const totalEntries = await prisma.geocodeCache.count();
    const totalUsage = await prisma.geocodeCache.aggregate({
      _sum: { usageCount: true }
    });

    const recentEntries = await prisma.geocodeCache.count({
      where: {
        lastUsedAt: {
          gte: new Date(Date.now() - CACHE_UNUSED_THRESHOLD)
        }
      }
    });

    return {
      totalEntries,
      totalUsage: totalUsage._sum.usageCount || 0,
      recentEntries,
      cacheHitRate: totalUsage._sum.usageCount ? Math.round((totalUsage._sum.usageCount / totalEntries) * 100) / 100 : 0,
      maxEntries: CACHE_MAX_ENTRIES,
      cacheUtilizationPercent: Math.round((totalEntries / CACHE_MAX_ENTRIES) * 100)
    };
  } catch (error) {
    console.error('Error getting cache stats:', error);
    return null;
  }
}

/**
 * Clear all cache entries (admin function)
 */
export async function clearGeocodingCache(): Promise<number> {
  try {
    const result = await prisma.geocodeCache.deleteMany();
    console.log(`🗑️ Cleared ${result.count} geocoding cache entries`);
    return result.count;
  } catch (error) {
    console.error('Error clearing geocoding cache:', error);
    return 0;
  }
}

/**
 * Convert cached result to unified format
 */
export function cachedToUnifiedResult(cached: CachedGeocodeResult): UnifiedGeocodeResult {
  return {
    success: true,
    lat: cached.latitude,
    lng: cached.longitude,
    formattedAddress: cached.formattedAddress,
    source: cached.source,
    cached: true
  };
}
