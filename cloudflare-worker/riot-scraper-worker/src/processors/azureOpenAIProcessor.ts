/**
 * Azure OpenAI Processor for Location Extraction
 * Adapted for Cloudflare Workers environment
 */

import { Env } from '../index';

interface LocationResult {
	location: string | null;
	success: boolean;
	error?: string;
}

export async function extractLocationFromArticle(
	title: string,
	description: string,
	env: Env
): Promise<LocationResult> {
	try {
		if (!env.AZURE_OPENAI_API_KEY || !env.AZURE_OPENAI_ENDPOINT || !env.AZURE_OPENAI_DEPLOYMENT) {
			throw new Error('Azure OpenAI configuration is incomplete');
		}

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

		const response = await fetch(
			`${env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${env.AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=2024-02-15-preview`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'api-key': env.AZURE_OPENAI_API_KEY
				},
				body: JSON.stringify({
					model: 'gpt-4o-mini',
					messages: [
						{ role: 'system', content: systemPrompt },
						{ role: 'user', content: userPrompt }
					],
					temperature: 0.1,
					max_tokens: 100
				})
			}
		);

		if (!response.ok) {
			throw new Error(`Azure OpenAI API error: ${response.status} ${response.statusText}`);
		}

		const data = await response.json();
		const content = data.choices?.[0]?.message?.content?.trim();

		if (!content) {
			return { location: null, success: false, error: 'No response from Azure OpenAI' };
		}

		try {
			const parsed = JSON.parse(content);
			const location = parsed.location;

			if (location === null || (typeof location === 'string' && location.trim().length > 0)) {
				return {
					location: location === null ? null : location.trim(),
					success: true
				};
			} else {
				return { location: null, success: false, error: 'Invalid location format' };
			}
		} catch (parseError) {
			console.error('Failed to parse Azure OpenAI response:', content);
			return { location: null, success: false, error: 'Failed to parse response' };
		}

	} catch (error) {
		console.error('Error calling Azure OpenAI:', error);
		return {
			location: null,
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		};
	}
}
