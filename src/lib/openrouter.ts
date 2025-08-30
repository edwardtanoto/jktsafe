import { env } from '../../env.config';

export interface LocationResult {
  success: boolean;
  location?: string;
  confidence?: number;
  error?: string;
}

export async function extractLocationFromArticle(title: string, content: string): Promise<LocationResult> {
  try {
    if (!env.azureOpenAI.apiKey) {
      return {
        success: false,
        error: 'Azure OpenAI API key not configured'
      };
    }

    const prompt = `Extract the specific location mentioned in this Indonesian protest news/video. Focus on finding the exact place where the protest is happening.

Title: ${title}
Content: ${content}

Return ONLY the location name in Indonesian, without any additional text. If no specific location is mentioned, return "unknown".

Examples:
- "Kerusuhan di depan Polda Bali" → "Polda Bali"
- "Demo mahasiswa di Gedung DPR RI Jakarta" → "Gedung DPR RI Jakarta"
- "Aksi massa tolak kenaikan BBM di Monas" → "Monas"
- "Bentrok antara mahasiswa dan polisi di Yogyakarta" → "Yogyakarta"`;

    const response = await fetch(`${env.azureOpenAI.endpoint}/openai/deployments/${env.azureOpenAI.deployment}/chat/completions?api-version=2023-12-01-preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': env.azureOpenAI.apiKey
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 100,
        temperature: 0.1
      })
    });

    if (!response.ok) {
      return {
        success: false,
        error: `OpenAI API error: ${response.status}`
      };
    }

    const data = await response.json();
    const extractedLocation = data.choices?.[0]?.message?.content?.trim();

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