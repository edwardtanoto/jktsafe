import OpenAI from 'openai';
import { env } from '../../env.config';

export interface LocationResult {
  success: boolean;
  location?: string;
  confidence?: number;
  error?: string;
}

export interface DetailedLocationResult {
  success: boolean;
  exact_location?: string;
  all_locations?: string[];
  confidence?: number;
  error?: string;
}

export async function extractLocationFromArticle(title: string, content: string): Promise<LocationResult> {
  try {
    if (!env.openRouter.apiKey) {
      return {
        success: false,
        error: 'OpenRouter API key not configured'
      };
    }

    const client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: env.openRouter.apiKey,
      defaultHeaders: {
        "HTTP-Referer": "https://safe-jakarta.vercel.app", // Optional. Site URL for rankings on openrouter.ai.
        "X-Title": "Safe Jakarta", // Optional. Site title for rankings on openrouter.ai.
      },
    });

    const prompt = `Extract the specific location mentioned in this Indonesian protest news/video. Focus on finding the exact place where the protest is happening.

Title: ${title}
Content: ${content}

Return ONLY the location name in Indonesian, without any additional text. If no specific location is mentioned, return "unknown".

Examples:
- "Kerusuhan di depan Polda Bali" → "Polda Bali"
- "Demo mahasiswa di Gedung DPR RI Jakarta" → "Gedung DPR RI Jakarta"
- "Aksi massa tolak kenaikan BBM di Monas" → "Monas"
- "Bentrok antara mahasiswa dan polisi di Yogyakarta" → "Yogyakarta"`;

    const completion = await client.chat.completions.create({
      model: "gpt-oss-20b:free",
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 100,
      temperature: 0.1
    });

    const extractedLocation = completion.choices[0]?.message?.content?.trim();

    if (!extractedLocation || extractedLocation === 'unknown') {
      return {
        success: false,
        error: 'No location found in text'
      };
    }

    // Remove quotes if present
    const cleanLocation = extractedLocation.replace(/^["']|["']$/g, '');

    return {
      success: true,
      location: cleanLocation,
      confidence: 0.8 // Default confidence for extraction
    };

  } catch (error) {
    console.error('Location extraction error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown extraction error'
    };
  }
}

// Location validation function to prevent obviously wrong mappings
function validateIndonesianLocation(extractedLocation: string): {isValid: boolean, correctedLocation?: string, reason?: string} {
  const location = extractedLocation.toLowerCase();

  // Jakarta bias detection - if location mentions Jakarta but extracted location is wrong
  if (location.includes('ntb') || location.includes('nusa tenggara barat') ||
      location.includes('mataram') || location.includes('lombok') || location.includes('sumbawa')) {
    // If the extracted location contains Jakarta-related terms but should be NTB
    if (location.includes('kebayoran') || location.includes('jakarta') ||
        location.includes('monas') || location.includes('bundaran hi')) {
      return {
        isValid: false,
        correctedLocation: 'DPRD NTB, Mataram, Nusa Tenggara Barat',
        reason: 'NTB location incorrectly mapped to Jakarta - correcting to Mataram, NTB'
      };
    }
  }

  // Bali validation
  if (location.includes('bali') || location.includes('denpasar')) {
    if (location.includes('jakarta') && !location.includes('denpasar')) {
      return {
        isValid: false,
        correctedLocation: 'DPRD Bali, Denpasar, Bali',
        reason: 'Bali location incorrectly mapped to Jakarta - correcting to Denpasar, Bali'
      };
    }
  }

  // Jawa Barat validation
  if (location.includes('jabar') || location.includes('jawa barat') ||
      location.includes('bandung') || location.includes('bogor')) {
    if (location.includes('jakarta') && !location.includes('bandung')) {
      return {
        isValid: false,
        correctedLocation: 'DPRD Jawa Barat, Bandung, Jawa Barat',
        reason: 'West Java location incorrectly mapped to Jakarta - correcting to Bandung, Jawa Barat'
      };
    }
  }

  // Geographic validation - prevent cross-island errors
  const jakartaTerms = ['jakarta', 'kebayoran', 'monas', 'bundaran hi', 'sudirman', 'thamrin'];
  const ntbTerms = ['ntb', 'nusa tenggara barat', 'mataram', 'lombok', 'sumbawa'];
  const baliTerms = ['bali', 'denpasar', 'buleleng', 'tabanan'];
  const sumateraTerms = ['sumatera', 'medan', 'padang', 'pekanbaru', 'palembang', 'batam', 'tanjung pinang'];
  const kalimantanTerms = ['kalimantan', 'pontianak', 'palangka raya', 'banjarmasin', 'samarinda', 'tanjung selor'];
  const sulawesiTerms = ['sulawesi', 'manado', 'palu', 'makassar', 'kendari', 'gorontalo', 'mamuju'];
  const malukuTerms = ['maluku', 'ambon', 'sofifi'];
  const papuaTerms = ['papua', 'jayapura', 'manokwari', 'nabire', 'jayawijaya', 'merauke', 'sorong'];

  const hasJakartaTerms = jakartaTerms.some(term => location.includes(term));
  const hasNtbTerms = ntbTerms.some(term => location.includes(term));
  const hasBaliTerms = baliTerms.some(term => location.includes(term));
  const hasSumateraTerms = sumateraTerms.some(term => location.includes(term));
  const hasKalimantanTerms = kalimantanTerms.some(term => location.includes(term));
  const hasSulawesiTerms = sulawesiTerms.some(term => location.includes(term));
  const hasMalukuTerms = malukuTerms.some(term => location.includes(term));
  const hasPapuaTerms = papuaTerms.some(term => location.includes(term));

  // If location has both Jakarta and other province terms, it's likely confused
  if (hasJakartaTerms && (hasNtbTerms || hasBaliTerms || hasSumateraTerms || hasKalimantanTerms ||
      hasSulawesiTerms || hasMalukuTerms || hasPapuaTerms)) {
    if (hasNtbTerms) {
      return {
        isValid: false,
        correctedLocation: 'DPRD NTB, Mataram, Nusa Tenggara Barat',
        reason: 'Conflicting Jakarta and NTB terms - prioritizing NTB location'
      };
    }
    if (hasBaliTerms) {
      return {
        isValid: false,
        correctedLocation: 'DPRD Bali, Denpasar, Bali',
        reason: 'Conflicting Jakarta and Bali terms - prioritizing Bali location'
      };
    }
    if (hasSumateraTerms) {
      // Determine specific Sumatera province based on city mentioned
      if (location.includes('medan')) {
        return {
          isValid: false,
          correctedLocation: 'DPRD Sumatera Utara, Medan',
          reason: 'Conflicting Jakarta and Sumatera Utara terms - prioritizing Sumatera Utara location'
        };
      } else if (location.includes('padang')) {
        return {
          isValid: false,
          correctedLocation: 'DPRD Sumatera Barat, Padang',
          reason: 'Conflicting Jakarta and Sumatera Barat terms - prioritizing Sumatera Barat location'
        };
      } else if (location.includes('palembang')) {
        return {
          isValid: false,
          correctedLocation: 'DPRD Sumatera Selatan, Palembang',
          reason: 'Conflicting Jakarta and Sumatera Selatan terms - prioritizing Sumatera Selatan location'
        };
      }
    }
    if (hasKalimantanTerms) {
      if (location.includes('samarinda')) {
        return {
          isValid: false,
          correctedLocation: 'DPRD Kalimantan Timur, Samarinda',
          reason: 'Conflicting Jakarta and Kalimantan Timur terms - prioritizing Kalimantan Timur location'
        };
      } else if (location.includes('banjarmasin')) {
        return {
          isValid: false,
          correctedLocation: 'DPRD Kalimantan Selatan, Banjarmasin',
          reason: 'Conflicting Jakarta and Kalimantan Selatan terms - prioritizing Kalimantan Selatan location'
        };
      }
    }
    if (hasSulawesiTerms) {
      if (location.includes('makassar')) {
        return {
          isValid: false,
          correctedLocation: 'DPRD Sulawesi Selatan, Makassar',
          reason: 'Conflicting Jakarta and Sulawesi Selatan terms - prioritizing Sulawesi Selatan location'
        };
      } else if (location.includes('manado')) {
        return {
          isValid: false,
          correctedLocation: 'DPRD Sulawesi Utara, Manado',
          reason: 'Conflicting Jakarta and Sulawesi Utara terms - prioritizing Sulawesi Utara location'
        };
      }
    }
    if (hasPapuaTerms) {
      if (location.includes('jayapura')) {
        return {
          isValid: false,
          correctedLocation: 'DPRD Papua, Jayapura',
          reason: 'Conflicting Jakarta and Papua terms - prioritizing Papua location'
        };
      }
    }
  }

  return { isValid: true };
}

// Apply location validation to results
function applyLocationValidation(result: DetailedLocationResult): DetailedLocationResult {
  if (!result.success || !result.exact_location) {
    return result;
  }

  const validation = validateIndonesianLocation(result.exact_location);

  if (!validation.isValid && validation.correctedLocation) {
    console.log(`⚠️ Location validation failed: ${validation.reason}`);
    console.log(`🔄 Correcting "${result.exact_location}" → "${validation.correctedLocation}"`);

    return {
      ...result,
      exact_location: validation.correctedLocation,
      all_locations: [validation.correctedLocation],
      confidence: Math.min(result.confidence || 0.5, 0.7) // Reduce confidence for corrected locations
    };
  }

  return result;
}

async function extractDetailedLocationFromTikTokInternal(videoData: any): Promise<DetailedLocationResult> {
  try {
    if (!env.openRouter.apiKey) {
      console.error('❌ OpenRouter API key not configured');
      return {
        success: false,
        error: 'OpenRouter API key not configured'
      };
    }

    console.log(`🔧 OpenRouter Config Check:`);
    console.log(`- API Key: ${env.openRouter.apiKey ? '✅ Set' : '❌ Missing'}`);

    const client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: env.openRouter.apiKey,
      defaultHeaders: {
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "Safe Jakarta",
      },
    });

    const { title, author, music_info, region, cover } = videoData;

    // First, try to extract location from text content
    console.log(`📝 Extracting location from text: "${title}"`);

    const textPrompt = `You are a location extraction expert specializing in Indonesian protest locations. Analyze this TikTok video about protests/demonstrations.

VIDEO DATA:
Title: "${title}"
Author: "${author?.nickname || 'Unknown'}"
Music: "${music_info?.title || 'Unknown'}"
Region: "${region || 'Unknown'}"

CRITICAL RULES - READ CAREFULLY:
1. NEVER assume Jakarta unless EXPLICITLY mentioned in the text
2. Be extremely specific about Indonesian geography and provinces
3. DPRD = Dewan Perwakilan Rakyat Daerah (Regional Parliament)
4. Each province has its own DPRD (DPRD Jawa Barat, DPRD NTB, DPRD Bali, etc.)
5. NTB = Nusa Tenggara Barat (West Nusa Tenggara) - COMPLETELY different from Jakarta
6. NTT = Nusa Tenggara Timur (East Nusa Tenggara) - different island
7. Bali, Lombok, Sumbawa are in NTB province
8. Mataram is the capital of NTB province

LOCATION PRIORITY (most specific first):
1. Government buildings with province: "DPRD NTB Mataram", "Polda Bali Denpasar"
2. City + Province: "Mataram, NTB", "Denpasar, Bali"
3. Province only: "Nusa Tenggara Barat", "Jawa Barat"
4. General city names: "Jakarta", "Bandung", "Surabaya"

INDONESIAN PROVINCES AND THEIR CAPITALS:
- DKI Jakarta: Jakarta Pusat
- Jawa Barat: Bandung
- Jawa Tengah: Semarang
- Jawa Timur: Surabaya
- Banten: Serang
- Bali: Denpasar
- Nusa Tenggara Barat (NTB): Mataram
- Nusa Tenggara Timur (NTT): Kupang
- Sumatera Utara: Medan
- Sumatera Barat: Padang
- Riau: Pekanbaru
- Kepulauan Riau: Tanjung Pinang
- Jambi: Jambi
- Sumatera Selatan: Palembang
- Bengkulu: Bengkulu
- Lampung: Bandar Lampung
- Bangka Belitung: Pangkal Pinang
- Kalimantan Barat: Pontianak
- Kalimantan Tengah: Palangka Raya
- Kalimantan Selatan: Banjarmasin
- Kalimantan Timur: Samarinda
- Kalimantan Utara: Tanjung Selor
- Sulawesi Utara: Manado
- Sulawesi Tengah: Palu
- Sulawesi Selatan: Makassar
- Sulawesi Tenggara: Kendari
- Gorontalo: Gorontalo
- Sulawesi Barat: Mamuju
- Maluku: Ambon
- Maluku Utara: Sofifi
- Papua Barat: Manokwari
- Papua: Jayapura
- Papua Tengah: Nabire
- Papua Pegunungan: Jayawijaya
- Papua Selatan: Merauke
- Papua Barat Daya: Sorong
- Aceh: Banda Aceh

VALIDATION CHECKS:
- If you see "DPRD NTB" → This is in Mataram, NTB (NOT Jakarta)
- If you see "DPRD Bali" → This is in Denpasar, Bali (NOT Jakarta)
- If you see "DPRD Jabar" → This is in Bandung, Jawa Barat (NOT Jakarta)
- If you see "DPRD Jateng" → This is in Semarang, Jawa Tengah (NOT Jakarta)
- If you see "DPRD Jatim" → This is in Surabaya, Jawa Timur (NOT Jakarta)
- If you see "DPRD Sumut" → This is in Medan, Sumatera Utara (NOT Jakarta)
- If you see "DPRD Sumbar" → This is in Padang, Sumatera Barat (NOT Jakarta)
- If you see "DPRD Sumsel" → This is in Palembang, Sumatera Selatan (NOT Jakarta)
- If you see "DPRD Sulsel" → This is in Makassar, Sulawesi Selatan (NOT Jakarta)
- If you see "DPRD Kaltim" → This is in Samarinda, Kalimantan Timur (NOT Jakarta)
- If text mentions "Mataram" → This is NTB, not Jakarta
- If text mentions "Lombok" or "Sumbawa" → This is NTB, not Jakarta
- If text mentions "Denpasar" → This is Bali, not Jakarta
- If text mentions "Bandung" → This is Jawa Barat, not Jakarta
- If text mentions "Surabaya" → This is Jawa Timur, not Jakarta
- If text mentions "Medan" → This is Sumatera Utara, not Jakarta
- If text mentions "Makassar" → This is Sulawesi Selatan, not Jakarta
- If text mentions "Samarinda" → This is Kalimantan Timur, not Jakarta
- If text mentions "Manado" → This is Sulawesi Utara, not Jakarta
- If text mentions "Jayapura" → This is Papua, not Jakarta
- If text mentions "Ambon" → This is Maluku, not Jakarta

RESPONSE FORMAT (JSON only):
{
  "exact_location": "DPRD NTB Mataram, Nusa Tenggara Barat" | null,
  "all_locations": ["DPRD NTB", "Mataram", "Nusa Tenggara Barat"],
  "confidence": 0.95
}

EXAMPLES:
✅ "Demo di DPRD NTB Mataram" → {"exact_location": "DPRD NTB, Mataram", "all_locations": ["DPRD NTB", "Mataram", "Nusa Tenggara Barat"], "confidence": 0.95}
✅ "Kerusuhan DPRD Bali Denpasar" → {"exact_location": "DPRD Bali, Denpasar", "all_locations": ["DPRD Bali", "Denpasar", "Bali"], "confidence": 0.95}
✅ "Aksi DPRD Jabar Bandung" → {"exact_location": "DPRD Jabar, Bandung", "all_locations": ["DPRD Jabar", "Bandung", "Jawa Barat"], "confidence": 0.95}
✅ "Demo DPRD Sumut Medan" → {"exact_location": "DPRD Sumatera Utara, Medan", "all_locations": ["DPRD Sumut", "Medan", "Sumatera Utara"], "confidence": 0.95}
✅ "Kerusuhan DPRD Sulsel Makassar" → {"exact_location": "DPRD Sulawesi Selatan, Makassar", "all_locations": ["DPRD Sulsel", "Makassar", "Sulawesi Selatan"], "confidence": 0.95}
✅ "Aksi massa DPRD Kaltim Samarinda" → {"exact_location": "DPRD Kalimantan Timur, Samarinda", "all_locations": ["DPRD Kaltim", "Samarinda", "Kalimantan Timur"], "confidence": 0.95}
✅ "Demo mahasiswa di Universitas Papua Jayapura" → {"exact_location": "Universitas Papua, Jayapura", "all_locations": ["Universitas Papua", "Jayapura", "Papua"], "confidence": 0.9}
❌ "Demo mahasiswa hari ini" → {"exact_location": null, "all_locations": [], "confidence": 0.0}

Return ONLY valid JSON:`;

    const textCompletion = await client.chat.completions.create({
      model: "gpt-oss-20b:free",
      messages: [
        {
          role: "user",
          content: textPrompt
        }
      ],
      max_tokens: 300,
      temperature: 0.1
    });

    let textResult = null;
    const textContent = textCompletion.choices[0]?.message?.content?.trim();

    if (textContent) {
      try {
        textResult = JSON.parse(textContent);
        console.log(`📝 Text analysis result:`, textResult);
      } catch (e) {
        console.log(`⚠️ Failed to parse text analysis result:`, textContent);
      }
    }

    // Now try to extract location from the cover image using vision model
    let imageResult = null;

    if (cover) {
      console.log(`🖼️ Analyzing cover image: ${cover}`);

      const imagePrompt = `You are a location identification expert specializing in Indonesian protest locations. Analyze this TikTok video cover image and identify the exact location shown.

This is a TikTok video about protests/demonstrations in Indonesia. Look for:

LOCATION IDENTIFIERS:
- Government buildings: DPR RI, MPR, Istana Negara, Polda, Kodam, KPK, MK, BPK
- Regional parliaments: DPRD (DPRD NTB, DPRD Bali, DPRD Jabar, etc.)
- Famous landmarks: Monas, Bundaran HI, Patung Kuda, Istiqlal Mosque, Cathedral
- Street signs: Jl. Sudirman, Jl. Thamrin, Jl. Gatot Subroto, etc.
- District names: Jakarta Pusat, Mataram NTB, Denpasar Bali, Bandung Jabar, etc.
- Police stations: Mapolda, Polres, Polsek
- Universities: UI, UGM, ITB, UNPAD, etc.
- Text overlays or signs visible in the image

INDONESIAN GEOGRAPHY - CRITICAL RULES:
1. NTB = Nusa Tenggara Barat (West Nusa Tenggara) - islands like Lombok, Sumbawa, Mataram
2. NTT = Nusa Tenggara Timur (East Nusa Tenggara) - islands like Flores, Timor
3. Bali is a separate province from NTB/NTT
4. Jabar = Jawa Barat (West Java) - includes Bandung, Bogor, etc.
5. NEVER assume Jakarta unless you see "Jakarta" explicitly
6. Each province has its own DPRD building in its capital city

INDONESIAN PROVINCIAL CAPITALS:
- DKI Jakarta: Jakarta (but specify Jakarta Pusat/Utara/Selatan/Timur/Barat)
- Jawa Barat: Bandung
- Jawa Tengah: Semarang
- Jawa Timur: Surabaya
- Banten: Serang
- Bali: Denpasar
- Nusa Tenggara Barat (NTB): Mataram
- Nusa Tenggara Timur (NTT): Kupang
- Sumatera Utara: Medan
- Sumatera Barat: Padang
- Riau: Pekanbaru
- Kepulauan Riau: Tanjung Pinang
- Jambi: Jambi
- Sumatera Selatan: Palembang
- Bengkulu: Bengkulu
- Lampung: Bandar Lampung
- Bangka Belitung: Pangkal Pinang
- Kalimantan Barat: Pontianak
- Kalimantan Tengah: Palangka Raya
- Kalimantan Selatan: Banjarmasin
- Kalimantan Timur: Samarinda
- Kalimantan Utara: Tanjung Selor
- Sulawesi Utara: Manado
- Sulawesi Tengah: Palu
- Sulawesi Selatan: Makassar
- Sulawesi Tenggara: Kendari
- Gorontalo: Gorontalo
- Sulawesi Barat: Mamuju
- Maluku: Ambon
- Maluku Utara: Sofifi
- Papua Barat: Manokwari
- Papua: Jayapura
- Papua Tengah: Nabire
- Papua Pegunungan: Jayawijaya
- Papua Selatan: Merauke
- Papua Barat Daya: Sorong
- Aceh: Banda Aceh

INDONESIAN-SPECIFIC HINTS:
- Look for "Polda" (Provincial Police HQ) or "Polres" (District Police)
- "DPRD NTB" = Regional Parliament in Mataram, NTB (NOT Jakarta)
- "DPRD Bali" = Regional Parliament in Denpasar, Bali (NOT Jakarta)
- "Bundaran" means roundabout/traffic circle
- "Jl." means "Jalan" (street)
- Numbers after street names indicate building/house numbers

VALIDATION CHECKLIST:
- If you see "Mataram" in text/signs → This is NTB, not Jakarta
- If you see "Lombok" or "Sumbawa" → This is NTB, not Jakarta
- If you see "Denpasar" → This is Bali, not Jakarta
- If you see "Bandung" → This is Jawa Barat, not Jakarta
- If you see "DPRD" + province name → Location is in that province's capital

IMPORTANT:
- Be VERY specific about the location and province
- Include province information when available
- If you see a building name or sign, include province context
- If you see street names, include them with any numbers
- Focus ONLY on Indonesian locations
- If multiple possible locations, choose the most prominent one
- NEVER default to Jakarta unless explicitly shown

What exact location is shown in this image? Include the city and province if identifiable.`;

      try {
        const imageCompletion = await client.chat.completions.create({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: imagePrompt
                },
                {
                  type: "image_url",
                  image_url: {
                    url: cover
                  }
                }
              ]
            }
          ],
          max_tokens: 200,
          temperature: 0.1
        });

        const imageContent = imageCompletion.choices[0]?.message?.content?.trim();

        if (imageContent && !imageContent.includes("Unable to identify")) {
          console.log(`🖼️ Image analysis result: "${imageContent}"`);

          // Try to extract structured location from image analysis
          const structuredPrompt = `Convert this location description into structured JSON format:

Location description: "${imageContent}"

Return ONLY valid JSON format like this:
{"exact_location": "the most specific location mentioned", "confidence": 0.9}

If no clear location, return: {"exact_location": null, "confidence": 0.0}

IMPORTANT: Return ONLY the JSON object, no markdown, no explanation, no backticks.`;

          const structuredCompletion = await client.chat.completions.create({
            model: "gpt-oss-20b:free",
            messages: [
              {
                role: "user",
                content: structuredPrompt
              }
            ],
            max_tokens: 150,
            temperature: 0.1
          });

          const structuredContent = structuredCompletion.choices[0]?.message?.content?.trim();

          if (structuredContent) {
            let cleanJson = '';
            try {
              // Clean the response by removing markdown formatting and extra text
              cleanJson = structuredContent
                .replace(/```json\s*/g, '') // Remove ```json
                .replace(/```\s*/g, '') // Remove ```
                .replace(/^\s*[\w\s]*:\s*/g, '') // Remove any prefix text
                .trim();

              // Extract JSON if it's embedded in text
              const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                cleanJson = jsonMatch[0];
              }

              imageResult = JSON.parse(cleanJson);
              console.log(`📋 Structured image result:`, imageResult);
            } catch (e) {
              console.log(`⚠️ Failed to parse structured image result:`, structuredContent);
              console.log(`🧹 Cleaned content was:`, cleanJson);

              // Fallback: try to extract location manually from the original content
              if (imageContent && imageContent.length > 10) {
                console.log(`🔄 Attempting fallback extraction from original image content`);
                imageResult = {
                  exact_location: imageContent.split('.')[0].trim(), // Take first sentence
                  confidence: 0.6 // Lower confidence for fallback
                };
                console.log(`📍 Fallback image result:`, imageResult);
              }
            }
          }
        } else {
          console.log(`🖼️ No identifiable location in cover image`);
        }
      } catch (error) {
        console.log(`⚠️ Image analysis failed:`, error);
      }
    }

    // Combine results from text and image analysis with improved logic
    console.log(`🔄 Combining text and image analysis results...`);

    // Priority 1: High-confidence image results
    if (imageResult && imageResult.exact_location && imageResult.confidence > 0.8) {
      console.log(`🎯 Using high-confidence image-based location: "${imageResult.exact_location}"`);
      return {
        success: true,
        exact_location: imageResult.exact_location,
        all_locations: [imageResult.exact_location],
        confidence: imageResult.confidence
      };
    }

    // Priority 2: High-confidence text results
    if (textResult && textResult.exact_location && textResult.confidence > 0.8) {
      console.log(`📝 Using high-confidence text-based location: "${textResult.exact_location}"`);
      return {
        success: true,
        exact_location: textResult.exact_location,
        all_locations: textResult.all_locations || [],
        confidence: textResult.confidence
      };
    }

    // Priority 3: Medium-confidence results (either image or text)
    if (imageResult && imageResult.exact_location && imageResult.confidence > 0.5) {
      console.log(`🖼️ Using medium-confidence image-based location: "${imageResult.exact_location}"`);
      return {
        success: true,
        exact_location: imageResult.exact_location,
        all_locations: [imageResult.exact_location],
        confidence: imageResult.confidence
      };
    }

    if (textResult && textResult.exact_location && textResult.confidence > 0.5) {
      console.log(`📝 Using medium-confidence text-based location: "${textResult.exact_location}"`);
      return {
        success: true,
        exact_location: textResult.exact_location,
        all_locations: textResult.all_locations || [],
        confidence: textResult.confidence
      };
    }

    // Priority 4: Low-confidence results as fallback
    if (imageResult && imageResult.exact_location) {
      console.log(`🖼️ Using low-confidence image-based location as fallback: "${imageResult.exact_location}"`);
      return {
        success: true,
        exact_location: imageResult.exact_location,
        all_locations: [imageResult.exact_location],
        confidence: Math.max(imageResult.confidence || 0.3, 0.3) // Minimum 0.3 confidence
      };
    }

    if (textResult && textResult.exact_location) {
      console.log(`📝 Using low-confidence text-based location as fallback: "${textResult.exact_location}"`);
      return {
        success: true,
        exact_location: textResult.exact_location,
        all_locations: textResult.all_locations || [],
        confidence: Math.max(textResult.confidence || 0.3, 0.3) // Minimum 0.3 confidence
      };
    }

    // Priority 5: Attempt to extract location from title using regex patterns
    console.log(`🔍 Attempting regex-based location extraction as final fallback`);
    const titleText = title.toLowerCase();

    // Common Indonesian location patterns
    const locationPatterns = [
      /(?:di|depan|dekat)\s+([^,.\n]+(?:dpr|mp|istana|polda|kodam|monas|bundaran)[^,.\n]*)/i,
      /(?:jalan|jl\.?)\s+([^,.\n]+(?:sudirman|thamrin|gatot|mh\.)[^,.\n]*)/i,
      /(?:kawasan|daerah)\s+([^,.\n]+)/i,
      /(?:jakarta|pala|bandung|surabaya|yogyakarta|semarang)\s+(?:pusat|utara|selatan|timur|barat)/i,
      /(?:gedung|kantor)\s+([^,.\n]+)/i
    ];

    for (const pattern of locationPatterns) {
      const match = titleText.match(pattern);
      if (match && match[1]) {
        const extractedLocation = match[1].trim();
        if (extractedLocation.length > 3) { // Avoid very short matches
          console.log(`🎯 Regex fallback found location: "${extractedLocation}"`);
          return {
            success: true,
            exact_location: extractedLocation,
            all_locations: [extractedLocation],
            confidence: 0.4 // Low confidence for regex fallback
          };
        }
      }
    }

    // Final fallback: try to find any Indonesian city/province names
    const indonesianLocations = [
      // Major cities
      'jakarta', 'bandung', 'surabaya', 'medan', 'semarang', 'yogyakarta', 'palembang',
      'makassar', 'pekanbaru', 'padang', 'batam', 'malang', 'samarinda', 'denpasar',
      'manado', 'palu', 'kendari', 'gorontalo', 'ambon', 'sofifi', 'jayapura', 'manokwari',
      'pontianak', 'palangka raya', 'banjarmasin', 'tanjung selor', 'mamuju', 'nabire',
      'jayawijaya', 'merauke', 'sorong', 'tanjung pinang', 'jambi', 'bengkulu',
      'bandar lampung', 'pangkal pinang', 'serang', 'kupang', 'mataram', 'banda aceh',

      // Provinces
      'bali', 'jawa barat', 'jawa tengah', 'jawa timur', 'banten', 'nusa tenggara barat',
      'nusa tenggara timur', 'sumatera utara', 'sumatera barat', 'riau', 'kepulauan riau',
      'jambi', 'sumatera selatan', 'bengkulu', 'lampung', 'bangka belitung',
      'kalimantan barat', 'kalimantan tengah', 'kalimantan selatan', 'kalimantan timur',
      'kalimantan utara', 'sulawesi utara', 'sulawesi tengah', 'sulawesi selatan',
      'sulawesi tenggara', 'gorontalo', 'sulawesi barat', 'maluku', 'maluku utara',
      'papua barat', 'papua', 'papua tengah', 'papua pegunungan', 'papua selatan',
      'papua barat daya', 'aceh', 'dki jakarta'
    ];

    for (const location of indonesianLocations) {
      if (titleText.includes(location)) {
        console.log(`🏙️ Found Indonesian location in title: "${location}"`);
        return {
          success: true,
          exact_location: location,
          all_locations: [location],
          confidence: 0.2 // Very low confidence
        };
      }
    }

    console.log(`❌ No location found after all extraction attempts`);
    return {
      success: false,
      error: 'No location found in text, image, or fallback analysis'
    };

  } catch (error) {
    console.error('Detailed location extraction error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown extraction error'
    };
  }
}

// Wrapper function that applies validation to all results
export async function extractDetailedLocationFromTikTok(videoData: any): Promise<DetailedLocationResult> {
  const result = await extractDetailedLocationFromTikTokInternal(videoData);

  // Apply location validation to prevent obviously wrong mappings
  return applyLocationValidation(result);
}

// Debug function to test OpenRouter connection
export async function testOpenRouterConnection(): Promise<{success: boolean, error?: string}> {
  try {
    if (!env.openRouter.apiKey) {
      return { success: false, error: 'API key not configured' };
    }

    const client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: env.openRouter.apiKey,
      defaultHeaders: {
        "HTTP-Referer": "https://safe-jakarta.vercel.app",
        "X-Title": "Safe Jakarta",
      },
    });

    const completion = await client.chat.completions.create({
      model: "gpt-oss-20b:free",
      messages: [{ role: "user", content: 'Say "Hello World" in exactly 2 words.' }],
      max_tokens: 10,
      temperature: 0.1
    });

    const content = completion.choices[0]?.message?.content?.trim();
    return { success: !!content };

  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

