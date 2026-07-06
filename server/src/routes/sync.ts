import { Router, Request, Response } from 'express';
import { prisma } from '../utils/db';
import { authenticate, authorize } from '../middleware/auth';
import { syncAllPlayers } from '../services/sync';

export const syncRouter = Router();

syncRouter.use(authenticate);

/**
 * POST /api/sync/start
 * Create a sync log entry — call before starting per-player sync
 * Admin only
 */
syncRouter.post('/start', authorize('ADMIN'), async (req: Request, res: Response) => {
  const { type, playerCount, afterDate } = req.body;
  try {
    const syncLog = await prisma.syncLog.create({
      data: {
        status: 'running',
        params: { type: type || 'all', playerCount: playerCount || 0, afterDate: afterDate || null },
      },
    });
    return res.json({ syncLogId: syncLog.id });
  } catch (err) {
    console.error('Error creating sync log:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/sync/complete/:logId
 * Finalize a sync log entry with totals
 * Admin only
 */
syncRouter.post('/complete/:logId', authorize('ADMIN'), async (req: Request, res: Response) => {
  const { playersSynced, activitiesFound, accepted, rejected, flagged, error } = req.body;
  try {
    const updated = await prisma.syncLog.update({
      where: { id: req.params.logId },
      data: {
        status: error ? 'failed' : 'completed',
        completedAt: new Date(),
        playerssynced: playersSynced || 0,
        activitiesFound: activitiesFound || 0,
        accepted: accepted || 0,
        rejected: rejected || 0,
        flagged: flagged || 0,
        error: error || null,
      },
    });
    return res.json({ syncLog: updated });
  } catch (err) {
    console.error('Error completing sync log:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/sync
 * Trigger a manual sync for all players (legacy — kept for compatibility)
 * Admin only
 */
syncRouter.post('/', authorize('ADMIN'), async (_req: Request, res: Response) => {
  try {
    const result = await syncAllPlayers();
    return res.json({
      message: 'Sync completed',
      ...result,
    });
  } catch (err: any) {
    console.error('Sync error:', err);
    return res.status(500).json({ error: 'Sync failed', details: err.message });
  }
});

/**
 * GET /api/sync/players
 * Get list of active players available for sync (with token status)
 * Admin only
 */
syncRouter.get('/players', authorize('ADMIN'), async (_req: Request, res: Response) => {
  try {
    const players = await prisma.player.findMany({
      where: { status: 'ACTIVE' },
      include: {
        user: {
          select: { id: true, name: true, stravaAccessToken: true, stravaRefreshToken: true, tokenExpiresAt: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const list = players.map(p => ({
      playerId: p.id,
      userId: p.user.id,
      name: p.user.name,
      hasToken: !!(p.user.stravaAccessToken && p.user.stravaRefreshToken),
    }));

    return res.json({ players: list });
  } catch (err) {
    console.error('Error listing sync players:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/sync/player/:playerId
 * Sync a single player's activities
 * Admin only — used for progress-based sync
 */
syncRouter.post('/player/:playerId', authorize('ADMIN'), async (req: Request, res: Response) => {
  try {
    const player = await prisma.player.findUnique({
      where: { id: req.params.playerId },
      include: {
        user: {
          select: { id: true, name: true, stravaAccessToken: true, stravaRefreshToken: true, tokenExpiresAt: true },
        },
      },
    });

    if (!player) return res.status(404).json({ error: 'Player not found' });
    if (!player.user.stravaAccessToken) {
      return res.json({ player: player.user.name, status: 'skipped', reason: 'No Strava token', activities: 0, accepted: 0, rejected: 0 });
    }

    const challenge = await prisma.challengeConfig.findFirst({ where: { isActive: true } });
    if (!challenge) return res.status(400).json({ error: 'No active challenge' });

    // Use the syncAllPlayers internals but for one player
    const { getValidAccessToken, fetchStravaActivities } = await import('../services/strava');
    const { validateActivity } = await import('../services/validation');

    const tokenResult = await getValidAccessToken(
      player.user.stravaAccessToken!,
      player.user.stravaRefreshToken!,
      player.user.tokenExpiresAt || new Date(0)
    );

    if (!tokenResult) {
      return res.json({ player: player.user.name, status: 'error', reason: 'Token refresh failed', activities: 0, accepted: 0, rejected: 0 });
    }

    // Update tokens if refreshed
    if (tokenResult.accessToken !== player.user.stravaAccessToken) {
      await prisma.user.update({
        where: { id: player.user.id },
        data: { stravaAccessToken: tokenResult.accessToken, stravaRefreshToken: tokenResult.refreshToken, tokenExpiresAt: tokenResult.expiresAt },
      });
    }

    // Fetch only since last sync for this player
    const afterOverride = req.query.after as string | undefined;
    let afterDate: Date;
    if (afterOverride) {
      afterDate = new Date(afterOverride);
    } else {
      const lastSynced = await prisma.activity.findFirst({
        where: { playerId: player.id },
        orderBy: { startDate: 'desc' },
        select: { startDate: true },
      });
      afterDate = lastSynced ? new Date(lastSynced.startDate.getTime() - 86400000) : challenge.startDate;
    }
    const afterTimestamp = Math.floor(afterDate.getTime() / 1000);

    let allActivities: any[] = [];
    let page = 1;
    while (true) {
      const batch = await fetchStravaActivities(tokenResult.accessToken, afterTimestamp, page, 50);
      if (!batch || batch.length === 0) break;
      const relevant = batch.filter((a: any) => a.type === 'Walk' || a.type === 'Hike');
      allActivities = allActivities.concat(relevant);
      if (batch.length < 50) break;
      page++;
      if (page > 10) break;
    }

    let accepted = 0, rejected = 0, skipped = 0;

    for (const rawActivity of allActivities) {
      // Skip if already synced
      const existing = await prisma.activity.findUnique({ where: { stravaActivityId: rawActivity.id.toString() } });
      if (existing) { skipped++; continue; }

      const validation = await validateActivity(rawActivity, player, challenge);

      let creditedMeters = 0;
      if (validation.status === 'ACCEPTED') {
        if (validation.cappedDistanceMeters !== undefined) {
          creditedMeters = validation.cappedDistanceMeters;
        } else {
          const actDate = new Date(rawActivity.start_date);
          const dayStart = new Date(actDate); dayStart.setHours(0, 0, 0, 0);
          const dayEnd = new Date(actDate); dayEnd.setHours(23, 59, 59, 999);
          const dailySoFar = await prisma.activity.aggregate({
            where: { playerId: player.id, startDate: { gte: dayStart, lte: dayEnd }, status: 'ACCEPTED' },
            _sum: { creditedMeters: true },
          });
          const usedMeters = dailySoFar._sum.creditedMeters || 0;
          const maxDaily = (challenge.maxDailyKm || 7) * 1000;
          creditedMeters = Math.min(rawActivity.distance || 0, Math.max(0, maxDaily - usedMeters));
        }
      }

      await prisma.activity.create({
        data: {
          stravaActivityId: rawActivity.id.toString(),
          playerId: player.id,
          type: rawActivity.type === 'Hike' ? 'HIKE' : 'WALK',
          distanceMeters: rawActivity.distance || 0,
          creditedMeters,
          durationSeconds: rawActivity.elapsed_time || 0,
          movingTimeSeconds: rawActivity.moving_time || 0,
          elapsedTimeSeconds: rawActivity.elapsed_time || 0,
          avgSpeed: rawActivity.average_speed || 0,
          maxSpeed: rawActivity.max_speed || 0,
          startDate: new Date(rawActivity.start_date),
          startLatlng: rawActivity.start_latlng ? rawActivity.start_latlng.join(',') : null,
          hasPolyline: !!rawActivity.map?.summary_polyline,
          manual: rawActivity.manual || false,
          status: validation.status,
          rejectionReason: validation.reason || null,
        },
      });

      if (validation.status === 'ACCEPTED') accepted++;
      else rejected++;
    }

    // Tier 1 fraud detection — runs on saved data, no extra API calls
    const { runFraudDetection } = await import('../services/fraud');
    const fraudResults = await runFraudDetection(player.id, new Date(Date.now() - 60000)); // check activities saved in last minute
    const fraudFlagged = fraudResults.length;
    if (fraudFlagged > 0) {
      accepted -= fraudFlagged; // they were accepted, now flagged
    }

    return res.json({
      player: player.user.name,
      status: 'done',
      activities: allActivities.length,
      accepted,
      rejected,
      skipped,
      flagged: fraudFlagged,
    });
  } catch (err: any) {
    console.error('Single player sync error:', err);
    return res.json({ player: req.params.playerId, status: 'error', reason: err.message, activities: 0, accepted: 0, rejected: 0 });
  }
});

/**
 * GET /api/sync/status
 * Get the latest sync status
 */
syncRouter.get('/status', async (_req: Request, res: Response) => {
  try {
    const latest = await prisma.syncLog.findFirst({
      orderBy: { startedAt: 'desc' },
    });

    return res.json({ lastSync: latest });
  } catch (err) {
    console.error('Error getting sync status:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/sync/history
 * Get sync history (last 20 syncs)
 * Admin only
 */
syncRouter.get('/history', authorize('ADMIN'), async (_req: Request, res: Response) => {
  try {
    const history = await prisma.syncLog.findMany({
      orderBy: { startedAt: 'desc' },
      take: 20,
    });

    return res.json({ history });
  } catch (err) {
    console.error('Error getting sync history:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
