'use client';

import { useState, useRef, useEffect } from 'react';
import mapboxgl from 'mapbox-gl';

interface ReportModalProps {
  onClose: () => void;
  onSubmit: () => void;
}

export default function ReportModal({ onClose, onSubmit }: ReportModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<[number, number] | null>(null);
  const [loading, setLoading] = useState(false);
  const modalMapRef = useRef<HTMLDivElement>(null);
  const modalMap = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);

  // Initialize modal map
  useEffect(() => {
    if (!modalMapRef.current) return;

    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

    modalMap.current = new mapboxgl.Map({
      container: modalMapRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [117.5, -2.5], // Center on Indonesia
      zoom: 5
    });

    modalMap.current.on('click', (e) => {
      const { lng, lat } = e.lngLat;

      // Remove existing marker
      if (markerRef.current) {
        markerRef.current.remove();
      }

      // Add new marker
      const markerElement = document.createElement('div');
      markerElement.style.width = '20px';
      markerElement.style.height = '20px';
      markerElement.style.backgroundColor = '#ef4444';
      markerElement.style.border = '3px solid #ffffff';
      markerElement.style.borderRadius = '50%';

      markerRef.current = new mapboxgl.Marker(markerElement)
        .setLngLat([lng, lat])
        .addTo(modalMap.current!);

      setSelectedLocation([lng, lat]);
    });

    return () => {
      if (modalMap.current) {
        modalMap.current.remove();
      }
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title || !description || !selectedLocation) {
      alert('Please fill all fields and select a location on the map');
      return;
    }

    setLoading(true);

    try {
      const [lng, lat] = selectedLocation;

      const response = await fetch('/api/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title,
          description,
          lat,
          lng,
          source: 'User Report',
          verified: false,
          type: 'crowd'
        })
      });

      const data = await response.json();

      if (data.success) {
        alert('Report submitted successfully!');
        onSubmit();
      } else {
        alert('Failed to submit report');
      }
    } catch (error) {
      console.error('Error submitting report:', error);
      alert('Failed to submit report');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 md:p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[95vh] md:max-h-[90vh] overflow-y-auto">
        <div className="p-4 md:p-6">
          <div className="flex justify-between items-center mb-4 md:mb-6">
            <h2 className="text-xl md:text-2xl font-bold">Report Incident</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-xl md:text-2xl"
            >
              ×
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 md:space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Incident Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="Brief title of the incident"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 h-24 md:h-32 resize-none"
                placeholder="Detailed description of the incident"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Location
              </label>
              <p className="text-sm text-gray-600 mb-2">
                Click on the map to select the location of the incident
              </p>
              <div className="h-48 md:h-64 w-full border border-gray-300 rounded-md overflow-hidden">
                <div ref={modalMapRef} className="h-full w-full" />
              </div>
              {selectedLocation && (
                <p className="text-sm text-green-600 mt-2">
                  ✓ Location selected: {selectedLocation[0].toFixed(4)}, {selectedLocation[1].toFixed(4)}
                </p>
              )}
            </div>

            <div className="flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-4 mt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 order-2 sm:order-1"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !selectedLocation}
                className="px-4 py-2 md:px-6 md:py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed order-1 sm:order-2"
              >
                {loading ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
