import { env } from '../../env.config';

export interface GeocodeResult {
  success: boolean;
  lat?: number;
  lng?: number;
  place_name?: string;
  error?: string;
}

export async function geocodeLocation(location: string): Promise<GeocodeResult> {
  try {
    if (!env.mapbox.accessToken) {
      return {
        success: false,
        error: 'Mapbox access token not configured'
      };
    }

    const encodedLocation = encodeURIComponent(location);
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedLocation}.json?access_token=${env.mapbox.accessToken}&limit=1&country=id`;

    console.log(`🔍 Geocoding location: ${location}`);

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: `Geocoding API error: ${response.status}`
      };
    }

    if (data.features && data.features.length > 0) {
      const feature = data.features[0];
      const [lng, lat] = feature.center;

      return {
        success: true,
        lat,
        lng,
        place_name: feature.place_name
      };
    }

    return {
      success: false,
      error: 'No geocoding results found'
    };

  } catch (error) {
    console.error('Geocoding error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown geocoding error'
    };
  }
}