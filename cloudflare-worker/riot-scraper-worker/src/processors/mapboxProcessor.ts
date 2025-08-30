/**
 * Mapbox Geocoding Processor
 * Converts location names to coordinates
 */

import { Env } from '../index';

interface GeocodeResult {
	lat: number;
	lng: number;
	success: boolean;
	error?: string;
}

export async function geocodeLocation(locationName: string, env: Env): Promise<GeocodeResult> {
	try {
		if (!env.MAPBOX_ACCESS_TOKEN) {
			throw new Error('Mapbox access token is not configured');
		}

		// URL encode the location name
		const encodedLocation = encodeURIComponent(locationName + ', Indonesia');

		const response = await fetch(
			`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedLocation}.json?access_token=${env.MAPBOX_ACCESS_TOKEN}&country=id&types=place,locality,region&limit=1`,
			{
				headers: {
					'User-Agent': 'Mozilla/5.0 (compatible; RiotSignal/1.0)'
				}
			}
		);

		if (!response.ok) {
			throw new Error(`Mapbox API error: ${response.status} ${response.statusText}`);
		}

		const data = await response.json();
		const features = data.features;

		if (!features || features.length === 0) {
			return {
				lat: 0,
				lng: 0,
				success: false,
				error: 'No geocoding results found'
			};
		}

		const bestMatch = features[0];
		const [lng, lat] = bestMatch.center;

		return {
			lat,
			lng,
			success: true
		};

	} catch (error) {
		console.error('Error geocoding location:', error);
		return {
			lat: 0,
			lng: 0,
			success: false,
			error: error instanceof Error ? error.message : 'Unknown geocoding error'
		};
	}
}
