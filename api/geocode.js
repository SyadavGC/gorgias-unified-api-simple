/**
 * /api/geocode.js
 * Server-side proxy for Google Geocoding API
 *
 * Keeps the Google API key on the server instead of exposing it in client-side code.
 * Deployed on Vercel alongside create-ticket.js.
 *
 * Environment Variables Required:
 * - GOOGLE_API_KEY (your Google Geocoding API key)
 * - ALLOWED_ORIGIN (comma-separated, reuses the same env var as create-ticket.js)
 */

import fetch from 'node-fetch';

// ========================================
// CONFIGURATION
// ========================================
const allowedOrigins = process.env.ALLOWED_ORIGIN?.split(',').map(o => o.trim()) || [];

// Rate limiting (in-memory, resets on cold start)
const rateLimitMap = new Map();
const RATE_LIMIT = 20; // generous limit — geocode is triggered on zipcode input
const RATE_WINDOW = 60000; // 1 minute

// Input constraints
const MAX_POSTAL_CODE_LENGTH = 20;
const POSTAL_CODE_REGEX = /^[a-zA-Z0-9\s\-]{2,20}$/;

// ========================================
// HELPERS
// ========================================
function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  if (!record || now - record.start > RATE_WINDOW) {
    rateLimitMap.set(ip, { start: now, count: 1 });
    return true;
  }
  record.count++;
  return record.count <= RATE_LIMIT;
}

function sendCORS(res, req) {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ========================================
// MAIN HANDLER
// ========================================
export default async function handler(req, res) {
  sendCORS(res, req);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Origin enforcement
  const origin = req.headers.origin;
  if (!origin || !allowedOrigins.includes(origin)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Rate limiting
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
  }

  // Validate API key is configured
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error('[geocode] GOOGLE_API_KEY not configured');
    return res.status(500).json({ error: 'Service temporarily unavailable' });
  }

  // Validate postal code input
  const postalCode = req.query.postalCode;
  if (!postalCode || typeof postalCode !== 'string') {
    return res.status(400).json({ error: 'Missing postalCode parameter' });
  }

  const trimmed = postalCode.trim();
  if (trimmed.length > MAX_POSTAL_CODE_LENGTH || !POSTAL_CODE_REGEX.test(trimmed)) {
    return res.status(400).json({ error: 'Invalid postal code format' });
  }

  try {
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(trimmed)}&key=${apiKey}`;
    const response = await fetch(geocodeUrl);
    const data = await response.json();

    if (data.status !== 'OK' || !data.results || data.results.length === 0) {
      return res.status(200).json({ status: data.status, results: [] });
    }

    // Only return what the frontend needs — strip everything else
    const result = data.results[0];
    const components = (result.address_components || []).map(c => ({
      long_name: c.long_name,
      short_name: c.short_name,
      types: c.types
    }));

    // Cache for 24h — postal code lookups rarely change
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');

    return res.status(200).json({
      status: 'OK',
      results: [{
        address_components: components
      }]
    });

  } catch (error) {
    console.error('[geocode] Proxy error');
    return res.status(502).json({ error: 'Geocoding service temporarily unavailable' });
  }
}
