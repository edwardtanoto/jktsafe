export interface SerpGeocodeResult {
  success: boolean;
  lat?: number;
  lng?: number;
  formatted_address?: string;
  place_id?: string;
  error?: string;
}

export async function geocodeWithSerp(location: string): Promise<SerpGeocodeResult> {
  try {
    const SERP_APIKey = process.env.SERP_API_KEY;
    if (!SERP_APIKey) {
      return {
        success: false,
        error: 'SERP_API_KEY is not set in environment variables'
      };
    }

    // Use SERP API to search for the location on Google Maps
    const searchQuery = `${location} Indonesia`;
    const url = `https://SERPAPI.com/search.json?engine=google_maps&q=${encodeURIComponent(searchQuery)}&api_key=${SERP_APIKey}`;

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: `SERP API error: ${response.status}`
      };
    }

    // Extract the first (most relevant) result
    const firstResult = data.local_results?.[0] || data.organic_results?.[0];

    if (!firstResult) {
      return {
        success: false,
        error: 'No location results found'
      };
    }

    // Extract coordinates from GPS coordinates if available
    let lat: number | undefined;
    let lng: number | undefined;

    if (firstResult.gps_coordinates) {
      lat = firstResult.gps_coordinates.latitude;
      lng = firstResult.gps_coordinates.longitude;
    }

    return {
      success: true,
      lat,
      lng,
      formatted_address: firstResult.title || firstResult.displayed_name,
      place_id: firstResult.place_id
    };

  } catch (error) {
    console.error('SERP geocoding error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown geocoding error'
    };
  }
}
