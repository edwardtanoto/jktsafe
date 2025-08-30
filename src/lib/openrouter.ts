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

export async function extractDetailedLocationFromTikTok(videoData: any): Promise<DetailedLocationResult> {
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

TASK: Extract the most specific location where this protest/demo is happening.

EXTRACTION RULES:
1. PRIORITY: Government buildings (DPR, MPR, Istana, Monas, Polda, Kodam, KPK, MK, etc.)
2. Landmarks and squares (Bundaran HI, Patung Kuda, etc.)
3. Street names with numbers (Jl. Sudirman No. 1, etc.)
4. Districts and sub-districts (Tanah Abang, Senen, Kebayoran, etc.)
5. If multiple locations mentioned, choose the PRIMARY protest site
6. Include province/city if specified (Jakarta Pusat, Jawa Barat, etc.)
7. Return null only if absolutely no location is mentioned

INDONESIAN LOCATION PATTERNS:
- "di depan" = "in front of"
- "dekat" = "near"
- "kawasan" = "area"
- "Jl." = "Jalan" (street)
- "No." = house/building number

RESPONSE FORMAT (JSON only):
{
  "exact_location": "Gedung DPR RI, Jakarta Pusat" | null,
  "all_locations": ["Gedung DPR RI", "Jakarta Pusat", "Jakarta"],
  "confidence": 0.85
}

EXAMPLES:
✅ "Demo di depan Gedung DPR RI Jakarta" → {"exact_location": "Gedung DPR RI, Jakarta", "all_locations": ["Gedung DPR RI", "Jakarta"], "confidence": 0.95}
✅ "Kerusuhan Polda Bali Denpasar" → {"exact_location": "Polda Bali, Denpasar", "all_locations": ["Polda Bali", "Denpasar"], "confidence": 0.95}
✅ "Aksi di Bundaran HI Jakarta Pusat" → {"exact_location": "Bundaran HI, Jakarta Pusat", "all_locations": ["Bundaran HI", "Jakarta Pusat", "Jakarta"], "confidence": 0.9}
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
- Famous landmarks: Monas, Bundaran HI, Patung Kuda, Istiqlal Mosque, Cathedral
- Street signs: Jl. Sudirman, Jl. Thamrin, Jl. Gatot Subroto, etc.
- District names: Jakarta Pusat, Jakarta Selatan, Senen, Tanah Abang, etc.
- Police stations: Mapolda, Polres, Polsek
- Universities: UI, UGM, ITB, UNPAD, etc.
- Text overlays or signs visible in the image

INDONESIAN-SPECIFIC HINTS:
- Look for "Polda" (Provincial Police HQ) or "Polres" (District Police)
- "DPR" usually refers to People's Representative Council building
- "Bundaran" means roundabout/traffic circle
- "Jl." means "Jalan" (street)
- Numbers after street names indicate building/house numbers

IMPORTANT:
- Be VERY specific about the location
- If you see a building name or sign, include it
- If you see street names, include them with any numbers
- Focus ONLY on Indonesian locations
- If multiple possible locations, choose the most prominent one

What exact location is shown in this image? Be as specific as possible about the building, street, or landmark visible.`;

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
      'jakarta', 'bandung', 'surabaya', 'medan', 'semarang', 'yogyakarta', 'palembang',
      'makassar', 'batam', 'pekanbaru', 'padang', 'malang', 'samarinda', 'denpasar',
      'bali', 'jawa barat', 'jawa tengah', 'jawa timur', 'sumatera utara', 'sumatera selatan'
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