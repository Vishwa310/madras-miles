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
  // Hardcoded — these don't change and env vars on Render may be incorrect
  const CLIENT_ID = '159567';
  const CLIENT_SECRET = 'ba7475e523ff37a35c06bf1fb191a9affeed21f9';

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const response = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`[Strava] Token refresh failed: ${response.status} — ${error}`);
    throw new Error(`Strava token refresh failed: ${response.status} ${error}`);
  }

  return response.json() as Promise<StravaRefreshResponse>;
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
 * Fetch athlete activities from Strava (with 401 retry)
 */
export async function fetchStravaActivities(
  accessToken: string,
  after?: number,
  page: number = 1,
  perPage: number = 50,
  refreshToken?: string
): Promise<any[]> {
  const params = new URLSearchParams({
    page: page.toString(),
    per_page: perPage.toString(),
  });

  if (after) {
    params.set('after', after.toString());
  }

  let response = await fetch(`${STRAVA_API_BASE}/athlete/activities?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  // On 401, try refreshing token and retry once
  if (response.status === 401 && refreshToken) {
    try {
      const refreshed = await refreshStravaToken(refreshToken);
      // Retry with new token
      response = await fetch(`${STRAVA_API_BASE}/athlete/activities?${params}`, {
        headers: { Authorization: `Bearer ${refreshed.access_token}` },
      });
      // Store refreshed token for caller to save
      (response as any)._refreshedToken = refreshed;
    } catch {
      // Refresh failed too — throw original error
    }
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Strava API error: ${response.status} ${error}`);
  }

  return response.json();
}
