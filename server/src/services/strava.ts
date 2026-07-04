import { config } from '../config';

const STRAVA_AUTH_URL = 'https://www.strava.com/oauth/authorize';
const STRAVA_API_BASE = 'https://www.strava.com/api/v3';

export interface StravaTokenResponse {
  token_type: string;
  expires_at: number;
  expires_in: number;
  refresh_token: string;
  access_token: string;
  athlete: {
    id: number;
    firstname: string;
    lastname: string;
    profile: string;
    email?: string;
  };
}

export interface StravaRefreshResponse {
  token_type: string;
  expires_at: number;
  expires_in: number;
  refresh_token: string;
  access_token: string;
}

/**
 * Generate the Strava OAuth authorization URL
 */
export function getStravaAuthUrl(state?: string): string {
  const params = new URLSearchParams({
    client_id: config.strava.clientId,
    redirect_uri: config.strava.redirectUri,
    response_type: 'code',
    scope: 'read,activity:read_all',
    approval_prompt: 'auto',
  });

  if (state) {
    params.set('state', state);
  }

  return `${STRAVA_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for access/refresh tokens
 */
/**
 * Refresh an expired access token
 */
export async function refreshStravaToken(refreshToken: string): Promise<StravaRefreshResponse> {
  const response = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: config.strava.clientId,
      client_secret: config.strava.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Strava token refresh failed: ${response.status} ${error}`);
  }

  return response.json();
}

/**
 * Get a valid access token for a user, refreshing if expired
 */
export async function getValidAccessToken(
  currentToken: string,
  refreshToken: string,
  expiresAt: Date
): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date } | null> {
  // If token is still valid (with 5 min buffer), return it
  const now = new Date();
  const bufferMs = 5 * 60 * 1000;

  if (expiresAt.getTime() - bufferMs > now.getTime()) {
    return { accessToken: currentToken, refreshToken, expiresAt };
  }

  // Token expired — refresh it
  try {
    const refreshed = await refreshStravaToken(refreshToken);
    return {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token,
      expiresAt: new Date(refreshed.expires_at * 1000),
    };
  } catch (error) {
    console.error('Failed to refresh Strava token:', error);
    return null;
  }
}

/**
 * Fetch athlete activities from Strava
 */
export async function fetchStravaActivities(
  accessToken: string,
  after?: number,
  page: number = 1,
  perPage: number = 50
) {
  const params = new URLSearchParams({
    page: page.toString(),
    per_page: perPage.toString(),
  });

  if (after) {
    params.set('after', after.toString());
  }

  const response = await fetch(`${STRAVA_API_BASE}/athlete/activities?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Strava API error: ${response.status} ${error}`);
  }

  return response.json();
}
