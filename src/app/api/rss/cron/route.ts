import { NextRequest, NextResponse } from 'next/server';

/**
 * Cron Job Endpoint for RSS Fetching
 *
 * This endpoint is called by Vercel cron jobs and internally calls
 * the main RSS fetch endpoint with proper authentication.
 *
 * Cron schedule: Every 2 hours
 */

export async function GET(request: NextRequest) {
  console.log('⏰ RSS Cron job triggered - Starting RSS fetching...');

  try {
    // Get the secrets from environment
    const rssSecret = process.env.CRON_SECRET || process.env.RSS_API_KEY;

    if (!rssSecret) {
      return NextResponse.json(
        {
          success: false,
          error: 'RSS secret not configured',
          timestamp: new Date().toISOString()
        },
        { status: 500 }
      );
    }

    // Get the base URL for internal API calls - hardcode for cron jobs since Vercel serverless
    // runs on internal infrastructure with different domain routing
    const baseUrl = process.env.NODE_ENV === 'production'
      ? 'https://safe.100ai.id'  // Your actual custom domain
      : 'http://localhost:3000';

    console.log('🔗 Calling main RSS fetch endpoint...');
    console.log(`📍 Target URL: ${baseUrl}/api/rss/fetch`);
    console.log('📋 Request headers being sent:');
    console.log(`  - x-internal-cron: true`);
    console.log(`  - x-rss-secret: ${rssSecret ? 'Configured' : 'Missing'}`);
    console.log(`  - user-agent: vercel-cron/1.0`);

    // Call the main RSS fetch endpoint with proper authentication
    let response: Response;

    try {
      response = await fetch(`${baseUrl}/api/rss/fetch`, {
        method: 'POST', // RSS fetch uses POST
        headers: {
          'x-internal-cron': 'true', // Mark this as an internal cron call
          'x-rss-secret': rssSecret, // Provide authentication for RSS
          'user-agent': 'vercel-cron/1.0', // Identify as cron job
          'content-type': 'application/json',
        },
        // Increase timeout for RSS processing operations
        cache: 'no-store',
        signal: AbortSignal.timeout(15 * 60 * 1000) // 15 minutes timeout for RSS processing
      });
    } catch (fetchError) {
      console.error('❌ Fetch request failed:', fetchError);
      throw new Error(`Failed to call RSS endpoint: ${fetchError instanceof Error ? fetchError.message : 'Unknown fetch error'}`);
    }

    // Parse response - always get text first, then try to parse as JSON
    let data: any;

    try {
      const textResponse = await response.text();
      console.log('📄 Raw response received:', textResponse.substring(0, 200));

      // Try to parse as JSON
      try {
        data = JSON.parse(textResponse);
        console.log('✅ Successfully parsed JSON response');
      } catch (jsonError) {
        console.error('❌ JSON parsing failed:', jsonError);
        console.error('❌ Full response:', textResponse);
        data = {
          success: false,
          error: `JSON parsing failed: ${jsonError instanceof Error ? jsonError.message : 'Unknown parsing error'}`,
          rawResponse: textResponse.substring(0, 200)
        };
      }
    } catch (responseError) {
      console.error('❌ Failed to read response:', responseError);
      data = {
        success: false,
        error: `Failed to read response: ${responseError instanceof Error ? responseError.message : 'Unknown response error'}`,
        status: response.status,
        statusText: response.statusText
      };
    }

    if (response.ok && data.success) {
      console.log('✅ RSS Cron job completed successfully');
      console.log(`📊 Results: ${data.message || 'RSS fetch completed'}`);

      return NextResponse.json({
        success: true,
        message: 'RSS Cron job executed successfully',
        rssResult: data,
        timestamp: new Date().toISOString()
      });
    } else {
      console.error('❌ RSS Cron job failed:', data.error || 'Unknown error');

      return NextResponse.json({
        success: false,
        error: data.error || 'RSS fetch failed',
        rssResult: data,
        timestamp: new Date().toISOString()
      }, { status: response.status || 500 });
    }

  } catch (error) {
    console.error('❌ RSS Cron job error:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown RSS cron error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

// Handle other HTTP methods
export async function POST() {
  return NextResponse.json(
    { success: false, error: 'Method not allowed. Use GET for RSS cron jobs.' },
    { status: 405 }
  );
}

export async function PUT() {
  return POST();
}

export async function DELETE() {
  return POST();
}
