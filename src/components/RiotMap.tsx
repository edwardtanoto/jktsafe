'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

interface Event {
  id: number;
  title: string;
  description: string | null;
  lat: number;
  lng: number;
  source: string;
  url: string | null;
  verified: boolean;
  type: string;
  createdAt: string;
}

interface RiotMapProps {
  accessToken: string;
  events?: Event[];
}

export default function RiotMap({ accessToken, events: initialEvents }: RiotMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [events, setEvents] = useState<Event[]>(initialEvents || []);
  const [loading, setLoading] = useState(true);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || !accessToken) return;

    mapboxgl.accessToken = accessToken;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [117.5, -2.5], // Center of Indonesia
      zoom: 5,
      attributionControl: false
    });

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.current.addControl(new mapboxgl.AttributionControl(), 'bottom-right');

    map.current.on('load', () => {
      setLoading(false);
    });

    return () => {
      if (map.current) {
        map.current.remove();
      }
    };
  }, [accessToken]);

  // Add markers for events
  useEffect(() => {
    if (!map.current || !events.length) return;

    // Clear existing markers
    const existingMarkers = document.querySelectorAll('.mapboxgl-marker');
    existingMarkers.forEach(marker => marker.remove());

    events.forEach((event) => {
      // Create marker element
      const markerElement = document.createElement('div');
      markerElement.className = `w-8 h-8 rounded-full border-2 border-white shadow-lg cursor-pointer ${
        event.verified ? 'bg-red-500' : 'bg-orange-500'
      }`;

      // Add inner circle for better visibility
      const innerCircle = document.createElement('div');
      innerCircle.className = 'w-3 h-3 bg-white rounded-full absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2';
      markerElement.appendChild(innerCircle);

      // Create popup
      const popup = new mapboxgl.Popup({ offset: 25 })
        .setHTML(`
          <div class="max-w-xs">
            <h3 class="font-bold text-lg mb-2">${event.title}</h3>
            ${event.description ? `<p class="text-sm mb-2">${event.description}</p>` : ''}
            <div class="text-xs text-gray-600 mb-2">
              <p><strong>Source:</strong> ${event.source}</p>
              <p><strong>Type:</strong> ${event.type}</p>
              <p><strong>Verified:</strong> ${event.verified ? 'Yes' : 'No'}</p>
              <p><strong>Date:</strong> ${new Date(event.createdAt).toLocaleDateString()}</p>
            </div>
            ${event.url ? `<a href="${event.url}" target="_blank" class="text-blue-500 hover:text-blue-700 text-sm">View Source →</a>` : ''}
          </div>
        `);

      // Create and add marker
      new mapboxgl.Marker(markerElement)
        .setLngLat([event.lng, event.lat])
        .setPopup(popup)
        .addTo(map.current!);
    });

    // Fit map to show all markers
    if (events.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();

      events.forEach((event) => {
        bounds.extend([event.lng, event.lat]);
      });

      map.current.fitBounds(bounds, {
        padding: 50,
        maxZoom: 12
      });
    }
  }, [events]);

  // Fetch events from API
  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const response = await fetch('/api/events?type=riot&limit=100');
        const data = await response.json();

        if (data.success) {
          setEvents(data.events);
        }
      } catch (error) {
        console.error('Error fetching events:', error);
      }
    };

    if (!initialEvents) {
      fetchEvents();
    }
  }, [initialEvents]);

  if (!accessToken) {
    return (
      <div className="w-full h-96 bg-gray-100 rounded-lg flex items-center justify-center">
        <p className="text-gray-500">Mapbox access token not configured</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-96">
      {loading && (
        <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-10">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading map...</p>
          </div>
        </div>
      )}
      <div ref={mapContainer} className="w-full h-full rounded-lg" />
      <div className="absolute top-4 left-4 bg-white p-3 rounded-lg shadow-md z-10">
        <h3 className="font-semibold text-sm mb-1">Protest Locations</h3>
        <p className="text-xs text-gray-600">{events.length} events found</p>
        <div className="flex items-center gap-2 mt-2">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-red-500 border border-white"></div>
            <span className="text-xs">Verified</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-orange-500 border border-white"></div>
            <span className="text-xs">Unverified</span>
          </div>
        </div>
      </div>
    </div>
  );
}