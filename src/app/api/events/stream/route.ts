import { NextRequest } from 'next/server';
import { prisma } from '../../../../lib/prisma';

export async function GET(request: NextRequest) {
  // Set up SSE headers
  const responseStream = new ReadableStream({
    start(controller) {
      // Send initial data
      const sendInitialData = async () => {
        try {
          const events = await prisma.event.findMany({
            orderBy: { createdAt: 'desc' },
            take: 100
          });

          const data = `data: ${JSON.stringify({
            type: 'initial',
            events
          })}\n\n`;

          controller.enqueue(new TextEncoder().encode(data));
        } catch (error) {
          console.error('Error fetching initial events:', error);
        }
      };

      sendInitialData();

      // Set up polling for new events (in production, you'd use database triggers/webhooks)
      const interval = setInterval(async () => {
        try {
          const recentEvents = await prisma.event.findMany({
            where: {
              createdAt: {
                gte: new Date(Date.now() - 60000) // Events from last minute
              }
            },
            orderBy: { createdAt: 'desc' }
          });

          if (recentEvents.length > 0) {
            const data = `data: ${JSON.stringify({
              type: 'update',
              events: recentEvents
            })}\n\n`;

            controller.enqueue(new TextEncoder().encode(data));
          }
        } catch (error) {
          console.error('Error polling for events:', error);
        }
      }, 30000); // Poll every 30 seconds

      // Clean up interval when connection closes
      request.signal.addEventListener('abort', () => {
        clearInterval(interval);
        controller.close();
      });
    }
  });

  return new Response(responseStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    },
  });
}
