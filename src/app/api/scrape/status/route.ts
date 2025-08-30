import { NextRequest, NextResponse } from 'next/server';

export async function GET(_request: NextRequest) {
  try {
    // For now, return a simple status
    // In a real implementation, you might check:
    // - Last scraping run time
    // - Number of events in database
    // - Current scraping status
    // - Any errors from recent runs

    const response = {
      status: 'idle', // 'idle', 'scraping', 'completed', 'error'
      lastUpdate: new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }),
      totalEvents: 0, // Would come from database
      lastScrapedDate: new Date().toLocaleDateString()
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in status API:', error);
    return NextResponse.json(
      { status: 'error', error: 'Failed to get status' },
      { status: 500 }
    );
  }
}
