import { NextRequest, NextResponse } from 'next/server';
import { extractDetailedLocationFromTikTok } from '@/lib/openrouter';
import { geocodeLocation } from '@/lib/mapbox-geocoding';
import { geocodeWithSerp } from '@/lib/serp-geocoding';
import { prisma } from '@/lib/prisma';

import { Root, Video } from '@/types/tiktok';

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
  try {
    const tiktokUrl = `https://www.tiktok.com/@${video.author.unique_id}/video/${video.video_id}`;

    // Debug: Log TikTok link for inspection
    console.log(`🔗 TikTok Link: ${tiktokUrl}`);
    console.log(`📝 Title: ${video.title}`);
    console.log(`👤 Author: ${video.author.nickname}`);

    // Check if video already exists
    const existingEvent = await prisma.event.findFirst({
      where: {
        url: tiktokUrl
      }
    });

    if (existingEvent) {
      console.log(`⚠️ TikTok video already exists: ${video.video_id}`);
      return false;
    }

    // Extract detailed location using OpenRouter (enhanced AI analysis with text + image)
    console.log(`🔍 Extracting detailed location for video: ${video.video_id}`);
    console.log(`🖼️ Cover image available: ${video.cover ? 'Yes' : 'No'}`);
    let locationResult = await extractDetailedLocationFromTikTok(video);

    // Retry once if it fails
    if (!locationResult.success || !locationResult.exact_location) {
      console.log(`⚠️ First attempt failed, retrying detailed location extraction for video: ${video.video_id}`);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
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

    // Try SERP API geocoding first (more accurate for exact locations)
    console.log(`🌐 Geocoding with SERP API: ${locationResult.exact_location}`);
    let geocodeResult = await geocodeWithSerp(locationResult.exact_location);

    // Fallback to Mapbox if SERP fails
    if (!geocodeResult.success) {
      console.log(`⚠️ SERP geocoding failed, trying Mapbox: ${locationResult.exact_location}`);
      geocodeResult = await geocodeLocation(locationResult.exact_location);
    }

    if (!geocodeResult.success) {
      console.log(`❌ Failed to geocode location "${locationResult.exact_location}" for video: ${video.video_id}`);
      return false;
    }

    console.log(`📌 Coordinates: ${geocodeResult.lat}, ${geocodeResult.lng}`);
    if (geocodeResult.formatted_address) {
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

    console.log(`✅ Successfully processed TikTok video: ${video.video_id}`);
    console.log(`📍 Location: ${locationResult.exact_location} (${geocodeResult.lat}, ${geocodeResult.lng})`);
    console.log(`🔗 TikTok: ${tiktokUrl}`);
    console.log(`---`);

    return true;

  } catch (error) {
    console.error(`❌ Error processing TikTok video ${video.video_id}:`, error);
    return false;
  }
}

export async function GET(_request: NextRequest) {
  try {
    console.log('Starting TikTok demo scraping...');

    // Get today's date for reference
    const today = new Date();
    const day = today.getDate().toString().padStart(2, '0');
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    const year = today.getFullYear();
    const dateToday = `${day}/${month}/${year}`;

    // Scrape TikTok videos with simple keyword
    const videos = await scrapeTikTokVideos(dateToday);
    console.log(`Found ${videos.length} TikTok videos for "lokasi demo ${dateToday}"`);

    let processedCount = 0;

    // Process all videos found
    for (const video of videos) {
      try {
        const success = await processTikTokVideo(video);
        if (success) {
          processedCount++;
        }
      } catch (error) {
        console.error(`Failed to process video ${video.video_id}:`, error);
      }

      // Small delay between processing to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return NextResponse.json({
      success: true,
      videos: videos.length,
      processed: processedCount,
      date: dateToday,
      keyword: `lokasi demo ${dateToday}`,
      message: `Processed ${processedCount} demo locations from ${videos.length} TikTok videos`
    });

  } catch (error) {
    console.error('Error in TikTok scraping API:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to scrape TikTok videos' },
      { status: 500 }
    );
  }
}