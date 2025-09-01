import { NextRequest, NextResponse } from 'next/server';
import { extractDetailedLocationFromTikTok } from '@/lib/openrouter';
import { smartGeocodeLocation } from '@/lib/smart-geocoding';
import { prisma } from '@/lib/prisma';

import { Root, Video } from '@/types/tiktok';

// Import shared progress tracking and rate limiter
import { scrapingProgress, updateScrapingProgress, resetScrapingProgress } from '@/lib/scraping-progress';
import { scrapeRateLimiter, checkRateLimit } from '@/lib/rate-limiter';

// Import authentication middleware
import { authenticateScrapeRequest, handleCors, getCorsHeaders } from '@/lib/auth-middleware';

// Import Pub/Sub for live updates
import { publishNewEvent, publishSystemMessage } from '@/lib/pubsub';

// Import RapidAPI key manager
import { rapidAPIManager, type ScrapeResult } from '@/lib/rapidapi-key-manager';

async function scrapeTikTokVideos(dateToday: string): Promise<Video[]> {
  try {
    console.log(`📅 Today's date: ${dateToday}`);
    console.log(`🔍 Searching for today's demo locations in Indonesia...`);

    // Simple keyword: "lokasi demo" + today's date
    const keyword = `lokasi demo ${dateToday}`;
    console.log(`🔎 Searching: "${keyword}"`);

    // Apply rate limiting before making API calls
    const rateLimitResult = await checkRateLimit(scrapeRateLimiter, 'tiktok-scrape-check');
    if (!rateLimitResult.success) {
      throw new Error('Rate limit exceeded for TikTok scraping');
    }

    // Determine if it's peak hour and choose appropriate strategy
    const isPeakHour = rapidAPIManager.isPeakHour();
    let results: ScrapeResult[];
    
    if (isPeakHour) {
      console.log(`🔥 Peak hour detected - using parallel calls for 90 videos`);
      results = await rapidAPIManager.makeParallelCalls(keyword, 90);
    } else {
      console.log(`💤 Conserve hour detected - using sequential calls for 60 videos`);
      results = await rapidAPIManager.makeSequentialCalls(keyword, 60);
    }

    // Combine all successful results
    const allVideos: Video[] = [];
    let totalVideosFound = 0;

    for (const result of results) {
      if (result.success && result.data?.code === 0 && result.data?.data?.videos) {
        const videos = result.data.data.videos;
        allVideos.push(...videos);
        totalVideosFound += videos.length;
        console.log(`✅ ${result.keyUsed}: Found ${videos.length} videos`);
      } else {
        console.log(`❌ ${result.keyUsed}: ${result.error || 'No videos found'}`);
      }
    }

    console.log(`🎯 Total videos collected: ${totalVideosFound} from ${results.length} API calls`);
    
    // Remove duplicates based on video_id
    const uniqueVideos = allVideos.filter((video, index, self) => 
      index === self.findIndex(v => v.video_id === video.video_id)
    );

    if (uniqueVideos.length !== allVideos.length) {
      console.log(`🔄 Removed ${allVideos.length - uniqueVideos.length} duplicate videos`);
    }

    console.log(`📊 Final unique videos: ${uniqueVideos.length}`);
    return uniqueVideos;

  } catch (error) {
    console.error('Error in TikTok scraping:', error);
    return [];
  }
}

async function processTikTokVideo(video: Video): Promise<boolean> {
  const startTime = Date.now();

  try {
    const tiktokUrl = `https://www.tiktok.com/@${video.author.unique_id}/video/${video.video_id}`;

    // Debug: Log TikTok link for inspection
    console.log(`🔗 TikTok Link: ${tiktokUrl}`);
    console.log(`📝 Title: ${video.title}`);
    console.log(`👤 Author: ${video.author.nickname}`);

    // Check if video already exists with timeout
    const existingEvent = await Promise.race([
      prisma.event.findFirst({
        where: {
          url: tiktokUrl
        }
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Database timeout')), 5000)
      )
    ]);

    if (existingEvent) {
      console.log(`⚠️ TikTok video already exists: ${video.video_id}`);
      return false;
    }

    // Extract detailed location using OpenRouter (enhanced AI analysis with text + image)
    console.log(`🔍 Extracting detailed location for video: ${video.video_id}`);
    console.log(`🖼️ Cover image available: ${video.cover ? 'Yes' : 'No'}`);

    let locationResult = await extractDetailedLocationFromTikTok(video);

    // Retry with exponential backoff if it fails
    if (!locationResult.success || !locationResult.exact_location) {
      console.log(`⚠️ First attempt failed, retrying detailed location extraction for video: ${video.video_id}`);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
      locationResult = await extractDetailedLocationFromTikTok(video);
    }

    if (!locationResult.success || !locationResult.exact_location) {
      console.log(`❌ No detailed location found in TikTok video after retry: ${video.video_id}`);
      return false;
    }

    console.log(`📍 Extracted exact location: "${locationResult.exact_location}"`);
    if (locationResult.all_locations && locationResult.all_locations.length > 0) {
      console.log(`📍 All locations found: ${locationResult.all_locations.join(', ')}`);
    }

    // Extract all unique locations for batch geocoding
    const locationsToGeocode = [];
    if (locationResult.exact_location) {
      locationsToGeocode.push(locationResult.exact_location);
    }
    if (locationResult.all_locations && locationResult.all_locations.length > 0) {
      // Add all locations and remove duplicates
      const uniqueLocations = [...new Set(locationResult.all_locations)];
      locationsToGeocode.push(...uniqueLocations);
    }

    // Remove duplicates while preserving order (exact_location first)
    const uniqueLocationsToGeocode = [...new Set(locationsToGeocode)];

    console.log(`🗺️ Locations to geocode: ${uniqueLocationsToGeocode.join(', ')}`);

    // Use batch geocoding for all locations
    const { smartGeocodeLocations } = await import('@/lib/smart-geocoding');
    const geocodeResults = await smartGeocodeLocations(uniqueLocationsToGeocode);

    // Find the best geocoding result
    let bestGeocodeResult = null;
    let bestLocation = null;

    for (const [location, result] of geocodeResults) {
      if (result.success) {
        // Prefer exact_location if it geocoded successfully
        if (location === locationResult.exact_location) {
          bestGeocodeResult = result;
          bestLocation = location;
          break;
        }
        // Otherwise use the first successful result
        if (!bestGeocodeResult) {
          bestGeocodeResult = result;
          bestLocation = location;
        }
      }
    }

    if (!bestGeocodeResult) {
      console.log(`❌ Failed to geocode any location for video: ${video.video_id}`);
      console.log(`   Tried locations: ${uniqueLocationsToGeocode.join(', ')}`);
      return false;
    }

    console.log(`✅ Best geocoding result: "${bestLocation}"`);
    console.log(`📌 Coordinates: ${bestGeocodeResult.lat}, ${bestGeocodeResult.lng}`);

    // Log geocoding result details
    if (bestGeocodeResult.formattedAddress) {
      console.log(`🏷️ Formatted address: ${bestGeocodeResult.formattedAddress}`);
    }
    if (bestGeocodeResult.cached) {
      console.log(`💾 Result from cache`);
    } else {
      console.log(`🌐 Result from API (${bestGeocodeResult.source})`);
    }

    // Generate Google Maps URL for coordinates verification
    const googleMapsUrl = `https://www.google.com/maps?q=${bestGeocodeResult.lat},${bestGeocodeResult.lng}`;

    // Convert TikTok create_time (Unix timestamp) to Date
    const originalCreatedAt = new Date(video.create_time * 1000);
    
    // Create or update event in database using upsert to prevent duplicates
    try {
      const result = await prisma.event.upsert({
        where: {
          url: tiktokUrl
        },
        update: {
          title: `Demo Activity - ${video.author.nickname}`,
          description: video.title,
          lat: bestGeocodeResult.lat!,
          lng: bestGeocodeResult.lng!,
          verified: false,
          extractedLocation: bestLocation,
          googleMapsUrl: googleMapsUrl,
          originalCreatedAt: originalCreatedAt,
          updatedAt: new Date()
        },
        create: {
          title: `Demo Activity - ${video.author.nickname}`,
          description: video.title,
          lat: bestGeocodeResult.lat!,
          lng: bestGeocodeResult.lng!,
          source: 'TikTok',
          url: tiktokUrl,
          verified: false,
          type: 'protest',
          extractedLocation: bestLocation,
          googleMapsUrl: googleMapsUrl,
          originalCreatedAt: originalCreatedAt
        }
      });

      // Publish new event to Redis for live updates
      await publishNewEvent(result.id, 'created', {
        title: result.title,
        lat: bestGeocodeResult.lat,
        lng: bestGeocodeResult.lng,
        type: result.type,
        source: result.source,
        extractedLocation: bestLocation
      });

    } catch (dbError) {
      if (dbError instanceof Error && dbError.message.includes('Unique constraint')) {
        console.log(`⚠️ Event already exists for URL: ${tiktokUrl} - skipping`);
        return false; // Don't count as processed since it already existed
      }
      throw dbError; // Re-throw other database errors
    }

    const processingTime = Date.now() - startTime;
    console.log(`✅ Successfully processed TikTok video: ${video.video_id}`);
    console.log(`📍 Location: ${bestLocation} (${bestGeocodeResult.lat}, ${bestGeocodeResult.lng})`);
    console.log(`🔗 TikTok: ${tiktokUrl}`);
    console.log(`⏱️ Processing time: ${processingTime}ms`);
    console.log(`---`);

    return true;

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(`❌ Error processing TikTok video ${video.video_id} (${processingTime}ms):`, error);
    return false;
  }
}

export async function GET(request: NextRequest) {
  // Handle CORS preflight
  const corsResponse = handleCors(request);
  if (corsResponse) return corsResponse;

  // Check if this is a cron job request (internal call from /api/scrape/cron)
  const isInternalCronCall = request.headers.get('x-internal-cron') === 'true';

  // Authenticate scrape request (skip for internal cron calls)
  if (!isInternalCronCall) {
    const auth = authenticateScrapeRequest(request);
    if (!auth.isValid) {
      return NextResponse.json(
        {
          success: false,
          error: auth.error,
          message: 'Authentication required for scraping operations'
        },
        {
          status: 401,
          headers: getCorsHeaders()
        }
      );
    }
  }

  console.log('🔐 Scrape request authenticated successfully');

  const scrapingStartTime = Date.now();

  try {
    // Check if scraping is already in progress
    if (scrapingProgress.isActive) {
      return NextResponse.json({
        success: false,
        error: 'Scraping is already in progress',
        progress: {
          current: scrapingProgress.processedVideos,
          total: scrapingProgress.totalVideos,
          percentage: scrapingProgress.totalVideos > 0 ?
            Math.round((scrapingProgress.processedVideos / scrapingProgress.totalVideos) * 100) : 0
        }
      }, {
        status: 409,
        headers: getCorsHeaders()
      }); // Conflict status
    }

    console.log('🚀 Starting concurrent TikTok demo scraping...');

    // Check rate limiter status
    const rateLimitCheck = await checkRateLimit(scrapeRateLimiter, 'tiktok-scrape-check');

    if (!rateLimitCheck.success) {
      return NextResponse.json({
        success: false,
        error: `Rate limit exceeded. Try again in ${Math.ceil((rateLimitCheck.reset || 0) / 1000)} seconds.`,
        rateLimit: {
          remainingCalls: rateLimitCheck.remaining || 0,
          resetInSeconds: Math.ceil((rateLimitCheck.reset || 0) / 1000)
        }
      }, {
        status: 429,
        headers: getCorsHeaders()
      }); // Too Many Requests
    }

    console.log(`📊 Rate limiter: ${rateLimitCheck.remaining} calls remaining, resets in ${Math.ceil((rateLimitCheck.reset || 0) / 1000)}s`);

    // Initialize progress tracking
    updateScrapingProgress({
      isActive: true,
      totalVideos: 0,
      processedVideos: 0,
      currentBatch: 0,
      totalBatches: 0,
      startTime: scrapingStartTime,
      lastUpdate: new Date().toISOString()
    });

    // Get today's date for reference
    const today = new Date();
    const day = today.getDate().toString().padStart(2, '0');
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    const year = today.getFullYear();
    const dateToday = `${day}/${month}/${year}`;

    // Scrape TikTok videos with simple keyword
    const videos = await scrapeTikTokVideos(dateToday);
    console.log(`📹 Found ${videos.length} TikTok videos for "lokasi demo ${dateToday}"`);
    console.log(`⚡ Processing with concurrent batches (3 videos per batch)`);

    // Update progress with total count
    scrapingProgress.totalVideos = videos.length;
    scrapingProgress.totalBatches = Math.ceil(videos.length / 3);
    scrapingProgress.lastUpdate = new Date().toISOString();

    let processedCount = 0;

    // Process videos in concurrent batches to avoid overwhelming APIs
    const BATCH_SIZE = 3; // Process 3 videos concurrently
    const DELAY_BETWEEN_BATCHES = 2000; // 2 second delay between batches

    for (let i = 0; i < videos.length; i += BATCH_SIZE) {
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const batch = videos.slice(i, i + BATCH_SIZE);

      // Update progress for current batch
      scrapingProgress.currentBatch = batchNumber;
      scrapingProgress.lastUpdate = new Date().toISOString();

      console.log(`🔄 Processing batch ${batchNumber}/${scrapingProgress.totalBatches} (${batch.length} videos)`);

      // Process batch concurrently
      const batchPromises = batch.map(async (video) => {
        try {
          const success = await processTikTokVideo(video);
          // Update processed count in progress tracking
          if (success) {
            scrapingProgress.processedVideos++;
            scrapingProgress.lastUpdate = new Date().toISOString();
          }
          return success ? 1 : 0;
        } catch (error) {
          console.error(`Failed to process video ${video.video_id}:`, error);
          return 0;
        }
      });

      // Wait for all videos in batch to complete
      const batchResults = await Promise.all(batchPromises);
      processedCount += batchResults.reduce((sum: number, result: number) => sum + result, 0);

      console.log(`✅ Batch ${batchNumber} completed: ${batchResults.reduce((sum: number, result: number) => sum + result, 0)}/${batch.length} videos processed`);
      console.log(`📊 Progress: ${scrapingProgress.processedVideos}/${scrapingProgress.totalVideos} videos processed`);

      // Delay between batches (except for the last batch)
      if (i + BATCH_SIZE < videos.length) {
        console.log(`⏳ Waiting ${DELAY_BETWEEN_BATCHES}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
      }
    }

    const totalTime = Date.now() - scrapingStartTime;
    const avgTimePerVideo = processedCount > 0 ? Math.round(totalTime / processedCount) : 0;

    // Mark scraping as completed
    updateScrapingProgress({
      ...scrapingProgress,
      isActive: false,
      lastUpdate: new Date().toISOString()
    });

    console.log(`🎉 Scraping completed in ${totalTime}ms`);
    console.log(`📊 Average processing time per video: ${avgTimePerVideo}ms`);
    console.log(`🚀 Concurrent processing speedup: ~${Math.round((videos.length * 1000) / totalTime)}x faster than sequential`);

    // Publish scraping completion message
    await publishSystemMessage('scrape_completed', `Processed ${processedCount} demo locations from ${videos.length} TikTok videos`);

    // Get final rate limiter status
    const finalRateLimitCheck = await checkRateLimit(scrapeRateLimiter, 'tiktok-scrape-final');
    const finalRemainingCalls = finalRateLimitCheck.remaining || 0;
    const finalTimeUntilReset = finalRateLimitCheck.reset || 0;

    // Get key usage statistics
    const keyStats = rapidAPIManager.getKeyUsageStats();

    return NextResponse.json({
      success: true,
      videos: videos.length,
      processed: processedCount,
      date: dateToday,
      keyword: `lokasi demo ${dateToday}`,
      totalTime: totalTime,
      avgTimePerVideo: avgTimePerVideo,
      isPeakHour: rapidAPIManager.isPeakHour(),
      keyUsage: keyStats,
      rateLimit: {
        remainingCalls: finalRemainingCalls,
        resetInSeconds: Math.ceil(finalTimeUntilReset / 1000)
      },
      message: `Processed ${processedCount} demo locations from ${videos.length} TikTok videos in ${totalTime}ms`
    }, { headers: getCorsHeaders() });

  } catch (error) {
    const totalTime = Date.now() - scrapingStartTime;

    // Mark scraping as failed
    updateScrapingProgress({
      ...scrapingProgress,
      isActive: false,
      lastUpdate: new Date().toISOString()
    });

    console.error(`❌ Error in TikTok scraping API (${totalTime}ms):`, error);
    return NextResponse.json(
      { success: false, error: 'Failed to scrape TikTok videos' },
      {
        status: 500,
        headers: getCorsHeaders()
      }
    );
  }
}