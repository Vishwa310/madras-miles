import { Router } from 'express';
import { prisma } from '../utils/db';
import { signToken } from '../utils/jwt';
import { getStravaAuthUrl } from '../services/strava';
import { config } from '../config';
import { authenticate } from '../middleware/auth';

export const authRouter = Router();

/**
 * GET /api/auth/strava
 * Redirect to Strava OAuth consent page
 */
authRouter.get('/strava', (_req, res) => {
  const authUrl = getStravaAuthUrl();
  res.redirect(authUrl);
});

/**
 * POST /api/auth/strava/token
 * DEPRECATED - kept for compatibility
 */
authRouter.post('/strava/token', async (req, res) => {
  return res.status(400).json({ error: 'Use /api/auth/strava/register instead' });
});

/**
 * POST /api/auth/strava/register
 * Frontend exchanges code with Strava directly, then sends athlete data here.
 * Backend creates/updates user and issues JWT. No outbound HTTPS needed.
 */
authRouter.post('/strava/register', async (req, res) => {
  const { athlete, access_token, refresh_token, expires_at } = req.body;

  if (!athlete || !access_token) {
    return res.status(400).json({ error: 'athlete and access_token are required' });
  }

  try {
    const stravaAthleteId = athlete.id.toString();
    console.log(`[OAuth] Register: ${athlete.firstname} ${athlete.lastname} (${stravaAthleteId})`);

    let user = await prisma.user.findUnique({ where: { stravaAthleteId } });

    if (!user) {
      user = await prisma.user.create({
        data: {
          stravaAthleteId,
          name: `${athlete.firstname} ${athlete.lastname}`,
          avatarUrl: athlete.profile || null,
          email: athlete.email || null,
          role: 'PLAYER',
          stravaAccessToken: access_token,
          stravaRefreshToken: refresh_token,
          tokenExpiresAt: new Date(expires_at * 1000),
        },
      });
      console.log(`[OAuth] New user: ${user.name}`);
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          stravaAccessToken: access_token,
          stravaRefreshToken: refresh_token,
          tokenExpiresAt: new Date(expires_at * 1000),
          name: `${athlete.firstname} ${athlete.lastname}`,
          avatarUrl: athlete.profile || undefined,
          email: athlete.email || user.email || undefined,
        },
      });
    }

    const jwt = signToken({
      userId: user.id,
      stravaAthleteId: user.stravaAthleteId,
      role: user.role,
    });

    return res.json({ token: jwt, user: { name: user.name, role: user.role } });
  } catch (err: any) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * GET /api/auth/strava/callback
 * Fallback callback - redirects to frontend with code for client-side exchange
 */
authRouter.get('/strava/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.redirect(`${config.clientUrl}/login?error=access_denied`);
  }

  if (!code || typeof code !== 'string') {
    return res.redirect(`${config.clientUrl}/login?error=no_code`);
  }

  // Redirect to frontend with the code — frontend will POST it to /api/auth/strava/token
  return res.redirect(`${config.clientUrl}/auth/callback?code=${code}`);
});

/**
 * GET /api/auth/me
 * Get current authenticated user info
 */
authRouter.get('/me', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        stravaAthleteId: true,
        name: true,
        email: true,
        avatarUrl: true,
        role: true,
        createdAt: true,
        player: {
          select: {
            id: true,
            gender: true,
            slot: true,
            status: true,
            team: {
              select: {
                id: true,
                name: true,
                emblem: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ user });
  } catch (err) {
    console.error('Error fetching user:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
