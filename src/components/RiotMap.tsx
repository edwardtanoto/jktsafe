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
  createdAt: string;
  closureType?: string;
  reason?: string;
  severity?: string;
  affectedRoutes?: string[];
  alternativeRoutes?: string[];
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

  // Function to fetch events from database
  const fetchEvents = async (customTimeFilter?: number) => {
    try {
      setLoading(true);
      setError(null);

      // Use the passed timeFilter or fall back to state
      const activeTimeFilter = customTimeFilter !== undefined ? customTimeFilter : timeFilter;
      
      // Fetch both regular events and road closures with time filter
      const timeParam = activeTimeFilter > 0 ? `&hours=${activeTimeFilter}` : '';
      const [eventsResponse, roadClosuresResponse] = await Promise.all([
        fetch(`/api/events?type=riot&limit=100${timeParam}`),
        // For road closures: if activeTimeFilter is 0 (All), don't send hours param, otherwise send the activeTimeFilter value
        fetch(`/api/road-closures${activeTimeFilter > 0 ? `?hours=${activeTimeFilter}` : ''}`)
      ]);

      if (!eventsResponse.ok) {
        throw new Error('Failed to fetch events');
      }

      const eventsData = await eventsResponse.json() as { success: boolean; events: Event[]; error?: string };
      const roadClosuresData = await roadClosuresResponse.json() as { success: boolean; roadClosures: Event[]; error?: string };

      if (eventsData.success && roadClosuresData.success) {
        // Combine events and road closures, marking road closures appropriately
        const allEvents = [
          ...eventsData.events,
          ...roadClosuresData.roadClosures.map(rc => ({ ...rc, type: 'road_closure' as const }))
        ];

        setEvents(allEvents);
        console.log(`📍 Loaded ${eventsData.events.length} events and ${roadClosuresData.roadClosures.length} road closures from database`);
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
          createdAt: event.createdAt,
          severity: event.severity,
          closureType: event.closureType,
          reason: event.reason,
          affectedRoutes: event.affectedRoutes,
          alternativeRoutes: event.alternativeRoutes,
          emoji: event.type === 'riot' ? '🔥' : event.type === 'protest' ? '👥' : event.type === 'road_closure' ? '🚧' : '📍'
        }
      }))
    };
  };

  // Function to update map markers
  const updateMapMarkers = () => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    const eventData = createEventGeoJSON(events);

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

      // Add circle layer for individual other events
      map.current.addLayer({
        id: 'other-circles',
        type: 'circle',
        source: 'events',
        filter: ['all', ['!=', ['get', 'type'], 'riot'], ['!=', ['get', 'type'], 'protest'], ['!=', ['get', 'type'], 'road_closure'], ['!', ['has', 'point_count']]],
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
          'text-size': 20,
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
      ['riot-circles', 'protest-circles', 'other-circles', 'event-emoji'].forEach(layerId => {
        map.current.on('click', layerId, (e: any) => {
          const feature = e.features[0];
          const coordinates = feature.geometry.coordinates.slice();
          const properties = feature.properties;

          // Create detailed popup for individual events
          const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: true })
            .setLngLat(coordinates)
            .setHTML(`
              <div style="max-width: 320px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
                <h3 style="margin: 0 0 8px 0; color: #1f2937; font-size: 16px; font-weight: 600;">
                  ${properties.emoji} ${properties.title}
                </h3>
                <p style="margin: 0 0 12px 0; color: #6b7280; font-size: 14px; line-height: 1.4;">
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
                    <span>${new Date(properties.createdAt).toLocaleString()}</span>
                  </div>
                  ${properties.verified ? '<div style="display: flex; align-items: center; gap: 6px;"><span>✅</span><span style="color: #059669; font-weight: 500;">Verified Event</span></div>' : ''}
                  ${properties.url ? `<div style="margin-top: 8px;"><a href="${properties.url}" target="_blank" style="color: #3b82f6; text-decoration: none; font-weight: 500;">🔗 View Original Source →</a></div>` : ''}
                </div>
              </div>
            `)
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

  // Fetch events on mount and set up periodic refresh
  useEffect(() => {
    fetchEvents();

    // Set up periodic refresh every 5 minutes
    const refreshInterval = setInterval(() => {
      if (!loading && !isScraping) {
        console.log('🔄 Periodic refresh of events...');
        fetchEvents();
      }
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(refreshInterval);
  }, []);

  // Update map markers when events change
  useEffect(() => {
    updateMapMarkers();
  }, [events]);

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
          padding: '20px',
          textAlign: 'left',
          borderRadius: '12px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          minWidth: '200px'
        }}>
          {/* Main Title */}
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
          
          {/* Events Count */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: '8px',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            marginBottom: '8px'
          }}>
            <div style={{ textAlign: 'left' }}>
              <div style={{
                fontSize: '13px',
                fontWeight: '500',
                color: '#ffffff',
                marginBottom: '2px'
              }}>
                📍 Events: {loading ? '...' : events.length}
              </div>
              <div style={{
                fontSize: '11px',
                color: '#9ca3af'
              }}>
                {loading ? 'Loading events...' : error ? '❌ Error loading events' : 'Live from database'}
              </div>
            </div>
          </div>

          {/* Time Filter */}
          <div style={{
            paddingTop: '8px',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            marginBottom: '8px',
            pointerEvents: 'auto'
          }}>
            <div style={{
              fontSize: '12px',
              fontWeight: '500',
              color: '#ffffff',
              marginBottom: '6px'
            }}>
              Time Filter
            </div>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '4px',
              fontSize: '11px'
            }}>
              {[3, 6, 12, 24, 0].map((hours) => (
                <button
                  key={hours}
                  onClick={() => handleTimeFilterChange(hours)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    backgroundColor: timeFilter === hours ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                    color: '#ffffff',
                    cursor: 'pointer',
                    fontSize: '10px',
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
              fontSize: '10px',
              color: '#9ca3af',
              marginTop: '4px'
            }}>
              Showing events from last {timeFilter === 0 ? 'all time' : `${timeFilter} hours`}
            </div>
          </div>

          {/* Legend */}
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
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              fontSize: '11px',
              color: '#9ca3af'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#ff4444' }}></div>
                <span>Riot 🔥</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#ffaa00' }}></div>
                <span>Protest 👥</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#4444ff' }}></div>
                <span>Other 📍</span>
              </div>
            </div>
          </div>

          {/* Status Indicator */}
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
        </div>


      </div>

      {/* Action Buttons - Bottom Center */}
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
          @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&display=swap');
        `
      }} />

      {/* ChatBot Component */}
      <ChatBot />
    </div>
  );
}
