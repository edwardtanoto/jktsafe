'use client';

import { useState } from 'react';
import RiotMap from '@/components/RiotMap';
import { env } from '../../env.config';

export default function Home() {
  const [scraping, setScraping] = useState(false);
  const [lastScrapeResult, setLastScrapeResult] = useState<any>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleScrapeTikTok = async () => {
    setScraping(true);
    try {
      const response = await fetch('/api/scrape/tiktok');
      const result = await response.json();
      setLastScrapeResult(result);

      if (result.success) {
        // Refresh the map after successful scraping
        setRefreshKey(prev => prev + 1);
      }
    } catch (error) {
      console.error('Error scraping TikTok:', error);
      setLastScrapeResult({ success: false, error: 'Failed to scrape TikTok' });
    } finally {
      setScraping(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900">
              Protest Location Tracker
            </h1>
            <button
              onClick={handleScrapeTikTok}
              disabled={scraping}
              className="bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              {scraping ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Scraping...
                </>
              ) : (
                <>
                  <span>🔍</span>
                  Scrape TikTok
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Status Card */}
        {lastScrapeResult && (
          <div className={`mb-6 p-4 rounded-lg ${lastScrapeResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            <h3 className={`font-semibold ${lastScrapeResult.success ? 'text-green-800' : 'text-red-800'}`}>
              {lastScrapeResult.success ? '✅ Scrape Successful' : '❌ Scrape Failed'}
            </h3>
            {lastScrapeResult.message && (
              <p className={`text-sm mt-1 ${lastScrapeResult.success ? 'text-green-700' : 'text-red-700'}`}>
                {lastScrapeResult.message}
              </p>
            )}
            {lastScrapeResult.error && (
              <p className="text-sm text-red-700 mt-1">
                {lastScrapeResult.error}
              </p>
            )}
            {lastScrapeResult.success && (
              <div className="mt-2 text-sm text-green-700">
                <p>📹 Videos found: {lastScrapeResult.videos}</p>
                <p>🎯 Relevant videos: {lastScrapeResult.relevant}</p>
                <p>✅ Processed: {lastScrapeResult.processed}</p>
              </div>
            )}
          </div>
        )}

        {/* Map */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-xl font-semibold mb-4">Protest Locations Map</h2>
          <RiotMap
            key={refreshKey}
            accessToken={env.mapbox.accessToken || process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || ''}
          />
        </div>

        {/* Info Section */}
        <div className="mt-8 bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-xl font-semibold mb-4">How it works</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold text-lg mb-2">📍 Location Extraction</h3>
              <p className="text-gray-600 text-sm">
                We analyze TikTok video captions and titles to identify specific locations mentioned in Indonesian protest content.
                Using AI, we extract places like "Polda Bali", "Gedung DPR Jakarta", or "Monas" from the text.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-lg mb-2">🗺️ Geocoding</h3>
              <p className="text-gray-600 text-sm">
                Once we identify a location, we use Mapbox geocoding to convert the location name into precise latitude and longitude coordinates
                that can be displayed as markers on the map.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-lg mb-2">🔍 TikTok Scraping</h3>
              <p className="text-gray-600 text-sm">
                The system searches for protest-related keywords in Indonesian on TikTok, focusing on today's content to track current events
                and demonstrations across Indonesia.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-lg mb-2">📊 Real-time Updates</h3>
              <p className="text-gray-600 text-sm">
                Click "Scrape TikTok" to fetch the latest protest videos and update the map with new location markers.
                Each marker shows details about the protest event and links back to the original video.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
