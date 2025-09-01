import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { TwitterSearchResponse, TwitterTimeline } from '@/types/twitter';

// Rate limiting - simple in-memory store (consider Redis for production)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // 10 requests per minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const key = `twitter_search_${ip}`;
  
  const existing = rateLimitStore.get(key);
  if (!existing || now > existing.resetTime) {
    rateLimitStore.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  if (existing.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  
  existing.count++;
  return true;
}

export async function GET(request: NextRequest) {
  try {
    // Get client IP for rate limiting
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    
    // Check rate limit
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    }

    // Check if RapidAPI key is configured
    if (!process.env.RAPIDAPI_KEY) {
      console.error('❌ RapidAPI key not configured');
      return NextResponse.json(
        { success: false, error: 'Twitter API not configured' },
        { status: 500 }
      );
    }

    console.log('🐦 Starting Twitter search for "rencana demo"...');

    // Search for "rencana demo" tweets
    const url = 'https://twitter-api45.p.rapidapi.com/search.php?query=%22rencana%22%20demo&search_type=Latest';
    const options = {
      method: 'GET',
              headers: {
          'x-rapidapi-key': process.env.RAPIDAPI_KEY,
          'x-rapidapi-host': 'twitter-api45.p.rapidapi.com'
        }
    };

    const response = await fetch(url, options);
    
    if (!response.ok) {
      throw new Error(`Twitter API responded with status: ${response.status}`);
    }

    const result = await response.text();
    let twitterData: TwitterSearchResponse;

    try {
      twitterData = JSON.parse(result);
    } catch (parseError) {
      console.error('❌ Failed to parse Twitter API response:', parseError);
      return NextResponse.json(
        { success: false, error: 'Invalid response from Twitter API' },
        { status: 500 }
      );
    }

    if (!twitterData.timeline || !Array.isArray(twitterData.timeline)) {
      console.error('❌ Invalid Twitter API response structure');
      return NextResponse.json(
        { success: false, error: 'Invalid Twitter API response structure' },
        { status: 500 }
      );
    }

    console.log(`📊 Found ${twitterData.timeline.length} tweets from Twitter API`);

    // Process and store tweets in database
    let processedCount = 0;
    const errors: string[] = [];

    for (const tweet of twitterData.timeline) {
      try {
        // Skip if tweet already exists
        const existing = await prisma.warningMarker.findUnique({
          where: { tweetId: tweet.tweet_id }
        });

        if (existing) {
          console.log(`⏭️ Tweet ${tweet.tweet_id} already exists, skipping...`);
          continue;
        }

        // Parse created_at date
        let createdAt: Date;
        try {
          // Twitter date format: "Sun Aug 31 08:28:25 +0000 2025"
          createdAt = new Date(tweet.created_at);
          if (isNaN(createdAt.getTime())) {
            throw new Error('Invalid date');
          }
        } catch (dateError) {
          console.warn(`⚠️ Failed to parse date for tweet ${tweet.tweet_id}: ${tweet.created_at}`);
          createdAt = new Date(); // Fallback to current date
        }

        // Filter user info to only include relevant fields for bot detection
        const filteredUserInfo = {
          created_at: tweet.user_info.created_at,
          followers_count: tweet.user_info.followers_count,
          friends_count: tweet.user_info.friends_count,
          favourites_count: tweet.user_info.favourites_count,
          verified: tweet.user_info.verified
        };

        // Create warning marker record
        await prisma.warningMarker.create({
          data: {
            tweetId: tweet.tweet_id,
            text: tweet.text,
            createdAt: createdAt,
            bookmarks: tweet.bookmarks || 0,
            favorites: tweet.favorites || 0,
            retweets: tweet.retweets || 0,
            views: tweet.views || '0',
            quotes: tweet.quotes || 0,
            replies: tweet.replies || 0,
            userInfo: filteredUserInfo, // Store filtered JSON
            verified: false, // Will be processed later
          }
        });

        processedCount++;
        console.log(`✅ Saved tweet ${tweet.tweet_id} to database`);

      } catch (error) {
        const errorMsg = `Failed to process tweet ${tweet.tweet_id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error('❌', errorMsg);
        errors.push(errorMsg);
      }
    }

    console.log(`🎯 Processing complete: ${processedCount} new tweets saved`);
    
    if (errors.length > 0) {
      console.warn(`⚠️ ${errors.length} errors occurred during processing`);
    }

    return NextResponse.json({
      success: true,
      data: twitterData,
      processed: processedCount,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('❌ Twitter search API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      },
      { status: 500 }
    );
  }
}

// POST endpoint for manual triggers or webhook processing
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'process_pending') {
      // Process pending warning markers that haven't been geocoded yet
      const pendingMarkers = await prisma.warningMarker.findMany({
        where: {
          OR: [
            { lat: null },
            { lng: null },
            { extractedLocation: null }
          ]
        },
        orderBy: { createdAt: 'desc' },
        take: 50 // Process in batches
      });

      console.log(`🔄 Processing ${pendingMarkers.length} pending warning markers...`);

      return NextResponse.json({
        success: true,
        message: `Found ${pendingMarkers.length} markers to process`,
        markers: pendingMarkers.length
      });
    }

    return NextResponse.json(
      { success: false, error: 'Invalid action' },
      { status: 400 }
    );

  } catch (error) {
    console.error('❌ Twitter POST API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      },
      { status: 500 }
    );
  }
}
