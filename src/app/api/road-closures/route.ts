import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateRequest, handleCors, getCorsHeaders } from '@/lib/auth-middleware';
import { smartGeocodeLocation } from '@/lib/smart-geocoding';
import { generateEventEmbedding } from '@/lib/vector-search';

// Google Maps API proxy functions
async function googlePlacesAutocomplete(query: string) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    throw new Error('Google Maps API key not configured. Please set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in your .env.local file');
  }

  // Simple search strategy that matches Google Maps behavior
  const searchStrategies = [
    // Strategy 1: Basic search (same as Google Maps default)
    {
      input: query,
      language: 'id'
    },
    // Strategy 2: With country restriction if basic fails
    {
      input: query,
      language: 'id',
      components: 'country:id'
    },
    // Strategy 3: Enhanced with Indonesia context if still no results
    {
      input: `${query} indonesia`,
      language: 'id'
    }
  ];

  for (const strategy of searchStrategies) {
    try {
      console.log(`🔍 Trying search strategy: ${JSON.stringify(strategy)}`);

      const params = new URLSearchParams();
      Object.entries(strategy).forEach(([key, value]) => {
        params.set(key, value as string);
      });
      params.set('key', apiKey);

      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`
      );

      if (!response.ok) {
        console.warn(`API request failed with status: ${response.status}`);
        continue;
      }

      const data = await response.json();

      if (data.status === 'OK' && data.predictions && data.predictions.length > 0) {
        console.log(`✅ Found ${data.predictions.length} results with strategy: ${JSON.stringify(strategy)}`);
        console.log(`📍 First result: ${data.predictions[0]?.description}`);
        return data;
      }

      console.log(`⚠️ Strategy returned: ${data.status} - ${data.error_message || 'No results'} for query "${strategy.input}"`);

    } catch (error) {
      console.warn(`Strategy failed for "${strategy.input}":`, error);
      continue;
    }
  }

  // If all strategies fail, return empty results
  console.log('❌ All search strategies failed for query:', query);
  return {
    status: 'ZERO_RESULTS',
    predictions: []
  };
}

async function googlePlaceDetails(placeId: string) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    throw new Error('Google Maps API key not configured. Please set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in your .env.local file');
  }

  const response = await fetch(
    `https://maps.googleapis.com/maps/api/place/details/json?` +
    new URLSearchParams({
      place_id: placeId,
      key: apiKey,
      fields: 'formatted_address,geometry',
      language: 'id'
    })
  );

  if (!response.ok) {
    throw new Error(`Google Place Details API error: ${response.status}`);
  }

  return response.json();
}

export interface RoadClosureData {
  title: string;
  description?: string;
  location: string; // Address or location description
  lat?: number; // Exact latitude from form (bypasses geocoding)
  lng?: number; // Exact longitude from form (bypasses geocoding)
  source?: string; // Will default to 'Discord' or 'Private Sources'
}

export async function POST(request: NextRequest) {
  // Handle CORS preflight
  const corsResponse = handleCors(request);
  if (corsResponse) return corsResponse;

  try {
    // Authenticate request (optional for manual entry)
    const auth = authenticateRequest(request);
    if (!auth.isValid) {
      console.log('⚠️ Anonymous road closure submission');
    }

    const data: RoadClosureData = await request.json();

    // Validate required fields (keep it simple like TikTok events)
    if (!data.title || !data.location) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: title, location'
      }, {
        status: 400,
        headers: getCorsHeaders()
      });
    }

    console.log('🚧 Processing road closure submission:', data.title);

    // Check if exact coordinates are provided (bypass geocoding)
    let finalLat: number;
    let finalLng: number;

    if (data.lat !== undefined && data.lng !== undefined) {
      // Use exact coordinates from form (Google Maps-like precision)
      finalLat = data.lat;
      finalLng = data.lng;
      console.log(`🎯 Using exact coordinates from form: ${finalLat}, ${finalLng}`);
      console.log(`📍 Location: ${data.location}`);
    } else {
      // Fallback to geocoding if coordinates not provided
      console.log(`🌐 Geocoding location: ${data.location}`);
      const geocodeResult = await smartGeocodeLocation(data.location);

      if (!geocodeResult.success) {
        console.error(`❌ Failed to geocode location "${data.location}"`);
        return NextResponse.json({
          success: false,
          error: `Could not geocode location: ${data.location}`,
          geocodeError: geocodeResult.error
        }, {
          status: 400,
          headers: getCorsHeaders()
        });
      }

      finalLat = geocodeResult.lat!;
      finalLng = geocodeResult.lng!;
      console.log(`📍 Geocoded to: ${finalLat}, ${finalLng}`);
    }

    // Create the event record (same structure as TikTok events)
    const event = await prisma.event.create({
      data: {
        title: data.title,
        description: data.description || 'Road closure reported from private sources',
        lat: finalLat,
        lng: finalLng,
        source: data.source || 'Discord', // Like TikTok source
        verified: false, // Road closures start as unverified
        type: 'road_closure',
        extractedLocation: data.location,
        googleMapsUrl: `https://www.google.com/maps?q=${finalLat},${finalLng}`
      }
    });

    console.log(`✅ Created road closure event ID: ${event.id}`);

    // Generate embedding for search
    try {
      const embeddingSuccess = await generateEventEmbedding(event.id);
      if (embeddingSuccess) {
        console.log(`🔍 Generated embedding for road closure ${event.id}`);
      }
    } catch (embeddingError) {
      console.error(`⚠️ Failed to generate embedding for road closure ${event.id}:`, embeddingError);
      // Don't fail the whole request if embedding fails
    }

    return NextResponse.json({
      success: true,
      event: {
        id: event.id,
        title: event.title,
        description: event.description,
        lat: event.lat,
        lng: event.lng,
        source: event.source,
        verified: event.verified,
        type: event.type,
        extractedLocation: event.extractedLocation,
        createdAt: event.createdAt
      },
      message: 'Road closure reported successfully'
    }, { headers: getCorsHeaders() });

  } catch (error) {
    console.error('❌ Error processing road closure:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to process road closure submission'
    }, {
      status: 500,
      headers: getCorsHeaders()
    });
  }
}

// Get road closures
export async function GET(request: NextRequest) {
  // Handle CORS preflight
  const corsResponse = handleCors(request);
  if (corsResponse) return corsResponse;

  try {
    const { searchParams } = new URL(request.url);
    const hoursParam = searchParams.get('hours');
    const hours = hoursParam ? parseInt(hoursParam) : null; // null means no time filter
    const severity = searchParams.get('severity'); // 'high', 'critical', etc.
    const closureType = searchParams.get('closureType'); // 'full_closure', etc.

    const where: Record<string, unknown> = {
      type: 'road_closure'
    };

    // Only add time filter if hours parameter is provided
    if (hours !== null && hours > 0) {
      const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
      // Prefer originalCreatedAt when present; fall back to createdAt when originalCreatedAt is null
      (where as any).OR = [
        { originalCreatedAt: { gte: cutoff } },
        { AND: [ { originalCreatedAt: null }, { createdAt: { gte: cutoff } } ] }
      ];
    }

    // Note: We don't filter by severity/closureType since we keep it simple
    // All road closures are treated the same way

    const roadClosures = await prisma.event.findMany({
      where,
      orderBy: [
        { originalCreatedAt: 'desc' },
        { createdAt: 'desc' }
      ],
      select: {
        id: true,
        title: true,
        description: true,
        lat: true,
        lng: true,
        source: true,
        verified: true,
        extractedLocation: true,
        googleMapsUrl: true,
        createdAt: true,
        originalCreatedAt: true
      }
    });

    return NextResponse.json({
      success: true,
      roadClosures,
      count: roadClosures.length,
      timeWindow: hours !== null ? `${hours} hours` : 'all time'
    }, { headers: getCorsHeaders() });

  } catch (error) {
    console.error('❌ Error fetching road closures:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch road closures'
    }, {
      status: 500,
      headers: getCorsHeaders()
    });
  }
}

// Google Maps Autocomplete Proxy
export async function PUT(request: NextRequest) {
  // Handle CORS preflight
  const corsResponse = handleCors(request);
  if (corsResponse) return corsResponse;

  try {
    const { query } = await request.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json({
        success: false,
        error: 'Query parameter required'
      }, {
        status: 400,
        headers: getCorsHeaders()
      });
    }

    console.log('🔍 Google Places autocomplete:', query);
    const result = await googlePlacesAutocomplete(query);

    return NextResponse.json({
      success: true,
      ...result
    }, { headers: getCorsHeaders() });

  } catch (error) {
    console.error('Google Places autocomplete error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Autocomplete failed'
    }, {
      status: 500,
      headers: getCorsHeaders()
    });
  }
}

// Google Maps Place Details Proxy
export async function PATCH(request: NextRequest) {
  // Handle CORS preflight
  const corsResponse = handleCors(request);
  if (corsResponse) return corsResponse;

  try {
    const { placeId } = await request.json();

    if (!placeId || typeof placeId !== 'string') {
      return NextResponse.json({
        success: false,
        error: 'Place ID parameter required'
      }, {
        status: 400,
        headers: getCorsHeaders()
      });
    }

    console.log('📍 Google Place details:', placeId);
    const result = await googlePlaceDetails(placeId);

    return NextResponse.json({
      success: true,
      ...result
    }, { headers: getCorsHeaders() });

  } catch (error) {
    console.error('Google Place details error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Place details failed'
    }, {
      status: 500,
      headers: getCorsHeaders()
    });
  }
}
