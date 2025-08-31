'use client';

import { useState } from 'react';

interface LocationSuggestion {
  place_name: string;
  center: [number, number];
  context?: any[];
  displayName?: string;
  coordinates: [number, number]; // Required for Google Maps
  properties?: any;
  geometry?: any;
  place_id?: string; // Google Places API
  structured_formatting?: {
    main_text: string;
    secondary_text: string;
  };
  isFallback?: boolean; // For our custom fallback suggestions
}

interface FallbackSuggestion extends LocationSuggestion {
  center: [number, number];
  coordinates: [number, number];
}

export default function RoadClosureForm() {
  const [location, setLocation] = useState<string>('');
  const [locationSuggestions, setLocationSuggestions] = useState<LocationSuggestion[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<LocationSuggestion | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<{type: 'success' | 'error' | null, message: string}>({type: null, message: ''});
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Search for location suggestions using backend proxy to Google Maps API
  const searchLocation = async (query: string) => {
    if (query.length < 2) {
      setLocationSuggestions([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    try {
      // Use backend proxy to avoid CORS issues
      const response = await fetch('/api/road-closures', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query })
      });

      const data = await response.json();

      if (data.success && data.status === 'OK') {
        // Get place details for each prediction to get coordinates
        const suggestionsWithDetails = await Promise.all(
          data.predictions.slice(0, 8).map(async (prediction: any) => {
            try {
              const detailsResponse = await fetch('/api/road-closures', {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ placeId: prediction.place_id })
              });

              const detailsData = await detailsResponse.json();

              if (detailsData.success && detailsData.status === 'OK') {
                const location = detailsData.result.geometry.location;
                return {
                  place_id: `google_${prediction.place_id}`, // Prefix to avoid conflicts
                  description: prediction.description,
                  structured_formatting: prediction.structured_formatting,
                  place_name: prediction.description,
                  displayName: getEnhancedDisplayName(prediction),
                  coordinates: [location.lng, location.lat],
                  center: [location.lng, location.lat],
                  geometry: detailsData.result.geometry
                };
              }
            } catch (error) {
              console.error('Error fetching place details:', error);
            }
            return null;
          })
        );

        const validSuggestions = suggestionsWithDetails.filter(Boolean);
        setLocationSuggestions(validSuggestions);

        if (validSuggestions.length === 0) {
          console.warn('No valid suggestions found after filtering');
        }

      } else if (data.status === 'ZERO_RESULTS') {
        // Handle ZERO_RESULTS with helpful fallback suggestions
        console.log('🔍 No Google Maps results found for:', query, '- providing fallback suggestions');

        // Provide fallback suggestions for common Indonesian abbreviations
        const fallbackSuggestions = getFallbackSuggestions(query);
        setLocationSuggestions(fallbackSuggestions);

        if (fallbackSuggestions.length > 0) {
          console.log(`✅ Provided ${fallbackSuggestions.length} fallback suggestions`);
        } else {
          console.log('❌ No fallback suggestions available');
        }

      } else {
        console.error('Backend proxy error:', data.error || data.status);
        setLocationSuggestions([]);
      }
    } catch (error) {
      console.error('Error searching location:', error);
      setLocationSuggestions([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Create Google Maps-like display names
  const getEnhancedDisplayName = (prediction: any) => {
    // Google Places API structure
    if (prediction.structured_formatting) {
      const { main_text, secondary_text } = prediction.structured_formatting;
      if (main_text && secondary_text) {
        return `${main_text}, ${secondary_text}`;
      }
    }

    // Fallback to description
    return prediction.description || prediction.place_name || '';
  };

  // Provide fallback suggestions for common Indonesian abbreviations
  const getFallbackSuggestions = (query: string): FallbackSuggestion[] => {
    const lowerQuery = query.toLowerCase();

    // Common Indonesian location abbreviations and expansions
    const fallbackMap: Record<string, Array<{name: string, fullName: string, coordinates: [number, number]}>> = {
      'dpr': [
        { name: 'DPR RI', fullName: 'Dewan Perwakilan Rakyat Republik Indonesia', coordinates: [106.8266, -6.2047] },
        { name: 'Gedung DPR', fullName: 'Gedung Dewan Perwakilan Rakyat, Jakarta Pusat', coordinates: [106.8266, -6.2047] }
      ],
      'dpr ri': [
        { name: 'DPR RI', fullName: 'Dewan Perwakilan Rakyat Republik Indonesia', coordinates: [106.8266, -6.2047] }
      ],
      'monas': [
        { name: 'Monas', fullName: 'Monumen Nasional, Jakarta Pusat', coordinates: [106.8270, -6.1754] }
      ],
      'bundaran hi': [
        { name: 'Bundaran HI', fullName: 'Bundaran Hotel Indonesia, Jakarta Pusat', coordinates: [106.8227, -6.1937] }
      ],
      'istana': [
        { name: 'Istana Negara', fullName: 'Istana Negara, Jakarta Pusat', coordinates: [106.8185, -6.1702] }
      ],
      'borobudur': [
        { name: 'Borobudur', fullName: 'Candi Borobudur, Magelang, Jawa Tengah', coordinates: [110.2038, -7.6079] }
      ]
    };

    // Check for exact matches first
    if (fallbackMap[lowerQuery]) {
      return fallbackMap[lowerQuery].map((item, index) => ({
        place_id: `fallback_${item.name.replace(/\s+/g, '_')}_${index}`,
        description: item.fullName,
        place_name: item.fullName,
        displayName: item.fullName,
        coordinates: item.coordinates,
        center: item.coordinates,
        isFallback: true,
        context: [],
        properties: {},
        structured_formatting: {
          main_text: item.name,
          secondary_text: item.fullName.split(', ').slice(1).join(', ')
        }
      } as FallbackSuggestion));
    }

    // Check for partial matches
    const partialMatches = Object.entries(fallbackMap)
      .filter(([key]) => key.includes(lowerQuery) || lowerQuery.includes(key))
      .flatMap(([, items]) => items);

    if (partialMatches.length > 0) {
      return partialMatches.slice(0, 3).map((item, index) => ({
        place_id: `fallback_${item.name.replace(/\s+/g, '_')}_${index}`,
        description: item.fullName,
        place_name: item.fullName,
        displayName: item.fullName,
        coordinates: item.coordinates,
        center: item.coordinates,
        isFallback: true,
        context: [],
        properties: {},
        structured_formatting: {
          main_text: item.name,
          secondary_text: item.fullName.split(', ').slice(1).join(', ')
        }
      } as FallbackSuggestion));
    }

    // General fallback for Jakarta areas
    if (lowerQuery.includes('jakarta') || lowerQuery.length >= 3) {
      return [
        {
          place_id: `fallback_jakarta_pusat_${Date.now()}`, // Make it unique with timestamp
          description: 'Jakarta Pusat, DKI Jakarta',
          place_name: 'Jakarta Pusat, DKI Jakarta',
          displayName: 'Jakarta Pusat, DKI Jakarta',
          coordinates: [106.8272, -6.1754],
          center: [106.8272, -6.1754],
          isFallback: true,
          context: [],
          properties: {},
          structured_formatting: {
            main_text: 'Jakarta Pusat',
            secondary_text: 'DKI Jakarta'
          }
        } as FallbackSuggestion
      ];
    }

    return [];
  };

  const handleLocationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLocation(value);
    setSelectedLocation(null);

    // Clear previous timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    // Set new timeout for debounced search
    const timeout = setTimeout(() => {
      searchLocation(value);
    }, 300); // 300ms delay

    setSearchTimeout(timeout);
  };

  const selectLocation = (suggestion: LocationSuggestion) => {
    setSelectedLocation(suggestion);
    setLocation(suggestion.displayName || suggestion.place_name);
    setLocationSuggestions([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus({type: null, message: ''});

    if (!selectedLocation) {
      setSubmitStatus({type: 'error', message: 'Please select a valid location from the suggestions'});
      setIsSubmitting(false);
      return;
    }

    try {
      // Get exact coordinates from selected location (Google Places API)
      if (!selectedLocation.coordinates) {
        throw new Error('Coordinates not available for selected location');
      }

      const coordinates = selectedLocation.coordinates;
      const [lng, lat] = coordinates;

      const submitData = {
        title: selectedLocation.displayName || selectedLocation.place_name,
        description: 'Road closure reported from private sources',
        location: selectedLocation.displayName || selectedLocation.place_name,
        lat: lat,
        lng: lng,
        source: 'Discord' // Like TikTok events
      };

      const response = await fetch('/api/road-closures', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(submitData)
      });

      const result = await response.json();

      if (result.success) {
        setSubmitStatus({type: 'success', message: 'Road closure reported successfully!'});
        // Reset form
        setLocation('');
        setSelectedLocation(null);
      } else {
        setSubmitStatus({type: 'error', message: result.error || 'Failed to submit road closure'});
      }
    } catch (error) {
      setSubmitStatus({type: 'error', message: 'Network error. Please try again.'});
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">

      {submitStatus.type && (
        <div className={`text-center p-2 rounded ${submitStatus.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
          <p className="text-sm">{submitStatus.message}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Location with Autocomplete */}
        <div className="relative">
          <input
            type="text"
            id="location"
            required
            value={location}
            onChange={handleLocationChange}
            placeholder="Enter road closure location..."
            className="w-full bg-transparent border-b-2 border-gray-600 text-white placeholder-gray-400 focus:border-white focus:outline-none py-2 text-lg transition-colors"
          />

          {/* Loading indicator */}
          {isSearching && !selectedLocation && (
            <div className="mt-2 flex items-center text-sm text-gray-400">
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Searching for locations...
            </div>
          )}

          {/* Location Suggestions */}
          {locationSuggestions.length > 0 && !selectedLocation && (
            <div className="absolute z-10 w-full bg-gray-900 border border-gray-600 rounded-md shadow-xl mt-2 max-h-80 overflow-y-auto">
              {locationSuggestions.map((suggestion, index) => (
                <button
                  key={suggestion.place_id || index}
                  type="button"
                  onClick={() => selectLocation(suggestion)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-800 focus:outline-none focus:bg-gray-800 border-b border-gray-700 last:border-b-0 transition-colors"
                >
                  <div className="font-medium text-white text-sm">
                    {suggestion.isFallback ? '🔄' : '📍'} {suggestion.displayName || suggestion.place_name}
                    {suggestion.isFallback && (
                      <span className="text-xs text-orange-400 ml-1">(Estimated)</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {suggestion.isFallback ? 'Estimated' : 'Exact'} coordinates: {suggestion.coordinates ? `${suggestion.coordinates[1].toFixed(6)}, ${suggestion.coordinates[0].toFixed(6)}` : 'Loading...'}
                  </div>
                  {suggestion.structured_formatting && (
                    <div className={`text-xs mt-1 ${suggestion.isFallback ? 'text-orange-400' : 'text-blue-400'}`}>
                      {suggestion.structured_formatting.secondary_text}
                      {suggestion.isFallback && ' (Fallback suggestion)'}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          {selectedLocation && (
            <div className="mt-4 p-3 bg-gray-800 border border-green-500 rounded-md">
              <div className="flex items-start">
                <svg className="w-5 h-5 text-green-400 mr-3 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <div className="flex-1">
                  <div className="text-sm text-green-400 font-medium">
                    Selected: {selectedLocation.displayName || selectedLocation.place_name}
                    {selectedLocation.isFallback && (
                      <span className="text-xs text-orange-400 ml-2">(Estimated)</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {selectedLocation.isFallback ? 'Estimated' : 'Exact'} coordinates: {selectedLocation.coordinates ? `${selectedLocation.coordinates[1].toFixed(6)}, ${selectedLocation.coordinates[0].toFixed(6)}` : 'N/A'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Info about private sources */}
        <div className="text-center text-xs text-gray-500">
          <p>Private source information • No public details shared</p>
        </div>

        {/* Submit Button */}
        {selectedLocation && (
          <div className="flex justify-center pt-4">
            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-6 py-2 border border-white text-white hover:bg-white hover:text-black transition-colors ${
                isSubmitting ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {isSubmitting ? 'Saving...' : 'Report'}
            </button>
          </div>
        )}
      </form>
      </div>
    </div>
  );
}