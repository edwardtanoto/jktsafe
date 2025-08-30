import { NextRequest, NextResponse } from 'next/server';
import { extractDetailedLocationFromTikTok } from '@/lib/openrouter';
import { geocodeLocation } from '@/lib/mapbox-geocoding';
import { geocodeWithSerp } from '@/lib/serp-geocoding';
import { prisma } from '@/lib/prisma';

import { Root, Video } from '@/types/tiktok';

// Import shared progress tracking and rate limiter
import { scrapingProgress, updateScrapingProgress, resetScrapingProgress } from '@/lib/scraping-progress';
import { globalRateLimiter } from '@/lib/rate-limiter';

async function scrapeTikTokVideos(dateToday: string): Promise<Video[]> {
  try {
    console.log(`📅 Today's date: ${dateToday}`);
    console.log(`🔍 Searching for today's demo locations in Indonesia...`);

    // Simple keyword: "lokasi demo" + today's date
    const keyword = `lokasi demo ${dateToday}`;

    console.log(`🔎 Searching: "${keyword}"`);

    const url = `https://tiktok-scraper7.p.rapidapi.com/feed/search?keywords=${encodeURIComponent(keyword)}&region=id&count=30&cursor=0&publish_time=1&sort_type=0`;

    const rapidApiKey = process.env.RAPIDAPI_KEY;
    if (!rapidApiKey) {
      console.error('RAPIDAPI_KEY is not set in environment variables');
      return [];
    }

    const options = {
      method: 'GET',
      headers: {
        'x-rapidapi-key': rapidApiKey,
        'x-rapidapi-host': 'tiktok-scraper7.p.rapidapi.com'
      }
    };

    // Apply rate limiting before making API call
    await globalRateLimiter.waitForNextCall();

    const response = await fetch(url, options);
    const result: Root = await response.json();

    if (result.code === 0 && result.data?.videos) {
      console.log(`Found ${result.data.videos.length} videos for keyword: ${keyword}`);
      return result.data.videos;
    }

    console.log(`No videos found for keyword: ${keyword}`);
    return [];

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

    // Try geocoding with both services concurrently for better performance
    console.log(`🌐 Geocoding location concurrently: ${locationResult.exact_location}`);

    // Apply rate limiting before geocoding calls
    await globalRateLimiter.waitForNextCall();

    const [serpResult, mapboxResult] = await Promise.allSettled([
      geocodeWithSerp(locationResult.exact_location),
      geocodeLocation(locationResult.exact_location)
    ]);

    // Use SERP result if successful, otherwise fallback to Mapbox
    let geocodeResult;
    if (serpResult.status === 'fulfilled' && serpResult.value.success) {
      geocodeResult = serpResult.value;
      console.log(`✅ SERP geocoding successful`);
    } else if (mapboxResult.status === 'fulfilled' && mapboxResult.value.success) {
      geocodeResult = mapboxResult.value;
      console.log(`✅ Mapbox geocoding successful (fallback)`);
    } else {
      console.log(`❌ All geocoding attempts failed for location "${locationResult.exact_location}"`);
      return false;
    }

    if (!geocodeResult.success) {
      console.log(`❌ Failed to geocode location "${locationResult.exact_location}" for video: ${video.video_id}`);
      return false;
    }

    console.log(`📌 Coordinates: ${geocodeResult.lat}, ${geocodeResult.lng}`);
    if ('formatted_address' in geocodeResult && geocodeResult.formatted_address) {
      console.log(`🏷️ Formatted address: ${geocodeResult.formatted_address}`);
    }

    // Create event in database
    await prisma.event.create({
      data: {
        title: `Demo Activity - ${video.author.nickname}`,
        description: video.title,
        lat: geocodeResult.lat!,
        lng: geocodeResult.lng!,
        source: 'TikTok',
        url: tiktokUrl,
        verified: false,
        type: 'riot'
      }
    });

    const processingTime = Date.now() - startTime;
    console.log(`✅ Successfully processed TikTok video: ${video.video_id}`);
    console.log(`📍 Location: ${locationResult.exact_location} (${geocodeResult.lat}, ${geocodeResult.lng})`);
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

export async function GET(_request: NextRequest) {
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
      }, { status: 409 }); // Conflict status
    }

    console.log('🚀 Starting concurrent TikTok demo scraping...');

    // Check rate limiter status
    const remainingCalls = globalRateLimiter.getRemainingCalls();
    const timeUntilReset = globalRateLimiter.getTimeUntilReset();

    if (remainingCalls === 0) {
      return NextResponse.json({
        success: false,
        error: `Rate limit exceeded. Try again in ${Math.ceil(timeUntilReset / 1000)} seconds.`,
        rateLimit: {
          remainingCalls: 0,
          resetInSeconds: Math.ceil(timeUntilReset / 1000)
        }
      }, { status: 429 }); // Too Many Requests
    }

    console.log(`📊 Rate limiter: ${remainingCalls} calls remaining, resets in ${Math.ceil(timeUntilReset / 1000)}s`);

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

    // Get final rate limiter status
    const finalRemainingCalls = globalRateLimiter.getRemainingCalls();
    const finalTimeUntilReset = globalRateLimiter.getTimeUntilReset();

    return NextResponse.json({
      success: true,
      videos: videos.length,
      processed: processedCount,
      date: dateToday,
      keyword: `lokasi demo ${dateToday}`,
      totalTime: totalTime,
      avgTimePerVideo: avgTimePerVideo,
      rateLimit: {
        remainingCalls: finalRemainingCalls,
        resetInSeconds: Math.ceil(finalTimeUntilReset / 1000)
      },
      message: `Processed ${processedCount} demo locations from ${videos.length} TikTok videos in ${totalTime}ms`
    });

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
      { status: 500 }
    );
  }
}