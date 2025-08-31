-- Export events to CSV using PostgreSQL COPY command
-- Run this in your PostgreSQL client (psql) or pgAdmin

-- Export all events to CSV
\copy (SELECT id, title, description, lat, lng, source, url, verified, type, "extractedLocation", "googleMapsUrl", "createdAt", "updatedAt" FROM events ORDER BY "createdAt" DESC) TO 'events-export.csv' WITH CSV HEADER;

-- Export only riots from last 24 hours
\copy (SELECT id, title, description, lat, lng, source, url, verified, type, "extractedLocation", "googleMapsUrl", "createdAt", "updatedAt" FROM events WHERE type = 'riot' AND "createdAt" >= NOW() - INTERVAL '24 hours' ORDER BY "createdAt" DESC) TO 'events-riots-24h.csv' WITH CSV HEADER;

-- Export only verified events
\copy (SELECT id, title, description, lat, lng, source, url, verified, type, "extractedLocation", "googleMapsUrl", "createdAt", "updatedAt" FROM events WHERE verified = true ORDER BY "createdAt" DESC) TO 'events-verified.csv' WITH CSV HEADER;
