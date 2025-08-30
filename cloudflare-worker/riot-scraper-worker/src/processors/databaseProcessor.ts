/**
 * Database Processor
 * Sends processed events to the main application via API
 */

import { Env } from '../index';

interface EventData {
	title: string;
	description: string;
	lat: number;
	lng: number;
	source: string;
	url?: string;
	verified: boolean;
	type: string;
}

export async function saveEventToDatabase(eventData: EventData, env: Env): Promise<boolean> {
	try {
		if (!env.MAIN_APP_URL) {
			throw new Error('Main app URL is not configured');
		}

		// Check if event already exists to avoid duplicates
		const existingCheckResponse = await fetch(`${env.MAIN_APP_URL}/api/events/exists?title=${encodeURIComponent(eventData.title)}&url=${encodeURIComponent(eventData.url || '')}`);

		if (existingCheckResponse.ok) {
			const existsData = await existingCheckResponse.json();
			if (existsData.exists) {
				console.log(`⚠️ Event already exists: ${eventData.title}`);
				return true; // Not an error, just already exists
			}
		}

		// Create new event
		const createResponse = await fetch(`${env.MAIN_APP_URL}/api/events`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'User-Agent': 'RiotSignal-Worker/1.0'
			},
			body: JSON.stringify(eventData)
		});

		if (!createResponse.ok) {
			const errorText = await createResponse.text();
			throw new Error(`Failed to save event: ${createResponse.status} ${errorText}`);
		}

		const result = await createResponse.json();

		if (result.success) {
			console.log(`💾 Successfully saved event: ${eventData.title}`);
			return true;
		} else {
			console.error('❌ Failed to save event:', result.error);
			return false;
		}

	} catch (error) {
		console.error('❌ Error saving event to database:', error);
		return false;
	}
}

// Optional: Batch save multiple events at once
export async function saveEventsBatch(eventsData: EventData[], env: Env): Promise<{ saved: number; errors: number }> {
	let saved = 0;
	let errors = 0;

	// Process in smaller batches to avoid overwhelming the API
	const batchSize = 3;

	for (let i = 0; i < eventsData.length; i += batchSize) {
		const batch = eventsData.slice(i, i + batchSize);

		// Process batch concurrently
		const batchPromises = batch.map(eventData => saveEventToDatabase(eventData, env));
		const batchResults = await Promise.allSettled(batchPromises);

		// Count results
		for (const result of batchResults) {
			if (result.status === 'fulfilled' && result.value) {
				saved++;
			} else {
				errors++;
			}
		}

		// Small delay between batches
		if (i + batchSize < eventsData.length) {
			await new Promise(resolve => setTimeout(resolve, 1000));
		}
	}

	return { saved, errors };
}
