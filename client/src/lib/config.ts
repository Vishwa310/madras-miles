// API base URL — set via env var at build time
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002';
export const STRAVA_CLIENT_ID = import.meta.env.VITE_STRAVA_CLIENT_ID || '159567';
export const STRAVA_CLIENT_SECRET = import.meta.env.VITE_STRAVA_CLIENT_SECRET || 'ba7475e523ff37a35c06bf1fb191a9affeed21f9';
