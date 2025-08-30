import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { scrapingProgress } from '@/lib/scraping-progress';

export async function GET(_request: NextRequest) {
  try {
    const now = Date.now();
    const elapsed = scrapingProgress.startTime > 0 ? now - scrapingProgress.startTime : 0;
    const progress = scrapingProgress.totalVideos > 0 ?
      Math.round((scrapingProgress.processedVideos / scrapingProgress.totalVideos) * 100) : 0;

    const estimatedTimeRemaining = scrapingProgress.isActive && scrapingProgress.processedVideos > 0 ?
      Math.round((elapsed / scrapingProgress.processedVideos) * (scrapingProgress.totalVideos - scrapingProgress.processedVideos)) : 0;

    // Get total events count from database
    const totalEvents = await prisma.event.count();

    const response = {
      success: true,
      status: scrapingProgress.isActive ? 'scraping' : 'idle',
      progress: {
        current: scrapingProgress.processedVideos,
        total: scrapingProgress.totalVideos,
        percentage: progress,
        currentBatch: scrapingProgress.currentBatch,
        totalBatches: scrapingProgress.totalBatches,
        elapsedTime: elapsed,
        estimatedTimeRemaining: estimatedTimeRemaining
      },
      stats: {
        totalEvents: totalEvents,
        lastUpdate: scrapingProgress.lastUpdate
      },
      lastUpdate: new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in status API:', error);
    return NextResponse.json(
      { success: false, status: 'error', error: 'Failed to get status' },
      { status: 500 }
    );
  }
}
