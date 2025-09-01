import { NextRequest, NextResponse } from 'next/server';

/**
 * Cron Job Endpoint for TikTok Scraping
 *
 * This endpoint is called by Vercel cron jobs and internally calls
 * the main scraping endpoint with proper authentication.
 *
 * Cron schedule:
 * - Peak hours (12pm-2am): Every hour
 * - Conserve hours (2am-12pm): Every 2 hours
 */

export async function GET(request: NextRequest) {
  console.log('⏰ Cron job triggered - Starting TikTok scraping...');

  try {
    // Get the SCRAPE_SECRET from environment
    const scrapeSecret = process.env.SCRAPE_SECRET;

    if (!scrapeSecret) {
      console.error('❌ SCRAPE_SECRET not configured in environment');
      return NextResponse.json(
        {
          success: false,
          error: 'SCRAPE_SECRET not configured',
          timestamp: new Date().toISOString()
        },
        { status: 500 }
      );
    }

    // Get the base URL for internal API calls
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    console.log('🔗 Calling main scraping endpoint...');

    // Call the main scraping endpoint with proper authentication
    const response = await fetch(`${baseUrl}/api/scrape/tiktok`, {
      method: 'GET',
      headers: {
        'x-internal-cron': 'true', // Mark this as an internal cron call
        'x-scrape-secret': scrapeSecret, // Provide authentication
        'user-agent': 'vercel-cron/1.0' // Identify as cron job
      },
      // Increase timeout for scraping operations
      signal: AbortSignal.timeout(25 * 60 * 1000) // 25 minutes timeout
    });

    const data = await response.json();

    if (response.ok && data.success) {
      console.log('✅ Cron job completed successfully');
      console.log(`📊 Results: ${data.message || 'Scraping completed'}`);

      return NextResponse.json({
        success: true,
        message: 'Cron job executed successfully',
        scrapingResult: data,
        timestamp: new Date().toISOString()
      });
    } else {
      console.error('❌ Cron job failed:', data.error || 'Unknown error');

      return NextResponse.json({
        success: false,
        error: data.error || 'Scraping failed',
        scrapingResult: data,
        timestamp: new Date().toISOString()
      }, { status: response.status });
    }

  } catch (error) {
    console.error('❌ Cron job error:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown cron error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

// Handle other HTTP methods
export async function POST() {
  return NextResponse.json(
    { success: false, error: 'Method not allowed. Use GET for cron jobs.' },
    { status: 405 }
  );
}

export async function PUT() {
  return POST();
}

export async function DELETE() {
  return POST();
}
