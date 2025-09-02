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

export default function ProtestMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const retryScheduledRef = useRef<boolean>(false);
  const [scrapingStatus, setScrapingStatus] = useState<'idle' | 'scraping' | 'completed' | 'error'>('idle');

  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<number>(24); // Default to 24 hours
  const [eventFilter, setEventFilter] = useState<'all' | 'warnings' | 'road_closures' | 'protests'>('all');
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [fabMenuOpen, setFabMenuOpen] = useState<boolean>(false);
  const [nextUpdateTime, setNextUpdateTime] = useState<string>('Calculating...');
  const [mapStyle, setMapStyle] = useState<string>('dark-v11');

  // Available Mapbox styles
  const mapboxStyles = [
    { id: 'dark-v11', name: '🌕 Dark', emoji: '🌕', isCustom: false },
    { id: 'edwardtanoto12/cmf13yyv601kp01pj9fkbgd1g', name: '🌃 Night City', emoji: '🌃', isCustom: true },
  ];

  // Function to change map style
  const changeMapStyle = (styleId: string) => {
    if (map.current && styleId !== mapStyle) {
      setMapStyle(styleId);
      
      // Check if it's a custom style or standard Mapbox style
      const style = mapboxStyles.find(s => s.id === styleId);
      const styleUrl = style?.isCustom 
        ? `mapbox://styles/${styleId}` 
        : `mapbox://styles/mapbox/${styleId}`;
      
      map.current.setStyle(styleUrl);
      
      // Re-add markers after style change and reset zoom limits
      map.current.once('styledata', () => {
        // Ensure consistent zoom limits across all styles
        updateMapMarkers();
      });
    }
  };

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
        fetch(`/api/events?type=protest${timeParam}`),
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



  // Function to check scraping status periodically
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await fetch('/api/scrape/status');
        if (response.ok) {
          const data: any = await response.json();
          setScrapingStatus(data.status || 'idle');
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
      type: 'FeatureCollection' as const,
      features: events.map(event => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
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
          emoji: event.type === 'protest' ? '🔥' : event.type === 'road_closure' ? '🚧' : event.type === 'warning' ? '⚠️' : '📍',
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
    if (!map.current) return;
    if (!map.current.isStyleLoaded()) {
      // Schedule a one-shot retry when the map becomes idle to avoid race on mobile
      if (!retryScheduledRef.current) {
        retryScheduledRef.current = true;
        map.current.once('idle', () => {
          retryScheduledRef.current = false;
          updateMapMarkers();
        });
      }
      return;
    }

    // Filter events based on eventFilter state
    let filteredEvents = events;
    switch (eventFilter) {
      case 'warnings':
        filteredEvents = events.filter(event => event.type === 'warning');
        break;
      case 'road_closures':
        filteredEvents = events.filter(event => event.type === 'road_closure');
        break;
      case 'protests':
        filteredEvents = events.filter(event => event.type === 'protest');
        break;
      case 'all':
      default:
        filteredEvents = events;
        break;
    }
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

      // Add circle layer for individual protest events
      map.current.addLayer({
        id: 'protest-circles',
        type: 'circle',
        source: 'events',
        filter: ['all', ['==', ['get', 'type'], 'protest'], ['!', ['has', 'point_count']]],
        paint: {
          'circle-radius': 18,
          'circle-color': '#ff4444',
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
        if (!map.current) return;
        const features = map.current.queryRenderedFeatures(e.point, {
          layers: ['clusters']
        });

        if (features.length > 0 && features[0].properties) {
          const clusterId = features[0].properties.cluster_id;
          const pointCount = features[0].properties.point_count;
          const clusterSource = (map.current.getSource('events') as any);

          // Get cluster expansion zoom
          clusterSource.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
            if (err || !map.current) return;

            map.current.easeTo({
              center: (features[0].geometry as any).coordinates,
              zoom: zoom
            });
          });
        }
      });

      // Add click events for individual events
      ['protest-circles', 'road-closure-circles', 'warning-circles', 'event-emoji'].forEach(layerId => {
        if (!map.current) return;
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
              <div class="custom-popup-content">
                <!-- Header with verification badge -->
                <div class="popup-header">
                  <h3 class="popup-title">
                    ${properties.emoji} ${properties.title}
                  </h3>
                  ${userInfo.verified ? '<span class="verified-badge">✓ VERIFIED</span>' : ''}
                </div>

                <p class="popup-description">
                  ${truncatedDescription}
                </p>

                <!-- Compact Warning Alert -->
                <div class="popup-warning-alert">
                  <div class="popup-warning-text">
                    ⚠️ ${properties.extractedLocation || 'Unknown Location'} • ${Math.round((properties.confidenceScore || 0) * 100)}% confidence
                  </div>
                </div>

                <!-- Compact Social Metrics -->
                <div class="popup-metrics">
                  ${socialMetrics.views && socialMetrics.views !== '0' ? `
                    <span class="metric-badge">
                      👀 Views: ${socialMetrics.views}
                    </span>
                  ` : ''}
                  ${socialMetrics.retweets && socialMetrics.retweets > 10 ? `
                    <span class="metric-badge">
                      🔄 Retweets: ${socialMetrics.retweets}
                    </span>
                  ` : ''}
                </div>

                <!-- Compact User Info -->
                <div class="popup-user-info">
                  <div class="popup-user-text">
                    ${isLikelyBot ? '🤖 Potential Bot' : '👤 User'} • Since ${accountYear} • ${followersCount.toLocaleString()} followers
                  </div>
                </div>

                <!-- Compact Metadata -->
                <div class="popup-metadata">
                  <div class="popup-meta-text">
                    Twitter • ${new Date(properties.createdAt).toLocaleDateString()} •
                    ${properties.verified ? '<span class="verified-text">Verified</span>' : '<span class="unverified-text">Unverified Account</span>'}
                  </div>
                  ${properties.url ? `<a href="${properties.url}" target="_blank" class="popup-link">View Tweet →</a>` : ''}
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
              <div class="custom-popup-content">
                <!-- Header with road closure icon and severity -->
                <div class="popup-header">
                  <h3 class="popup-title">
                    ${properties.emoji} ${properties.title}
                  </h3>
                  ${properties.severity ? `<span class="severity-badge" style="background: ${severityColor};">${severityText.toUpperCase()}</span>` : ''}
                </div>

                <p class="popup-description">
                  ${properties.description || 'Road closure reported from private sources'}
                </p>

                <!-- Road Closure Alert -->
                <div class="popup-warning-alert">
                  <div class="popup-warning-text">
                    🚧 Road Closure Alert
                  </div>
                  ${properties.extractedLocation ? `<div class="popup-warning-location">Location: ${properties.extractedLocation}</div>` : ''}
                </div>

                <!-- Road Closure Details -->
                <div class="popup-details">
                  ${properties.closureType ? `<div class="detail-item"><span>🚧</span><span>Type: <strong>${properties.closureType}</strong></span></div>` : ''}
                  ${properties.reason ? `<div class="detail-item"><span>❓</span><span>Reason: <strong>${properties.reason}</strong></span></div>` : ''}
                  ${properties.affectedRoutes && properties.affectedRoutes.length > 0 ? `<div class="detail-item"><span>🛣️</span><span>Affected: <strong>${properties.affectedRoutes.join(', ')}</strong></span></div>` : ''}
                  ${properties.alternativeRoutes && properties.alternativeRoutes.length > 0 ? `<div class="detail-item"><span>↩️</span><span>Alternative: <strong>${properties.alternativeRoutes.join(', ')}</strong></span></div>` : ''}
                </div>

                <!-- Metadata -->
                <div class="popup-user-info">
                  <div class="popup-user-text">
                    <div class="meta-item">
                      <span>🔗</span>
                      <span>Source: <strong>${properties.source}</strong></span>
                    </div>
                    <div class="meta-item">
                      <span>⏰</span>
                      <span>${new Date(properties.createdAt).toLocaleString()}</span>
                    </div>
                    ${properties.verified ? '<div class="meta-item"><span>✅</span><span class="verified-text">Verified</span></div>' : '<div class="meta-item"><span>⚠️</span><span class="unverified-text">Verified Anonymous Tips</span></div>'}
                    ${properties.url ? `<a href="${properties.url}" target="_blank" class="popup-link">🔗 View Source →</a>` : ''}
                  </div>
                </div>
              </div>
            `;
          } else {
            // Regular popup for other event types
            popupHTML = `
              <div class="custom-popup-content">
                <h3 class="popup-title">
                  ${properties.emoji} ${properties.title}
                </h3>
                <br/>
                <p class="popup-description">
                  ${properties.description || 'No description available'}
                </p>
                <div class="popup-details">
                  <div class="detail-item">
                    <span>📍</span>
                    <span>Type: <strong>${properties.type}</strong></span>
                  </div>
                  <div class="detail-item">
                    <span>🔗</span>
                    <span>Source: <strong>${properties.source}</strong></span>
                  </div>
                  <div class="detail-item">
                    <span>⏰</span>
                    <span>${new Date(properties.originalCreatedAt || properties.createdAt).toLocaleString()}</span>
                  </div>
                  ${properties.verified ? '<div class="detail-item"><span>✅</span><span class="verified-text">Verified Event</span></div>' : ''}
                  ${properties.url ? `<a href="${properties.url}" target="_blank" class="popup-link">🔗 View Original Source →</a>` : ''}
                </div>
              </div>
            `;
          }
          
          const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: true })
            .setLngLat(coordinates)
            .setHTML(popupHTML);
            
          if (map.current) {
            popup.addTo(map.current);
            
            // Fly to location
            map.current.flyTo({
              center: coordinates,
              zoom: 15,
              speed: 1.2,
              curve: 1,
              easing: (t: number) => t,
              essential: true
            });
          }
        });

        // Add cursor pointer for interactive pins
        map.current.on('mouseenter', layerId, () => {
          if (map.current) {
            map.current.getCanvas().style.cursor = 'pointer';
          }
        });
        map.current.on('mouseleave', layerId, () => {
          if (map.current) {
            map.current.getCanvas().style.cursor = '';
          }
        });
      });

      // Add cursor pointer for clusters
      map.current.on('mouseenter', 'clusters', () => {
        if (map.current) {
          map.current.getCanvas().style.cursor = 'pointer';
        }
      });
      map.current.on('mouseleave', 'clusters', () => {
        if (map.current) {
          map.current.getCanvas().style.cursor = '';
        }
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

    if (!mapContainer.current) {
      console.error('Map container ref is not available');
      return;
    }

    mapboxgl.accessToken = token;

    // Get the initial style URL based on whether it's custom or standard
    const initialStyle = mapboxStyles.find(s => s.id === mapStyle);
    const initialStyleUrl = initialStyle?.isCustom 
      ? `mapbox://styles/${mapStyle}` 
      : `mapbox://styles/mapbox/${mapStyle}`;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: initialStyleUrl,
      center: [106.8456, -6.2088], // Center on Jakarta
      zoom: 11,
      attributionControl: false
    });

    map.current.on('load', () => {
      console.log('🗺️ Map loaded, waiting for events data...');
      // Ensure markers attempt to render as soon as style is ready
      updateMapMarkers();
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

  // Calculate next update time
  useEffect(() => {
    const calculateNextUpdate = () => {
      const now = new Date();
      const currentHour = now.getHours();

      // Peak hours: 12-23, 0-1 (13 hours total)
      // Conserve hours: 2-11 (10 hours total)
      let nextUpdate: Date;

      if ((currentHour >= 12 && currentHour <= 23) || currentHour <= 1) {
        // Peak hours - next update in 1 hour
        nextUpdate = new Date(now.getTime() + 60 * 60 * 1000);
      } else {
        // Conserve hours - next update in 2 hours
        nextUpdate = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      }

      // Round to next hour mark
      nextUpdate.setMinutes(0, 0, 0);

      const timeString = nextUpdate.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });

      setNextUpdateTime(timeString);
    };

    calculateNextUpdate();
    const interval = setInterval(calculateNextUpdate, 60000); // Update every minute

    return () => clearInterval(interval);
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
                          newEvents[existingIndex] = { ...newEvent, type: newEvent.type || 'protest' };
                        } else {
                          // Add new event
                          newEvents.unshift({ ...newEvent, type: newEvent.type || 'protest' });
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
      if (!loading) {
        console.log('🔄 Periodic refresh of events (fallback)...');
        fetchEvents();
      }
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(refreshInterval);
  }, []);

  // Update map markers when events change or filter changes
  useEffect(() => {
    updateMapMarkers();
  }, [events, eventFilter]);

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
    <div id="map" style={{
      width: '100%',
      height: '100vh',
      position: 'relative',
      // Add padding to prevent circle clipping on edges
      padding: '10px',
      boxSizing: 'border-box'
    }}>
      <div ref={mapContainer} style={{
        height: 'calc(100vh - 20px)',
        width: '100%',
        // Ensure map can render circles that extend beyond bounds
        overflow: 'hidden',
        borderRadius: '8px'
      }} />

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
                📍 Events: {loading ? '...' : (() => {
                let count = 0;
                let label = '';
                switch (eventFilter) {
                  case 'warnings':
                    count = events.filter(e => e.type === 'warning').length;
                    label = 'warnings';
                    break;
                  case 'road_closures':
                    count = events.filter(e => e.type === 'road_closure').length;
                    label = 'road closures';
                    break;
                  case 'protests':
                    count = events.filter(e => e.type === 'protest').length;
                    label = 'protests';
                    break;
                  case 'all':
                  default:
                    count = events.length;
                    label = 'total events';
                    break;
                }
                return `${count} ${label}`;
              })()}
              </div>
               {/* Status Information */}
               <div style={{
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '6px'
                  }}>
                    <div style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      backgroundColor: getStatusColor(),
                      boxShadow: `0 0 10px ${getStatusColor()}`,
                      animation: scrapingStatus === 'scraping' ? 'pulse 2s infinite' : 'none'
                    }} />
                    <span style={{
                      fontSize: '12px',
                      fontWeight: '500',
                      color: '#ffffff'
                    }}>
                      {getStatusText()} - Updates every 1 hour
                    </span>
                  </div>
                  <div style={{
                    fontSize: '10px',
                    color: '#9ca3af',
                    lineHeight: '1.3'
                  }}>
                  </div>
                </div>
              {!isMobile && (
                <div style={{
                  fontSize: '11px',
                  color: '#9ca3af'
                }}>
                  {loading ? 'Loading events...' : error ? '❌ Error loading events' :  <div>Next update: {nextUpdateTime}</div>}
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

            {/* Map Style FAB */}
            <button
              onClick={() => {
                // Cycle through map styles
                const currentIndex = mapboxStyles.findIndex(style => style.id === mapStyle);
                const nextIndex = (currentIndex + 1) % mapboxStyles.length;
                changeMapStyle(mapboxStyles[nextIndex].id);
                // Keep FAB menu open when style is changed
              }}
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '24px',
                backgroundColor: 'rgba(34, 197, 94, 0.9)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: '#ffffff',
                cursor: 'pointer',
                fontSize: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: fabMenuOpen ? '0 4px 12px rgba(34, 197, 94, 0.4)' : '0 0 0 rgba(34, 197, 94, 0)',
                transition: 'all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                transitionDelay: fabMenuOpen ? '0.1s' : '0s',
                transform: fabMenuOpen ? 'translateX(0) scale(1)' : 'translateX(20px) scale(0.8)',
                opacity: fabMenuOpen ? 1 : 0,
                visibility: fabMenuOpen ? 'visible' : 'hidden'
              }}
              onMouseEnter={(e) => {
                if (fabMenuOpen) {
                  e.currentTarget.style.transform = 'translateX(0) scale(1.1)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = fabMenuOpen ? 'translateX(0) scale(1)' : 'translateX(20px) scale(0.8)';
              }}
            >
              {(() => {
                const currentStyle = mapboxStyles.find(style => style.id === mapStyle);
                return currentStyle ? currentStyle.emoji : '🌙';
              })()}
            </button>

            {/* Filter Menu FAB */}
            <button
              onClick={() => {
                // Cycle through filters on mobile: protest -> road closure -> warning -> all -> protest...
                const filters = ['protests', 'road_closures', 'warnings', 'all'] as const;
                const currentIndex = filters.indexOf(eventFilter);
                const nextIndex = (currentIndex + 1) % filters.length;
                setEventFilter(filters[nextIndex]);
                // Keep FAB menu open when filter is clicked
              }}
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '24px',
                backgroundColor: 'rgba(59, 130, 246, 0.9)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: '#ffffff',
                cursor: 'pointer',
                fontSize: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: fabMenuOpen ? '0 4px 12px rgba(59, 130, 246, 0.4)' : '0 0 0 rgba(59, 130, 246, 0)',
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
              {(() => {
                switch (eventFilter) {
                  case 'warnings': return '⚠️';
                  case 'road_closures': return '🚧';
                  case 'protests': return '💬';
                  default: return '📍';
                }
              })()}
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

        {/* Map Style Selector Button */}
        <button
          onClick={() => {
            // Cycle through map styles
            const currentIndex = mapboxStyles.findIndex(style => style.id === mapStyle);
            const nextIndex = (currentIndex + 1) % mapboxStyles.length;
            changeMapStyle(mapboxStyles[nextIndex].id);
          }}
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(10px)',
            color: '#ffffff',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '16px',
            padding: '12px 16px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
            transition: 'all 0.3s ease',
            minWidth: '140px',
            outline: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.95)';
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 25px rgba(0, 0, 0, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.3)';
          }}
        >
          {(() => {
            const currentStyle = mapboxStyles.find(style => style.id === mapStyle);
            return currentStyle ? `${currentStyle.emoji} ${currentStyle.name.split(' ').slice(1).join(' ')}` : '🌙 Dark';
          })()}
        </button>

        {/* Event Filter Toggle Button */}
        <button
          onClick={() => {
            // Cycle through filters on desktop: protest -> road closure -> warning -> all -> protest...
            const filters = ['protests', 'road_closures', 'warnings', 'all'] as const;
            const currentIndex = filters.indexOf(eventFilter);
            const nextIndex = (currentIndex + 1) % filters.length;
            setEventFilter(filters[nextIndex]);
          }}
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(10px)',
            color: '#ffffff',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '16px',
            padding: '12px 16px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
            transition: 'all 0.3s ease',
            minWidth: '160px',
            outline: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.95)';
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 25px rgba(0, 0, 0, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.3)';
          }}
        >
          {(() => {
            switch (eventFilter) {
              case 'protests': return <>💬 Protests</>;
              case 'road_closures': return <>🚧 Road Closures</>;
              case 'warnings': return <>⚠️ Warnings</>;
              case 'all':
              default: return <>📍 All Events</>;
            }
          })()}
        </button>


        </div>
      )}

      {/* Additional CSS for button animations and popup styling */}
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

          /* Custom Mapbox Popup Styles */
          .mapboxgl-popup-content {
            background: rgba(0, 0, 0, 0.95) !important;
            backdrop-filter: blur(10px) !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
            border-radius: 12px !important;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3) !important;
            color: #ffffff !important;
            font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
            font-size: 14px !important;
            max-width: 320px !important;
            padding: 16px !important;
          }

          .mapboxgl-popup-tip {
            background: rgba(0, 0, 0, 0.95) !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
          }

          .mapboxgl-popup-close-button {
            background: none !important;
            border: none !important;
            color: #9ca3af !important;
            font-size: 20px !important;
            font-weight: 300 !important;
            padding: 8px !important;
            margin: 4px !important;
            cursor: pointer !important;
            border-radius: 4px !important;
            transition: all 0.2s ease !important;
            line-height: 1 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            width: 24px !important;
            height: 24px !important;
          }

          .mapboxgl-popup-close-button:hover {
            background: rgba(255, 255, 255, 0.1) !important;
            color: #ffffff !important;
            transform: scale(1.1) !important;
          }

          /* Custom Popup Content Styles */
          .custom-popup-content {
            max-width: 320px;
          }

          .popup-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 8px;
          }

          .popup-title {
            margin: 0;
            color: #ffffff;
            font-size: 15px;
            font-weight: 600;
            flex: 1;
            font-family: 'IBM Plex Sans', sans-serif;
          }

          .popup-description {
            margin: 0 0 10px 0;
            color: #9ca3af;
            font-size: 13px;
            line-height: 1.3;
            font-family: 'IBM Plex Sans', sans-serif;
          }

          .popup-warning-alert {
            background: rgba(245, 158, 11, 0.1);
            border-left: 3px solid #f59e0b;
            padding: 8px;
            margin-bottom: 10px;
            border-radius: 4px;
          }

          .popup-warning-text {
            font-size: 11px;
            font-weight: 500;
            color: #fbbf24;
            font-family: 'IBM Plex Sans', sans-serif;
          }

          .popup-warning-location {
            font-size: 10px;
            color: #fbbf24;
            margin-top: 2px;
            font-family: 'IBM Plex Sans', sans-serif;
          }

          .popup-metrics {
            display: flex;
            gap: 8px;
            margin-bottom: 10px;
            font-size: 11px;
          }

          .metric-badge {
            background: rgba(255, 255, 255, 0.1);
            padding: 4px 6px;
            border-radius: 3px;
            font-weight: 500;
            color: #9ca3af;
            font-family: 'IBM Plex Sans', sans-serif;
          }

          .popup-user-info {
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            padding-top: 8px;
            margin-bottom: 8px;
          }

          .popup-user-text {
            font-size: 11px;
            color: #9ca3af;
            line-height: 1.4;
            font-family: 'IBM Plex Sans', sans-serif;
          }

          .popup-metadata {
            font-size: 11px;
            color: #9ca3af;
            line-height: 1.4;
            font-family: 'IBM Plex Sans', sans-serif;
          }

          .popup-meta-text {
            margin-bottom: 4px;
            font-family: 'IBM Plex Sans', sans-serif;
          }

          .popup-details {
            display: flex;
            flex-direction: column;
            gap: 4px;
            font-size: 12px;
            color: #9ca3af;
            margin-bottom: 10px;
          }

          .detail-item {
            display: flex;
            align-items: center;
            gap: 6px;
            font-family: 'IBM Plex Sans', sans-serif;
          }

          .detail-item strong {
            color: #ffffff;
            font-family: 'IBM Plex Sans', sans-serif;
          }

          .meta-item {
            display: flex;
            align-items: center;
            gap: 6px;
            font-family: 'IBM Plex Sans', sans-serif;
          }

          .meta-item strong {
            color: #ffffff;
            font-family: 'IBM Plex Sans', sans-serif;
          }

          .popup-link {
            color: #3b82f6;
            text-decoration: none;
            font-weight: 500;
            font-family: 'IBM Plex Sans', sans-serif;
            display: inline-block;
            margin-top: 6px;
          }

          .popup-link:hover {
            color: #1d4ed8;
          }

          .verified-badge {
            background: #059669;
            color: white;
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 12px;
            font-weight: 500;
            font-family: 'IBM Plex Sans', sans-serif;
          }

          .severity-badge {
            color: white;
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 12px;
            font-weight: 500;
            font-family: 'IBM Plex Sans', sans-serif;
          }

          .verified-text {
            color: #059669;
            font-weight: 500;
            font-family: 'IBM Plex Sans', sans-serif;
          }

          .unverified-text {
            color: #d97706;
            font-weight: 500;
            font-family: 'IBM Plex Sans', sans-serif;
          }
        `
      }} />

      {/* ChatBot Component */}
      <ChatBot />
    </div>
  );
}
