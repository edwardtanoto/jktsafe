import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { extractLocationFromTweet } from '@/lib/openrouter';
import { smartGeocodeLocation } from '@/lib/smart-geocoding';

export async function POST(request: NextRequest) {
  try {
    console.log('🔄 Starting warning marker processing...');

    // Get pending warning markers that need processing
    const pendingMarkers = await prisma.warningMarker.findMany({
      where: {
        OR: [
          { extractedLocation: null },
          { lat: null },
          { lng: null }
        ]
      },
      orderBy: { createdAt: 'desc' },
      take: 20 // Process in batches to avoid timeouts
    });

    console.log(`📊 Found ${pendingMarkers.length} warning markers to process`);

    if (pendingMarkers.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No pending markers to process',
        processed: 0
      });
    }

    let processed = 0;
    let errors: string[] = [];

    for (const marker of pendingMarkers) {
      try {
        console.log(`🔍 Processing marker ${marker.id} (tweet: ${marker.tweetId})`);

        let needsUpdate = false;
        let updateData: any = {};

        // Step 1: Extract location if not already done
        if (!marker.extractedLocation) {
          console.log(`📝 Extracting location from tweet: "${marker.text.substring(0, 100)}..."`);
          
          const locationResult = await extractLocationFromTweet(
            marker.text,
            marker.userInfo as any
          );

          if (locationResult.success && locationResult.location) {
            updateData.extractedLocation = locationResult.location;
            updateData.confidenceScore = locationResult.confidence || 0.5;
            needsUpdate = true;
            console.log(`✅ Extracted location: "${locationResult.location}" (confidence: ${locationResult.confidence})`);
          } else {
            console.log(`❌ Failed to extract location: ${locationResult.error}`);
            // Continue to next marker
            continue;
          }
        }

        // Step 2: Geocode location if we have one but no coordinates
        const locationToGeocode = updateData.extractedLocation || marker.extractedLocation;
        
        if (locationToGeocode && (!marker.lat || !marker.lng)) {
          console.log(`🌍 Geocoding location: "${locationToGeocode}"`);
          
          try {
            const geocodeResult = await smartGeocodeLocation(locationToGeocode);
            
            if (geocodeResult.success && geocodeResult.latitude && geocodeResult.longitude) {
              updateData.lat = geocodeResult.latitude;
              updateData.lng = geocodeResult.longitude;
              needsUpdate = true;
              console.log(`📍 Geocoded to: ${geocodeResult.latitude}, ${geocodeResult.longitude}`);
              
              // Update confidence based on geocoding quality
              if (geocodeResult.confidenceScore) {
                const currentConfidence = updateData.confidenceScore || marker.confidenceScore || 0.5;
                updateData.confidenceScore = Math.min(currentConfidence, geocodeResult.confidenceScore);
              }
            } else {
              console.log(`❌ Geocoding failed: ${geocodeResult.error}`);
              errors.push(`Geocoding failed for marker ${marker.id}: ${geocodeResult.error}`);
            }
          } catch (geocodeError) {
            console.error(`❌ Geocoding error for marker ${marker.id}:`, geocodeError);
            errors.push(`Geocoding error for marker ${marker.id}: ${geocodeError instanceof Error ? geocodeError.message : 'Unknown error'}`);
          }
        }

        // Step 3: Update the marker if we have changes
        if (needsUpdate) {
          await prisma.warningMarker.update({
            where: { id: marker.id },
            data: {
              ...updateData,
              updatedAt: new Date()
            }
          });
          
          processed++;
          console.log(`✅ Updated marker ${marker.id} successfully`);
        }

        // Small delay to avoid overwhelming APIs
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        const errorMsg = `Failed to process marker ${marker.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error('❌', errorMsg);
        errors.push(errorMsg);
      }
    }

    console.log(`🎯 Processing complete: ${processed} markers updated`);

    return NextResponse.json({
      success: true,
      processed: processed,
      total: pendingMarkers.length,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('❌ Warning marker processing error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      },
      { status: 500 }
    );
  }
}

// GET endpoint to check processing status
export async function GET(request: NextRequest) {
  try {
    const pendingCount = await prisma.warningMarker.count({
      where: {
        OR: [
          { extractedLocation: null },
          { lat: null },
          { lng: null }
        ]
      }
    });

    const processedCount = await prisma.warningMarker.count({
      where: {
        AND: [
          { extractedLocation: { not: null } },
          { lat: { not: null } },
          { lng: { not: null } }
        ]
      }
    });

    const totalCount = await prisma.warningMarker.count();

    return NextResponse.json({
      success: true,
      stats: {
        total: totalCount,
        processed: processedCount,
        pending: pendingCount,
        processingRate: totalCount > 0 ? Math.round((processedCount / totalCount) * 100) : 0
      }
    });

  } catch (error) {
    console.error('❌ Warning marker status error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      },
      { status: 500 }
    );
  }
}
