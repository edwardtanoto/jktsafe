interface LocationResult {
  location: string | null;
  success: boolean;
  error?: string;
}

interface OpenRouterResponse {
  choices: Array<{
    message?: {
      content?: string;
    };
  }>;
}

async function callOpenRouterAPI(messages: any[]): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
      "X-Title": "Riot Signal Monitor",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      "model": "openai/gpt-oss-20b:free",
      "messages": messages,
      "temperature": 0.1,
      "max_tokens": 100
    })
  });

  if (!response.ok) {
    throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as OpenRouterResponse;
  return data.choices[0]?.message?.content || "";
}

export async function extractLocationFromArticle(title: string, description: string): Promise<LocationResult> {
  try {
    const systemPrompt = `You are an expert at extracting location information from Indonesian news articles about riots, protests, or civil unrest. Your task is to identify the specific Indonesian place name where the incident occurred.

Instructions:
- Extract only the Indonesian place name (city, district, province) where the riot/incident happened
- Return ONLY the place name, not the full address
- If no specific location is mentioned, return "null"
- Focus on the primary location where the incident occurred
- Respond strictly in JSON format: {"location": "place_name"} or {"location": null}

Examples:
- Article about riot in Jakarta: {"location": "Jakarta"}
- Article about protest in Surabaya: {"location": "Surabaya"}
- Article about incident in Bandung: {"location": "Bandung"}
- No location mentioned: {"location": null}`;

    const userPrompt = `Article Title: ${title}
Article Description: ${description}

Extract the Indonesian place name where this incident occurred:`;

    const content = await callOpenRouterAPI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]);

    if (!content) {
      return { location: null, success: false, error: 'No response from OpenRouter' };
    }

    try {
      const parsed = JSON.parse(content);
      const location = parsed.location;

      // Remove unused variable warning by using it
      if (typeof location !== 'string' && location !== null) {
        return { location: null, success: false, error: 'Invalid location format' };
      }

      if (location === null || (typeof location === 'string' && location.trim().length > 0)) {
        return {
          location: location === null ? null : location.trim(),
          success: true
        };
      } else {
        return { location: null, success: false, error: 'Invalid location format' };
      }
    } catch {
      console.error('Failed to parse OpenRouter response:', content);
      return { location: null, success: false, error: 'Failed to parse response' };
    }

  } catch (error) {
    console.error('Error calling OpenRouter:', error);
    return {
      location: null,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
