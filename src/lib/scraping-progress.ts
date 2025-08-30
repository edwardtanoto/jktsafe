// Shared progress tracking for scraping operations
export let scrapingProgress: {
  isActive: boolean;
  totalVideos: number;
  processedVideos: number;
  currentBatch: number;
  totalBatches: number;
  startTime: number;
  lastUpdate: string;
} = {
  isActive: false,
  totalVideos: 0,
  processedVideos: 0,
  currentBatch: 0,
  totalBatches: 0,
  startTime: 0,
  lastUpdate: new Date().toISOString()
};

export function updateScrapingProgress(progress: typeof scrapingProgress) {
  scrapingProgress = { ...progress };
}

export function resetScrapingProgress() {
  scrapingProgress = {
    isActive: false,
    totalVideos: 0,
    processedVideos: 0,
    currentBatch: 0,
    totalBatches: 0,
    startTime: 0,
    lastUpdate: new Date().toISOString()
  };
}
