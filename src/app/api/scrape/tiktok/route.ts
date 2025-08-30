import { NextRequest, NextResponse } from 'next/server';
import { extractLocationFromArticle } from '@/lib/openrouter';
import { geocodeLocation } from '@/lib/mapbox-geocoding';
import { prisma } from '@/lib/prisma';
import { env } from '../../../../env.config';

import { Root, Video } from '@/types/tiktok';

// Protest-related keywords in Indonesian
const PROTEST_KEYWORDS = [
  'demo', 'protest', 'unjuk rasa', 'kerusuhan', 'riot',
  'bentrok', 'rusak', 'api', 'pembakaran', 'polisi',
  'aksi', 'massa', 'tolak', 'reformasi', 'korupsi',
  'mahasiswa', 'buruh', 'petani', 'nelayan', 'warga',
  '30 agustus'
];

// Indonesian city names for location filtering
const INDONESIAN_CITIES = [
  'jakarta', 'surabaya', 'bandung', 'medan', 'semarang',
  'makassar', 'palembang', 'tangerang', 'depok', 'bekasi',
  'bogor', 'padang', 'malang', 'samarinda', 'pekanbaru',
  'banjarmasin', 'batam', 'pontianak', 'denpasar', 'manado',
  'yogyakarta', 'solo', 'serang', 'cirebon', 'tasikmalaya'
];

async function scrapeTikTokVideos(dateToday: string): Promise<Video[]> {
  try {
    console.log(`📅 Today's date: ${dateToday}`);
    console.log(`🔍 Searching for today's protests in Indonesia...`);

    // Just one keyword for today's protests
    const keyword = `protest indonesia ${dateToday}`;

    const allVideos: Video[] = [];

    try {
      console.log(`🔎 Searching: "${keyword}"`);

      const url = `https://tiktok-scraper7.p.rapidapi.com/feed/search?keywords=${encodeURIComponent(keyword)}&region=id&count=10&cursor=0&publish_time=1&sort_type=0`;

      const options = {
        method: 'GET',
        headers: {
          'x-rapidapi-key': env.rapidApi.key,
          'x-rapidapi-host': 'tiktok-scraper7.p.rapidapi.com'
        }
      };

      const response = await fetch(url, options);
      const result: Root = await response.json();

      if (result.code === 0 && result.data?.videos) {
        console.log(`Found ${result.data.videos.length} videos for keyword: ${keyword}`);
        allVideos.push(...result.data.videos);
      }

    } catch (error) {
      console.error(`Error scraping keyword ${keyword}:`, error);
    }

    // Remove duplicates based on video_id
    const uniqueVideos = allVideos.filter((video, index, self) =>
      index === self.findIndex(v => v.video_id === video.video_id)
    );

    console.log(`Total unique videos found: ${uniqueVideos.length}`);
    return uniqueVideos;

  } catch (error) {
    console.error('Error in TikTok scraping:', error);
    return [];
  }
}

function isProtestRelated(text: string): boolean {
  const lowerText = text.toLowerCase();
  return PROTEST_KEYWORDS.some(keyword => lowerText.includes(keyword));
}

function containsIndonesianLocation(text: string): boolean {
  const lowerText = text.toLowerCase();
  return INDONESIAN_CITIES.some(city => lowerText.includes(city));
}

async function processTikTokVideo(video: Video): Promise<boolean> {
  try {
    const fullText = `${video.title} ${video.music_info?.title || ''}`;
    const tiktokUrl = `https://www.tiktok.com/@${video.author.unique_id}/video/${video.video_id}`;

    // Debug: Log TikTok link for inspection
    console.log(`🔗 TikTok Link: ${tiktokUrl}`);
    console.log(`📝 Title: ${video.title}`);
    console.log(`👤 Author: ${video.author.nickname}`);

    // Check if it's protest-related
    if (!isProtestRelated(fullText)) {
      console.log(`❌ Video ${video.video_id} is not protest-related: ${video.title}`);
      return false;
    }

    // Check if it contains Indonesian location
    if (!containsIndonesianLocation(fullText) && video.region !== 'ID') {
      console.log(`❌ Video ${video.video_id} has no Indonesian location: ${video.title}`);
      return false;
    }

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

    // Extract location using OpenRouter (with retry logic)
    let locationResult = await extractLocationFromArticle(video.title, fullText);

    // Retry once if it fails
    if (!locationResult.success || !locationResult.location) {
      console.log(`⚠️ First attempt failed, retrying location extraction for video: ${video.video_id}`);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
      locationResult = await extractLocationFromArticle(video.title, fullText);
    }

    if (!locationResult.success || !locationResult.location) {
      console.log(`❌ No location found in TikTok video after retry: ${video.video_id}`);
      return false;
    }

    // Geocode the location using Mapbox
    const geocodeResult = await geocodeLocation(locationResult.location);

    if (!geocodeResult.success) {
      console.log(`❌ Failed to geocode location ${locationResult.location} for video: ${video.video_id}`);
      return false;
    }

    // Create event in database
    await prisma.event.create({
      data: {
        title: `Protest Activity - ${video.author.nickname}`,
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
    console.log(`📍 Location: ${locationResult.location} (${geocodeResult.lat}, ${geocodeResult.lng})`);
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
    console.log('Starting TikTok protest scraping...');

    // Get today's date for reference
    const today = new Date();
    const day = today.getDate().toString().padStart(2, '0');
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    const year = today.getFullYear();
    const dateToday = `${day}/${month}/${year}`;

    // Scrape TikTok videos
    const videos = await scrapeTikTokVideos(dateToday);
    console.log(`Found ${videos.length} TikTok videos`);

    let processedCount = 0;
    let relevantCount = 0;

    // Process videos (up to 5 for date-specific searches)
    let processedToday = 0;
    const maxToProcess = 5;

    for (const video of videos) {
      try {
        const success = await processTikTokVideo(video);
        if (success) {
          processedCount++;
          processedToday++;

          // Stop after processing 5 successful videos for today's protests
          if (processedToday >= maxToProcess) {
            console.log(`📊 Processed ${processedToday} videos for today - stopping to avoid rate limits`);
            break;
          }
        }

        // Check if video is relevant (has protest keywords)
        if (isProtestRelated(video.title)) {
          relevantCount++;
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
      relevant: relevantCount,
      processed: processedCount,
      date: dateToday,
      message: `Processed ${processedCount} protest locations from ${videos.length} TikTok videos for ${dateToday}`
    });

  } catch (error) {
    console.error('Error in TikTok scraping API:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to scrape TikTok videos' },
      { status: 500 }
    );
  }
}