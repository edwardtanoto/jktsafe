import { Redis } from '@upstash/redis';

// Initialize Upstash Redis client for Pub/Sub
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Channel names for different types of updates
export const PUBSUB_CHANNELS = {
  NEW_EVENTS: 'new-events',
  NEW_WARNING_MARKERS: 'new-warning-markers',
  SYSTEM_UPDATES: 'system-updates',
} as const;

// Message types
export interface NewEventMessage {
  type: 'event';
  action: 'created' | 'updated' | 'deleted';
  id: number;
  data?: any;
  timestamp: number;
}

export interface NewWarningMarkerMessage {
  type: 'warning_marker';
  action: 'created' | 'updated' | 'deleted';
  id: number;
  data?: any;
  timestamp: number;
}

export interface SystemMessage {
  type: 'system';
  action: 'scrape_completed' | 'maintenance' | 'error';
  message: string;
  timestamp: number;
}

export type PubSubMessage = NewEventMessage | NewWarningMarkerMessage | SystemMessage;

/**
 * Publish a message to a Redis channel
 */
export async function publishMessage(channel: string, message: PubSubMessage): Promise<boolean> {
  try {
    const result = await redis.publish(channel, JSON.stringify(message));

    if (result > 0) {
      console.log(`📡 Published message to ${channel}:`, message.type, message.action);
      return true;
    } else {
      console.warn(`⚠️ No subscribers for channel ${channel}`);
      return false;
    }
  } catch (error) {
    console.error('❌ Failed to publish message:', error);
    return false;
  }
}

/**
 * Publish new event notification
 */
export async function publishNewEvent(eventId: number, action: 'created' | 'updated' | 'deleted' = 'created', data?: any): Promise<boolean> {
  const message: NewEventMessage = {
    type: 'event',
    action,
    id: eventId,
    data,
    timestamp: Date.now(),
  };

  return publishMessage(PUBSUB_CHANNELS.NEW_EVENTS, message);
}

/**
 * Publish new warning marker notification
 */
export async function publishNewWarningMarker(markerId: number, action: 'created' | 'updated' | 'deleted' = 'created', data?: any): Promise<boolean> {
  const message: NewWarningMarkerMessage = {
    type: 'warning_marker',
    action,
    id: markerId,
    data,
    timestamp: Date.now(),
  };

  return publishMessage(PUBSUB_CHANNELS.NEW_WARNING_MARKERS, message);
}

/**
 * Publish system message
 */
export async function publishSystemMessage(action: 'scrape_completed' | 'maintenance' | 'error', message: string): Promise<boolean> {
  const systemMessage: SystemMessage = {
    type: 'system',
    action,
    message,
    timestamp: Date.now(),
  };

  return publishMessage(PUBSUB_CHANNELS.SYSTEM_UPDATES, systemMessage);
}

/**
 * Subscribe to messages (for Edge runtime)
 * Note: This uses Upstash Redis REST API for serverless environments
 */
export async function subscribeToChannel(channel: string): Promise<Response> {
  try {
    // Use Upstash Redis REST API for subscription
    const response = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/SUBSCRIBE/${channel}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    return response;
  } catch (error) {
    console.error('❌ Failed to subscribe to channel:', error);
    throw error;
  }
}

/**
 * Get messages from a channel (polling approach for REST API)
 */
export async function getChannelMessages(channel: string, lastId?: string): Promise<PubSubMessage[]> {
  try {
    // This is a simplified approach. In production, you might want to use WebSocket
    // or implement proper Redis subscription handling
    const messages: PubSubMessage[] = [];

    // For now, return empty array - messages will be handled by direct publishing
    return messages;
  } catch (error) {
    console.error('❌ Failed to get channel messages:', error);
    return [];
  }
}
