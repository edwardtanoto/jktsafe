'use client';

import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef, useState } from "react";
import ChatBot from "./ChatBot";

interface Event {
  id: number;
  title: string;
  description: string;
  lat: number;
  lng: number;
  source: string;
  url?: string;
  verified: boolean;
  type: string;
  originalCreatedAt?: string; // Original creation time from source (TikTok, Twitter, etc.)
  createdAt: string;
  closureType?: string;
  reason?: string;
  severity?: string;
  affectedRoutes?: string[];
  alternativeRoutes?: string[];
  // Warning-specific fields
  tweetId?: string;
  extractedLocation?: string;
  confidenceScore?: number;
  socialMetrics?: {
    bookmarks: number;
    favorites: number;
    retweets: number;
    views: string;
    quotes: number;
    replies: number;
  };
  userInfo?: {
    created_at: string;
    followers_count: number;
    friends_count: number;
    favourites_count: number;
    verified: boolean;
  };
}

export default function RiotMap() {
  const mapContainer = useRef<any>(null);
  const map = useRef<mapboxgl.Map | any>(null);
  const [scrapingStatus, setScrapingStatus] = useState<'idle' | 'scraping' | 'completed' | 'error'>('idle');
  const [lastUpdate, setLastUpdate] = useState<string>('Never');
  const [isScraping, setIsScraping] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<number>(24); // Default to 24 hours
  const [showWarningsOnly, setShowWarningsOnly] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [fabMenuOpen, setFabMenuOpen] = useState<boolean>(false);

  // Function to fetch events from database
  const fetchEvents = async (customTimeFilter?: number) => {
    try {
      setLoading(true);
      setError(null);

      // Use the passed timeFilter or fall back to state
      const activeTimeFilter = customTimeFilter !== undefined ? customTimeFilter : timeFilter;
      
      // Fetch regular events, road closures, and warning markers with time filter
      const timeParam = activeTimeFilter > 0 ? `&hours=${activeTimeFilter}` : '';
      const [eventsResponse, roadClosuresResponse, warningMarkersResponse] = await Promise.all([
        fetch(`/api/events?type=riot&limit=100${timeParam}`),
        // For road closures: if activeTimeFilter is 0 (All), don't send hours param, otherwise send the activeTimeFilter value
        fetch(`/api/road-closures${activeTimeFilter > 0 ? `?hours=${activeTimeFilter}` : ''}`),
        // Fetch warning markers with minimum confidence threshold
        fetch(`/api/warning-markers?${activeTimeFilter > 0 ? `hours=${activeTimeFilter}&` : ''}minConfidence=0.4&limit=50`)
      ]);

      if (!eventsResponse.ok) {
        throw new Error('Failed to fetch events');
      }

      const eventsData = await eventsResponse.json() as { success: boolean; events: Event[]; error?: string };
      const roadClosuresData = await roadClosuresResponse.json() as { success: boolean; roadClosures: Event[]; error?: string };
      
      // Handle warning markers with fallback
      let warningMarkersData: { success: boolean; warnings: Event[]; error?: string } = { success: true, warnings: [] };
      try {
        if (warningMarkersResponse.ok) {
          warningMarkersData = await warningMarkersResponse.json() as { success: boolean; warnings: Event[]; error?: string };
        } else {
          console.warn('⚠️ Warning markers API failed, continuing without warning markers');
        }
      } catch (error) {
        console.warn('⚠️ Failed to parse warning markers response, continuing without warning markers:', error);
      }

      if (eventsData.success && roadClosuresData.success) {
        // Combine events, road closures, and warning markers (if available)
        const allEvents = [
          ...eventsData.events,
          ...roadClosuresData.roadClosures.map(rc => ({ ...rc, type: 'road_closure' as const })),
          ...(warningMarkersData.success ? warningMarkersData.warnings.map(wm => ({ ...wm, type: 'warning' as const })) : [])
        ];

        setEvents(allEvents);
        const warningCount = warningMarkersData.success ? warningMarkersData.warnings.length : 0;
        console.log(`📍 Loaded ${eventsData.events.length} events, ${roadClosuresData.roadClosures.length} road closures, and ${warningCount} warning markers from database`);
      } else {
        throw new Error(eventsData.error || roadClosuresData.error || 'Failed to fetch data');
      }
    } catch (error) {
      console.error('❌ Error fetching events:', error);
      setError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  // Function to handle time filter changes
  const handleTimeFilterChange = (hours: number) => {
    setTimeFilter(hours);
    // Immediately fetch events with new time filter, passing the new value directly
    fetchEvents(hours);
  };

  // Function to scrape TikTok for latest news
  const handleScrapeTikTok = async () => {
    if (isScraping) return; // Prevent multiple concurrent scrapes

    setIsScraping(true);
    setScrapingStatus('scraping');

    try {
      console.log('🚀 Starting TikTok scraping...');
      const response = await fetch('/api/scrape/tiktok', {
        method: 'GET'
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Scraping completed:', result);

        setScrapingStatus('completed');
        setLastUpdate(new Date().toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        }));

        // Refresh events after scraping
        await fetchEvents();

      } else {
        console.error('❌ Scraping failed');
        setScrapingStatus('error');
      }
    } catch (error) {
      console.error('❌ Scraping error:', error);
      setScrapingStatus('error');
    } finally {
      setIsScraping(false);
    }
  };

  // Function to check scraping status periodically
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await fetch('/api/scrape/status');
        if (response.ok) {
          const data: any = await response.json();
          setScrapingStatus(data.status || 'idle');
          setLastUpdate(data.lastUpdate || 'Never');
        }
      } catch (error) {
        // API might not exist yet, keep default status
        console.log('Status API not available yet');
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, []);

  // Function to create GeoJSON from events
  const createEventGeoJSON = (events: Event[]) => {
    return {
      type: 'FeatureCollection',
      features: events.map(event => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [event.lng, event.lat] // [lng, lat]
        },
        properties: {
          id: event.id,
          title: event.title,
          description: event.description,
          source: event.source,
          url: event.url,
          verified: event.verified,
          type: event.type,
          originalCreatedAt: event.originalCreatedAt,
          createdAt: event.createdAt,
          severity: event.severity,
          closureType: event.closureType,
          reason: event.reason,
          affectedRoutes: event.affectedRoutes,
          alternativeRoutes: event.alternativeRoutes,
          emoji: event.type === 'riot' ? '🔥' : event.type === 'protest' ? '👥' : event.type === 'road_closure' ? '🚧' : event.type === 'warning' ? '⚠️' : '📍',
          // Warning-specific properties
          tweetId: event.tweetId,
          extractedLocation: event.extractedLocation,
          confidenceScore: event.confidenceScore,
          socialMetrics: event.socialMetrics,
          userInfo: event.userInfo
        }
      }))
    };
  };

  // Function to update map markers
  const updateMapMarkers = () => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    // Filter events based on showWarningsOnly state
    const filteredEvents = showWarningsOnly ? events.filter(event => event.type === 'warning') : events;
    const eventData = createEventGeoJSON(filteredEvents);

    // Update or create the events source
    if (map.current.getSource('events')) {
      (map.current.getSource('events') as any).setData(eventData);
    } else {
      // Add source with clustering enabled
      map.current.addSource('events', {
        type: 'geojson',
        data: eventData,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50
      });

      // Add cluster circles (for groups of events)
      map.current.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'events',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'step',
            ['get', 'point_count'],
            '#51bbd6', // Light blue for small clusters
            5, '#f1f075', // Yellow for medium clusters
            15, '#f28cb1' // Pink for large clusters
          ],
          'circle-radius': [
            'step',
            ['get', 'point_count'],
            20, // Small clusters
            5, 30, // Medium clusters
            15, 40 // Large clusters
          ],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2
        }
      });

      // Add cluster count labels
      map.current.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'events',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 12,
          'text-anchor': 'center'
        },
        paint: {
          'text-color': '#000000'
        }
      });

      // Add circle layer for individual riot events
      map.current.addLayer({
        id: 'riot-circles',
        type: 'circle',
        source: 'events',
        filter: ['all', ['==', ['get', 'type'], 'riot'], ['!', ['has', 'point_count']]],
        paint: {
          'circle-radius': 18,
          'circle-color': '#ff4444',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
          'circle-opacity': 0.8
        }
      });

      // Add circle layer for individual protest events
      map.current.addLayer({
        id: 'protest-circles',
        type: 'circle',
        source: 'events',
        filter: ['all', ['==', ['get', 'type'], 'protest'], ['!', ['has', 'point_count']]],
        paint: {
          'circle-radius': 18,
          'circle-color': '#ffaa00',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
          'circle-opacity': 0.8
        }
      });

      // Add circle layer for road closures
      map.current.addLayer({
        id: 'road-closure-circles',
        type: 'circle',
        source: 'events',
        filter: ['all', ['==', ['get', 'type'], 'road_closure'], ['!', ['has', 'point_count']]],
        paint: {
          'circle-radius': [
            'match',
            ['get', 'severity'],
            'low', 16,
            'medium', 20,
            'high', 24,
            'critical', 28,
            20 // default
          ],
          'circle-color': [
            'match',
            ['get', 'severity'],
            'low', '#ffaa00',      // Orange for low
            'medium', '#ff6600',   // Orange-red for medium
            'high', '#ff0000',     // Red for high
            'critical', '#990000', // Dark red for critical
            '#ff0000' // default red
          ],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 3,
          'circle-opacity': 0.9
        }
      });

      // Add circle layer for warning markers - BIGGER AND BRIGHTER
      map.current.addLayer({
        id: 'warning-circles',
        type: 'circle',
        source: 'events',
        filter: ['all', ['==', ['get', 'type'], 'warning'], ['!', ['has', 'point_count']]],
        paint: {
          'circle-radius': 28,           // Much bigger than others (vs 18)
          'circle-color': '#FFD700',     // Bright gold
          'circle-stroke-color': '#FF4500', // Orange border for contrast
          'circle-stroke-width': 4,      // Thicker border
          'circle-opacity': 1.0          // Fully opaque
        }
      });

      // Add circle layer for individual other events
      map.current.addLayer({
        id: 'other-circles',
        type: 'circle',
        source: 'events',
        filter: ['all', ['!=', ['get', 'type'], 'riot'], ['!=', ['get', 'type'], 'protest'], ['!=', ['get', 'type'], 'road_closure'], ['!=', ['get', 'type'], 'warning'], ['!', ['has', 'point_count']]],
        paint: {
          'circle-radius': 18,
          'circle-color': '#4444ff',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
          'circle-opacity': 0.8
        }
      });

      // Add text layer for individual event emojis
      map.current.addLayer({
        id: 'event-emoji',
        type: 'symbol',
        source: 'events',
        filter: ['!', ['has', 'point_count']],
        layout: {
          'text-field': ['get', 'emoji'],
          'text-size': [
            'case',
            ['==', ['get', 'type'], 'warning'], 28, // Bigger emoji for warnings
            20 // Normal size for others
          ],
          'text-anchor': 'center',
          'text-justify': 'center',
          'text-allow-overlap': true
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#000000',
          'text-halo-width': 2
        }
      });

      // Add click event for clusters
      map.current.on('click', 'clusters', (e: any) => {
        const features = map.current.queryRenderedFeatures(e.point, {
          layers: ['clusters']
        });

        if (features.length > 0) {
          const clusterId = features[0].properties.cluster_id;
          const pointCount = features[0].properties.point_count;
          const clusterSource = (map.current.getSource('events') as any);

          // Get cluster expansion zoom
          clusterSource.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
            if (err) return;

            map.current.easeTo({
              center: features[0].geometry.coordinates,
              zoom: zoom
            });
          });
        }
      });

      // Add click events for individual events
      ['riot-circles', 'protest-circles', 'road-closure-circles', 'warning-circles', 'other-circles', 'event-emoji'].forEach(layerId => {
        map.current.on('click', layerId, (e: any) => {
          const feature = e.features[0];
          const coordinates = feature.geometry.coordinates.slice();
          const properties = feature.properties;

          // Create detailed popup for individual events
          let popupHTML = '';
          
          if (properties.type === 'warning') {
            // Special popup for warning markers with Twitter data
            let socialMetrics: any = {};
            let userInfo: any = {};
            
            try {
              socialMetrics = JSON.parse(properties.socialMetrics || '{}');
              userInfo = JSON.parse(properties.userInfo || '{}');
            } catch (e) {
              console.warn('Failed to parse warning marker data:', e);
            }
            
            // Calculate user age in days
            const userCreated = new Date(userInfo.created_at || '2020-01-01');
            const userAgeDays = Math.floor((Date.now() - userCreated.getTime()) / (1000 * 60 * 60 * 24));
            
            // Bot detection indicators
            const followersCount = userInfo.followers_count || 0;
            const friendsCount = userInfo.friends_count || 0;
            const followerRatio = friendsCount > 0 ? (followersCount / friendsCount) : 0;
            const isLikelyBot = userAgeDays < 30 || followerRatio < 0.1 || friendsCount > followersCount * 5;
            const accountYear = new Date(new Date().getTime() - userAgeDays * 24 * 60 * 60 * 1000).getFullYear();
            
            // Truncate description if too long
            const truncatedDescription = properties.description && properties.description.length > 120 
              ? properties.description.substring(0, 120) + '...' 
              : properties.description || 'No description available';
            
            popupHTML = `
              <div style="max-width: 320px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
                <!-- Header with verification badge -->
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                  <h3 style="margin: 0; color: #1f2937; font-size: 15px; font-weight: 600; flex: 1;">
                    ${properties.emoji} ${properties.title}
                  </h3>
                  ${userInfo.verified ? '<span style="background: #059669; color: white; font-size: 10px; padding: 2px 6px; border-radius: 12px; font-weight: 500;">✓ VERIFIED</span>' : ''}
                </div>
                
                <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 13px; line-height: 1.3;">
                  ${truncatedDescription}
                </p>
                
                <!-- Compact Warning Alert -->
                <div style="background: #fef3c7; border-left: 3px solid #f59e0b; padding: 8px; margin-bottom: 10px; border-radius: 4px;">
                  <div style="font-size: 11px; font-weight: 500; color: #92400e;">
                    ⚠️ ${properties.extractedLocation || 'Unknown Location'} • ${Math.round((properties.confidenceScore || 0) * 100)}% confidence
                  </div>
                </div>
                
                <!-- Compact Social Metrics -->
                <div style="display: flex; gap: 8px; margin-bottom: 10px; font-size: 11px;">
                  ${socialMetrics.views && socialMetrics.views !== '0' ? `
                    <span style="background: #f3f4f6; padding: 4px 6px; border-radius: 3px; font-weight: 500; color: #6b7280;">
                      👀 Views: ${socialMetrics.views}
                    </span>
                  ` : ''}
                  ${socialMetrics.retweets && socialMetrics.retweets > 10 ? `
                    <span style="background: #f3f4f6; padding: 4px 6px; border-radius: 3px; font-weight: 500;">
                      🔄 Retweets: ${socialMetrics.retweets}
                    </span>
                  ` : ''}
                </div>
                
                <!-- Compact User Info -->
                <div style="border-top: 1px solid #e5e7eb; padding-top: 8px; margin-bottom: 8px;">
                  <div style="font-size: 11px; color: #6b7280; line-height: 1.4;">
                    ${isLikelyBot ? '🤖 Potential Bot' : '👤 User'} • Since ${accountYear} • ${followersCount.toLocaleString()} followers
                  </div>
                </div>
                
                <!-- Compact Metadata -->
                <div style="font-size: 11px; color: #6b7280; line-height: 1.4;">
                  <div style="margin-bottom: 4px;">
                    Twitter • ${new Date(properties.createdAt).toLocaleDateString()} • 
                    ${properties.verified ? '<span style="color: #059669;">Verified</span>' : '<span style="color: #d97706;">Unverified Account</span>'}
                  </div>
                  ${properties.url ? `<a href="${properties.url}" target="_blank" style="color: #3b82f6; text-decoration: none; font-weight: 500;">View Tweet →</a>` : ''}
                </div>
              </div>
            `;
          } else if (properties.type === 'road_closure') {
            // Special popup for road closures
            const severityColors: Record<string, string> = {
              'low': '#f59e0b',
              'medium': '#f97316', 
              'high': '#ef4444',
              'critical': '#dc2626'
            };
            const severityColor = severityColors[properties.severity] || '#ef4444';
            
            const severityText = properties.severity ? properties.severity.charAt(0).toUpperCase() + properties.severity.slice(1) : 'Unknown';
            
            popupHTML = `
              <div style="max-width: 320px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
                <!-- Header with road closure icon and severity -->
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                  <h3 style="margin: 0; color: #1f2937; font-size: 15px; font-weight: 600; flex: 1;">
                    ${properties.emoji} ${properties.title}
                  </h3>
                  ${properties.severity ? `<span style="background: ${severityColor}; color: white; font-size: 10px; padding: 2px 6px; border-radius: 12px; font-weight: 500;">${severityText.toUpperCase()}</span>` : ''}
                </div>
                
                <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 13px; line-height: 1.3;">
                  ${properties.description || 'Road closure reported from private sources'}
                </p>
                
                <!-- Road Closure Alert -->
                <div style="background: #fef3c7; border-left: 3px solid #f59e0b; padding: 8px; margin-bottom: 10px; border-radius: 4px;">
                  <div style="font-size: 11px; font-weight: 500; color: #92400e;">
                    🚧 Road Closure Alert
                  </div>
                  ${properties.extractedLocation ? `<div style="font-size: 10px; color: #92400e; margin-top: 2px;">Location: ${properties.extractedLocation}</div>` : ''}
                </div>
                
                <!-- Road Closure Details -->
                <div style="display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #4b5563; margin-bottom: 10px;">
                  ${properties.closureType ? `<div style="display: flex; align-items: center; gap: 6px;"><span>🚧</span><span>Type: <strong>${properties.closureType}</strong></span></div>` : ''}
                  ${properties.reason ? `<div style="display: flex; align-items: center; gap: 6px;"><span>❓</span><span>Reason: <strong>${properties.reason}</strong></span></div>` : ''}
                  ${properties.affectedRoutes && properties.affectedRoutes.length > 0 ? `<div style="display: flex; align-items: center; gap: 6px;"><span>🛣️</span><span>Affected: <strong>${properties.affectedRoutes.join(', ')}</strong></span></div>` : ''}
                  ${properties.alternativeRoutes && properties.alternativeRoutes.length > 0 ? `<div style="display: flex; align-items: center; gap: 6px;"><span>↩️</span><span>Alternative: <strong>${properties.alternativeRoutes.join(', ')}</strong></span></div>` : ''}
                </div>
                
                <!-- Metadata -->
                <div style="border-top: 1px solid #e5e7eb; padding-top: 8px;">
                  <div style="display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: #6b7280;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                      <span>🔗</span>
                      <span>Source: <strong>${properties.source}</strong></span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                      <span>⏰</span>
                      <span>${new Date(properties.createdAt).toLocaleString()}</span>
                    </div>
                    ${properties.verified ? '<div style="display: flex; align-items: center; gap: 6px;"><span>✅</span><span style="color: #059669; font-weight: 500;">Verified</span></div>' : '<div style="display: flex; align-items: center; gap: 6px;"><span>⚠️</span><span style="color: #d97706; font-weight: 500;">Verified Anonymous Tips</span></div>'}
                    ${properties.url ? `<div style="margin-top: 6px;"><a href="${properties.url}" target="_blank" style="color: #3b82f6; text-decoration: none; font-weight: 500;">🔗 View Source →</a></div>` : ''}
                  </div>
                </div>
              </div>
            `;
          } else {
            // Regular popup for other event types
            popupHTML = `
              <div style="max-width: 320px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
                <h3 style="margin: 0 0 8px 0; color: #1f2937; font-size: 16px; font-weight: 600;">
                  ${properties.emoji} ${properties.title}
                </h3>
                <p style="margin: 0 0 12px 0; color: #6b7280; font-size: 12px; line-height: 1.4;">
                  ${properties.description || 'No description available'}
                </p>
                <div style="display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: #4b5563;">
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <span>📍</span>
                    <span>Type: <strong>${properties.type}</strong></span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <span>🔗</span>
                    <span>Source: <strong>${properties.source}</strong></span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <span>⏰</span>
                    <span>${new Date(properties.originalCreatedAt || properties.createdAt).toLocaleString()}</span>
                  </div>
                  ${properties.verified ? '<div style="display: flex; align-items: center; gap: 6px;"><span>✅</span><span style="color: #059669; font-weight: 500;">Verified Event</span></div>' : ''}
                  ${properties.url ? `<div style="margin-top: 8px;"><a href="${properties.url}" target="_blank" style="color: #3b82f6; text-decoration: none; font-weight: 500;">🔗 View Original Source →</a></div>` : ''}
                </div>
              </div>
            `;
          }
          
          const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: true })
            .setLngLat(coordinates)
            .setHTML(popupHTML)
            .addTo(map.current);

          // Fly to location
          map.current.flyTo({
            center: coordinates,
            zoom: 15,
            speed: 1.2,
            curve: 1,
            easing: (t: number) => t,
            essential: true
          });
        });

        // Add cursor pointer for interactive pins
        map.current.on('mouseenter', layerId, () => {
          map.current.getCanvas().style.cursor = 'pointer';
        });
        map.current.on('mouseleave', layerId, () => {
          map.current.getCanvas().style.cursor = '';
        });
      });

      // Add cursor pointer for clusters
      map.current.on('mouseenter', 'clusters', () => {
        map.current.getCanvas().style.cursor = 'pointer';
      });
      map.current.on('mouseleave', 'clusters', () => {
        map.current.getCanvas().style.cursor = '';
      });
    }
  };

  // Initialize map
  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

    if (!token) {
      console.error('NEXT_PUBLIC_MAPBOX_TOKEN is not set. Please add it to your .env.local file.');
      return;
    }

    mapboxgl.accessToken = token;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [106.8456, -6.2088], // Center on Jakarta
      zoom: 11,
      attributionControl: false
    });

    map.current.on('load', () => {
      console.log('🗺️ Map loaded, waiting for events data...');
      // Map markers will be added when events are fetched
    });

    return () => {
      if (map.current) {
        map.current.remove();
      }
    };
  }, []);

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Set up EventSource for real-time updates
  useEffect(() => {
    let eventSource: EventSource | null = null;

    const setupEventSource = () => {
      try {
        console.log('🔌 Connecting to live event stream...');
        eventSource = new EventSource('/api/events/stream');

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            switch (data.type) {
              case 'initial':
                console.log('📡 Received initial data:', data.events?.length || 0, 'events');
                // Initial data is already loaded via fetchEvents()
                break;

              case 'update':
                if (data.events?.length > 0 || data.warningMarkers?.length > 0) {
                  console.log('🔄 Live update received:', data.events?.length || 0, 'events,', data.warningMarkers?.length || 0, 'warnings');

                  // Merge new data with existing events
                  setEvents(prevEvents => {
                    const newEvents = [...prevEvents];

                    // Add new events
                    if (data.events) {
                      data.events.forEach((newEvent: Event) => {
                        const existingIndex = newEvents.findIndex(e => e.id === newEvent.id);
                        if (existingIndex >= 0) {
                          // Update existing event
                          newEvents[existingIndex] = { ...newEvent, type: newEvent.type || 'riot' };
                        } else {
                          // Add new event
                          newEvents.unshift({ ...newEvent, type: newEvent.type || 'riot' });
                        }
                      });
                    }

                    // Add new warning markers
                    if (data.warningMarkers) {
                      data.warningMarkers.forEach((newWarning: Event) => {
                        const existingIndex = newEvents.findIndex(e => e.id === newWarning.id && e.type === 'warning');
                        if (existingIndex >= 0) {
                          // Update existing warning
                          newEvents[existingIndex] = { ...newWarning, type: 'warning' };
                        } else {
                          // Add new warning
                          newEvents.unshift({ ...newWarning, type: 'warning' });
                        }
                      });
                    }

                    // Keep only the most recent 200 events to prevent memory issues
                    return newEvents.slice(0, 200);
                  });

                  // Update last update timestamp
                  setLastUpdate(new Date().toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                  }));

                  // Show notification for new updates
                  if (data.events?.length > 0 || data.warningMarkers?.length > 0) {
                    console.log('✅ Live update applied to map');
                  }
                }
                break;

              case 'heartbeat':
                // Heartbeat received, connection is alive
                break;

              default:
                console.log('📡 Unknown message type:', data.type);
            }
          } catch (error) {
            console.error('❌ Error parsing live update:', error);
          }
        };

        eventSource.onerror = (error) => {
          console.error('❌ EventSource error:', error);
          // Attempt to reconnect after a delay
          setTimeout(() => {
            if (eventSource) {
              eventSource.close();
              setupEventSource();
            }
          }, 5000);
        };

        eventSource.onopen = () => {
          console.log('✅ Connected to live event stream');
        };

      } catch (error) {
        console.error('❌ Failed to setup EventSource:', error);
      }
    };

    setupEventSource();

    return () => {
      if (eventSource) {
        console.log('🔌 Disconnecting from live event stream');
        eventSource.close();
      }
    };
  }, []);

  // Fetch events on mount and set up periodic refresh (fallback)
  useEffect(() => {
    fetchEvents();

    // Set up periodic refresh every 5 minutes (fallback for when EventSource fails)
    const refreshInterval = setInterval(() => {
      if (!loading && !isScraping) {
        console.log('🔄 Periodic refresh of events (fallback)...');
        fetchEvents();
      }
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(refreshInterval);
  }, []);

  // Update map markers when events change or filter changes
  useEffect(() => {
    updateMapMarkers();
  }, [events, showWarningsOnly]);

  const getStatusColor = () => {
    switch (scrapingStatus) {
      case 'scraping': return '#3b82f6'; // Blue
      case 'completed': return '#10b981'; // Green
      case 'error': return '#ef4444'; // Red
      default: return '#6b7280'; // Gray
    }
  };

  const getStatusText = () => {
    switch (scrapingStatus) {
      case 'scraping': return 'Scraping...';
      case 'completed': return 'Updated';
      case 'error': return 'Error';
      default: return 'Idle';
    }
  };

  return (
    <div id="map" style={{ width: '100%', height: '100vh', position: 'relative' }}>
      <div ref={mapContainer} style={{ height: '100vh', width: '100%' }} />

      {/* UI Overlay */}
      <div style={{
        position: 'absolute',
        top: '20px',
        left: '20px',
        zIndex: 1000,
        fontFamily: '"IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        pointerEvents: 'none'
      }}>
        {/* Unified Box */}
        <div style={{
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(10px)',
          padding: isMobile ? '12px' : '20px',
          textAlign: 'left',
          borderRadius: '12px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          minWidth: isMobile ? '160px' : '200px'
        }}>
          {!isMobile && (
            <>
              {/* Main Title - Desktop Only */}
              <h1 style={{
                margin: '0 0 16px 0',
                fontSize: '24px',
                fontWeight: '600',
                color: '#ffffff',
                textShadow: '0 2px 4px rgba(0, 0, 0, 0.5)',
                textAlign: 'left'
              }}>
                Safe Indonesia
                <span style={{
                    fontSize: '11px',
                    color: '#9ca3af'
                  }}>
                    <p>Disclaimer: Reverify the map, I checked some isn't accurate.</p>
                  </span>
              </h1>
            </>
          )}
          
          {/* Events Count */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: isMobile ? '0' : '8px',
            borderTop: isMobile ? 'none' : '1px solid rgba(255, 255, 255, 0.1)',
            marginBottom: isMobile ? '10px' : '8px'
          }}>
            <div style={{ textAlign: 'left' }}>
              <div style={{
                fontSize: isMobile ? '12px' : '13px',
                fontWeight: '500',
                color: '#ffffff',
                marginBottom: '2px'
              }}>
                📍 Events: {loading ? '...' : showWarningsOnly ? 
                  `${events.filter(e => e.type === 'warning').length} warnings` : 
                  `${events.length} (${events.filter(e => e.type === 'warning').length} warnings)`}
              </div>
              {!isMobile && (
                <div style={{
                  fontSize: '11px',
                  color: '#9ca3af'
                }}>
                  {loading ? 'Loading events...' : error ? '❌ Error loading events' : 'Live from database'}
                </div>
              )}
            </div>
          </div>

          {/* Time Filter */}
          <div style={{
            paddingTop: isMobile ? '0' : '8px',
            borderTop: isMobile ? 'none' : '1px solid rgba(255, 255, 255, 0.1)',
            marginBottom: isMobile ? '0' : '8px',
            pointerEvents: 'auto'
          }}>
            <div style={{
              fontSize: isMobile ? '11px' : '12px',
              fontWeight: '500',
              color: '#ffffff',
              marginBottom: isMobile ? '4px' : '6px'
            }}>
              Time Filter
            </div>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: isMobile ? '3px' : '4px',
              fontSize: '11px'
            }}>
              {[3, 6, 12, 24, 0].map((hours) => (
                <button
                  key={hours}
                  onClick={() => handleTimeFilterChange(hours)}
                  style={{
                    padding: isMobile ? '3px 6px' : '4px 8px',
                    borderRadius: '4px',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    backgroundColor: timeFilter === hours ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                    color: '#ffffff',
                    cursor: 'pointer',
                    fontSize: isMobile ? '9px' : '10px',
                    fontWeight: '500',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = timeFilter === hours ? 'rgba(255, 255, 255, 0.1)' : 'transparent';
                  }}
                >
                  {hours === 0 ? 'All' : `${hours}h`}
                </button>
              ))}
            </div>
            <div style={{
              fontSize: isMobile ? '9px' : '10px',
              color: '#9ca3af',
              marginTop: isMobile ? '3px' : '4px'
            }}>
              Showing events from last {timeFilter === 0 ? 'all time' : `${timeFilter} hours`}
            </div>
          </div>

          {!isMobile && (
            <>
              {/* Legend - Desktop Only */}
              <div style={{
                paddingTop: '8px',
                borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                marginBottom: '8px'
              }}>
                <div style={{
                  fontSize: '12px',
                  fontWeight: '500',
                  color: '#ffffff',
                  marginBottom: '6px'
                }}>
                  Legend
                </div>
                {/* Desktop legend (horizontal row) */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'row',
                  gap: '16px',
                  fontSize: '12px',
                  color: '#6b7280',
                  padding: '8px 0'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ 
                      width: '12px', 
                      height: '12px', 
                      borderRadius: '50%', 
                      backgroundColor: '#ef4444',
                      boxShadow: '0 1px 3px rgba(239, 68, 68, 0.3)'
                    }}></div>
                    <span style={{ fontWeight: '500' }}>Riot</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ 
                      width: '12px', 
                      height: '12px', 
                      borderRadius: '50%', 
                      backgroundColor: '#f59e0b',
                      boxShadow: '0 1px 3px rgba(245, 158, 11, 0.3)'
                    }}></div>
                    <span style={{ fontWeight: '500' }}>Protest</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ 
                      width: '12px', 
                      height: '12px', 
                      borderRadius: '50%', 
                      backgroundColor: '#ff0000',
                      border: '2px solid #ffffff',
                      boxShadow: '0 1px 3px rgba(255, 0, 0, 0.4)'
                    }}></div>
                    <span style={{ fontWeight: '500' }}>Road Closure</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ 
                      width: '14px', 
                      height: '14px', 
                      borderRadius: '50%', 
                      backgroundColor: '#fbbf24', 
                      border: '2px solid #f59e0b',
                      boxShadow: '0 1px 3px rgba(251, 191, 36, 0.4)'
                    }}></div>
                    <span style={{ fontWeight: '500' }}>Warning</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ 
                      width: '12px', 
                      height: '12px', 
                      borderRadius: '50%', 
                      backgroundColor: '#3b82f6',
                      boxShadow: '0 1px 3px rgba(59, 130, 246, 0.3)'
                    }}></div>
                    <span style={{ fontWeight: '500' }}>Other</span>
                  </div>
                </div>
              </div>

              {/* Status Indicator - Desktop Only */}
              <div style={{
                display: 'flex',
                alignItems: 'left',
                justifyContent: 'left',
                gap: '10px'
              }}>
                <div style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  backgroundColor: getStatusColor(),
                  boxShadow: `0 0 10px ${getStatusColor()}`,
                  animation: scrapingStatus === 'scraping' ? 'pulse 2s infinite' : 'none'
                }} />
                <div style={{ textAlign: 'left' }}>
                  <div style={{
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#ffffff',
                    marginBottom: '2px'
                  }}>
                    {getStatusText()}
                  </div>
                  <div style={{
                    fontSize: '11px',
                    color: '#9ca3af'
                  }}>
                    Last: {lastUpdate}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>


      </div>

      {/* Action Buttons - Responsive Layout */}
      {isMobile ? (
        // FAB Menu for Mobile
        <div style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          zIndex: 1000,
          fontFamily: '"IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: '12px'
        }}>
          {/* FAB Menu Items (show when expanded) */}
          <div style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: '12px',
            overflow: 'hidden'
          }}>
            {/* Refresh FAB */}
            <button
              onClick={() => {
                fetchEvents();
                setFabMenuOpen(false);
              }}
              disabled={loading}
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '24px',
                backgroundColor: loading ? 'rgba(107, 114, 128, 0.9)' : 'rgba(0, 0, 0, 0.9)',
                border: 'none',
                color: '#ffffff',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: fabMenuOpen ? '0 4px 12px rgba(0, 0, 0, 0.3)' : '0 0 0 rgba(0, 0, 0, 0)',
                transition: 'all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                transitionDelay: fabMenuOpen ? '0.2s' : '0s',
                transform: fabMenuOpen ? 'translateX(0) scale(1)' : 'translateX(20px) scale(0.8)',
                opacity: fabMenuOpen ? 1 : 0,
                visibility: fabMenuOpen ? 'visible' : 'hidden'
              }}
              onMouseEnter={(e) => {
                if (!loading && fabMenuOpen) {
                  e.currentTarget.style.transform = fabMenuOpen ? 'translateX(0) scale(1.1)' : 'translateX(20px) scale(0.8)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = fabMenuOpen ? 'translateX(0) scale(1)' : 'translateX(20px) scale(0.8)';
              }}
            >
              {loading ? '⏳' : '🔄'}
            </button>

            {/* Warnings Filter FAB */}
            <button
              onClick={() => {
                setShowWarningsOnly(!showWarningsOnly);
                setFabMenuOpen(false);
              }}
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '24px',
                backgroundColor: showWarningsOnly ? 'rgba(255, 215, 0, 1.0)' : 'rgba(255, 215, 0, 0.9)',
                border: showWarningsOnly ? '2px solid #FF4500' : '1px solid #FF4500',
                color: '#000000',
                cursor: 'pointer',
                fontSize: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: fabMenuOpen ? '0 4px 12px rgba(255, 215, 0, 0.4)' : '0 0 0 rgba(255, 215, 0, 0)',
                transition: 'all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                transitionDelay: fabMenuOpen ? '0.15s' : '0s',
                transform: fabMenuOpen ? 'translateX(0) scale(1)' : 'translateX(20px) scale(0.8)',
                opacity: fabMenuOpen ? 1 : 0,
                visibility: fabMenuOpen ? 'visible' : 'hidden'
              }}
              onMouseEnter={(e) => {
                if (fabMenuOpen) {
                  e.currentTarget.style.transform = fabMenuOpen ? 'translateX(0) scale(1.1)' : 'translateX(20px) scale(0.8)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = fabMenuOpen ? 'translateX(0) scale(1)' : 'translateX(20px) scale(0.8)';
              }}
            >
              ⚠️
            </button>

            {/* Scrape FAB */}
            <button
              onClick={() => {
                handleScrapeTikTok();
                setFabMenuOpen(false);
              }}
              disabled={isScraping}
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '24px',
                backgroundColor: isScraping ? 'rgba(107, 114, 128, 0.9)' : 'rgba(0, 0, 0, 0.9)',
                border: 'none',
                color: '#ffffff',
                cursor: isScraping ? 'not-allowed' : 'pointer',
                fontSize: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: fabMenuOpen ? '0 4px 12px rgba(0, 0, 0, 0.3)' : '0 0 0 rgba(0, 0, 0, 0)',
                transition: 'all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                transitionDelay: fabMenuOpen ? '0.1s' : '0s',
                transform: fabMenuOpen ? 'translateX(0) scale(1)' : 'translateX(20px) scale(0.8)',
                opacity: fabMenuOpen ? 1 : 0,
                visibility: fabMenuOpen ? 'visible' : 'hidden'
              }}
              onMouseEnter={(e) => {
                if (!isScraping && fabMenuOpen) {
                  e.currentTarget.style.transform = fabMenuOpen ? 'translateX(0) scale(1.1)' : 'translateX(20px) scale(0.8)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = fabMenuOpen ? 'translateX(0) scale(1)' : 'translateX(20px) scale(0.8)';
              }}
            >
              {isScraping ? '⏳' : '🔍'}
            </button>
          </div>

          {/* Main FAB Button */}
          <button
            onClick={() => setFabMenuOpen(!fabMenuOpen)}
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '28px',
              backgroundColor: fabMenuOpen ? 'rgba(239, 68, 68, 0.95)' : 'rgba(59, 130, 246, 0.95)',
              border: 'none',
              color: '#ffffff',
              cursor: 'pointer',
              fontSize: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: fabMenuOpen ? 
                '0 8px 25px rgba(239, 68, 68, 0.4)' : 
                '0 6px 20px rgba(59, 130, 246, 0.4)',
              transition: 'all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
              transform: fabMenuOpen ? 'rotate(135deg) scale(1.1)' : 'rotate(0deg) scale(1)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = fabMenuOpen ? 
                'rotate(135deg) scale(1.2)' : 
                'rotate(0deg) scale(1.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = fabMenuOpen ? 
                'rotate(135deg) scale(1.1)' : 
                'rotate(0deg) scale(1)';
            }}
          >
            {fabMenuOpen ? '✕' : '+'}
          </button>
        </div>
      ) : (
        // Desktop Action Buttons (Original Layout)
        <div style={{
          position: 'absolute',
          bottom: '30px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000,
          fontFamily: '"IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          display: 'flex',
          gap: '12px',
          alignItems: 'center'
        }}>
        {/* Refresh Button */}
        <button
          onClick={() => fetchEvents()}
          disabled={loading}
          style={{
            backgroundColor: loading ? 'rgba(107, 114, 128, 0.8)' : 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(10px)',
            color: '#ffffff',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '16px',
            padding: '12px 20px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: loading ? 'not-allowed' : 'pointer',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
            transition: 'all 0.3s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            minWidth: '120px',
            justifyContent: 'center'
          }}
          onMouseEnter={(e) => {
            if (!loading) {
              e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.95)';
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 25px rgba(0, 0, 0, 0.4)';
            }
          }}
          onMouseLeave={(e) => {
            if (!loading) {
              e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.3)';
            }
          }}
        >
          {loading ? (
            <>
              <div style={{
                width: '14px',
                height: '14px',
                border: '2px solid #ffffff',
                borderTop: '2px solid transparent',
                borderRadius: '14px',
                animation: 'spin 1s linear infinite'
              }} />
              Loading...
            </>
          ) : (
            <>
              <span style={{ fontSize: '14px' }}>🔄</span>
              Refresh
            </>
          )}
        </button>

        {/* Warning Filter Button */}
        <button
          onClick={() => setShowWarningsOnly(!showWarningsOnly)}
          style={{
            backgroundColor: showWarningsOnly ? 'rgba(255, 215, 0, 1.0)' : 'rgba(255, 215, 0, 0.7)',
            backdropFilter: 'blur(10px)',
            color: '#000000',
            border: showWarningsOnly ? '3px solid #FF4500' : '2px solid #FF4500',
            borderRadius: '16px',
            padding: '12px 20px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            boxShadow: showWarningsOnly ? '0 6px 25px rgba(255, 215, 0, 0.5)' : '0 4px 20px rgba(255, 215, 0, 0.3)',
            transition: 'all 0.3s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            minWidth: '160px',
            justifyContent: 'center'
          }}
          onMouseEnter={(e) => {
            if (!showWarningsOnly) {
              e.currentTarget.style.backgroundColor = 'rgba(255, 215, 0, 0.9)';
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 25px rgba(255, 215, 0, 0.4)';
            }
          }}
          onMouseLeave={(e) => {
            if (!showWarningsOnly) {
              e.currentTarget.style.backgroundColor = 'rgba(255, 215, 0, 0.7)';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 20px rgba(255, 215, 0, 0.3)';
            }
          }}
        >
          <span style={{ fontSize: '16px' }}>⚠️</span>
          {showWarningsOnly ? 'Show All' : 'Warnings Only'}
        </button>

        {/* Scrape Button */}
        <button
          onClick={handleScrapeTikTok}
          disabled={isScraping}
          style={{
            backgroundColor: isScraping ? 'rgba(107, 114, 128, 0.8)' : 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(10px)',
            color: '#ffffff',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '16px',
            padding: '12px 24px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: isScraping ? 'not-allowed' : 'pointer',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
            transition: 'all 0.3s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            minWidth: '180px',
            justifyContent: 'center'
          }}
          onMouseEnter={(e) => {
            if (!isScraping) {
              e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.95)';
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 25px rgba(0, 0, 0, 0.4)';
            }
          }}
          onMouseLeave={(e) => {
            if (!isScraping) {
              e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.3)';
            }
          }}
        >
          {isScraping ? (
            <>
              <div style={{
                width: '16px',
                height: '16px',
                border: '2px solid #ffffff',
                borderTop: '2px solid transparent',
                borderRadius: '16px',
                animation: 'spin 1s linear infinite'
              }} />
              Scraping...
            </>
          ) : (
            <>
              <span style={{ fontSize: '16px' }}>🔍</span>
              Scrape TikTok
            </>
          )}
        </button>
        </div>
      )}

      {/* Additional CSS for button animations */}
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          @keyframes warningPulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.1); opacity: 0.8; }
          }
          .mapboxgl-canvas-container canvas {
            animation: ${scrapingStatus === 'scraping' ? 'none' : 'none'};
          }
          @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&display=swap');
        `
      }} />

      {/* ChatBot Component */}
      <ChatBot />
    </div>
  );
}
