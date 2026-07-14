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
        params: { type: type || 'all', playerCount: playerCount || 0, afterDate: afterDate || null, completedPlayers: [] },
      },
    });
    return res.json({ syncLogId: syncLog.id });
  } catch (err) {
    console.error('Error creating sync log:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/sync/checkpoint/:logId
 * Update checkpoint — mark a player as completed in the running sync
 * Admin only
 */
syncRouter.post('/checkpoint/:logId', authorize('ADMIN'), async (req: Request, res: Response) => {
  const { playerId, playerName, result } = req.body;
  try {
    const log = await prisma.syncLog.findUnique({ where: { id: req.params.logId } });
    if (!log) return res.status(404).json({ error: 'Sync log not found' });

    const params = (log.params as any) || {};
    const completedPlayers = params.completedPlayers || [];
    completedPlayers.push({ playerId, playerName, result, at: new Date().toISOString() });

    await prisma.syncLog.update({
      where: { id: req.params.logId },
      data: {
        params: { ...params, completedPlayers },
        playerssynced: completedPlayers.length,
      },
    });

    return res.json({ checkpoint: completedPlayers.length });
  } catch (err) {
    console.error('Error updating checkpoint:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/sync/checkpoint/:logId
 * Get the last checkpoint for a running sync — used for resume
 * Admin only
 */
syncRouter.get('/checkpoint/:logId', authorize('ADMIN'), async (req: Request, res: Response) => {
  try {
    const log = await prisma.syncLog.findUnique({ where: { id: req.params.logId } });
    if (!log) return res.status(404).json({ error: 'Sync log not found' });

    const params = (log.params as any) || {};
    const completedPlayers = params.completedPlayers || [];
    const completedIds = completedPlayers.map((p: any) => p.playerId);

    return res.json({
      syncLogId: log.id,
      status: log.status,
      completedCount: completedPlayers.length,
      completedPlayerIds: completedIds,
    });
  } catch (err) {
    console.error('Error getting checkpoint:', err);
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
      where: {},  // Sync all players (active, standby, retired)
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
          externalId: rawActivity.external_id || null,
          deviceName: rawActivity.device_name || null,
          status: validation.status,
          rejectionReason: validation.reason || null,
          flagReason: validation.flagReason || null,
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
    }

    // Tier 2 auto split pace check — only for newly synced activities (not backlog)
    let splitFlagged = 0;
    const newAccepted = allActivities.length - skipped;
    if (newAccepted > 0 && newAccepted <= 50) {
      // Get newly accepted activities for this player
      const { fetchAndValidateSplits } = await import('../services/validation');
      const recentActivities = await prisma.activity.findMany({
        where: { playerId: player.id, status: 'ACCEPTED', syncedAt: { gte: new Date(Date.now() - 60000) } },
        select: { id: true, stravaActivityId: true },
      });

      for (const act of recentActivities) {
        try {
          const { splits, flagReason: splitFlag } = await fetchAndValidateSplits(act.stravaActivityId, tokenResult.accessToken);
          await prisma.activity.update({
            where: { id: act.id },
            data: {
              splitData: splits.length > 0 ? splits : undefined,
              ...(splitFlag && { flagReason: splitFlag }),
            },
          });
          if (splitFlag) splitFlagged++;
          // Small delay to respect Strava rate limits
          await new Promise(r => setTimeout(r, 500));
        } catch {
          // Skip split check on error — don't block sync
        }
      }
    }

    return res.json({
      player: player.user.name,
      status: 'done',
      activities: allActivities.length,
      accepted,
      rejected,
      skipped,
      flagged: fraudFlagged + splitFlagged,
    });
  } catch (err: any) {
    console.error('Single player sync error:', err);
    return res.json({ player: req.params.playerId, status: 'error', reason: err.message, activities: 0, accepted: 0, rejected: 0 });
  }
});

/**
 * POST /api/sync/split-pace/player/:playerId
 * Run per-km split pace validation on ALL accepted activities of a player
 * Returns split data for each activity
 * Admin only
 */
syncRouter.post('/split-pace/player/:playerId', authorize('ADMIN'), async (req: Request, res: Response) => {
  try {
    const player = await prisma.player.findUnique({
      where: { id: req.params.playerId },
      include: {
        user: { select: { name: true, stravaAccessToken: true, stravaRefreshToken: true, tokenExpiresAt: true } },
        activities: {
          where: { status: 'ACCEPTED' },
          orderBy: { startDate: 'desc' },
          select: { id: true, stravaActivityId: true, distanceMeters: true, startDate: true, avgSpeed: true, movingTimeSeconds: true },
        },
      },
    });

    if (!player) return res.status(404).json({ error: 'Player not found' });
    if (!player.user.stravaAccessToken) return res.json({ error: 'No Strava token' });

    const { getValidAccessToken } = await import('../services/strava');
    const tokenResult = await getValidAccessToken(
      player.user.stravaAccessToken,
      player.user.stravaRefreshToken!,
      player.user.tokenExpiresAt || new Date(0)
    );
    if (!tokenResult) return res.json({ error: 'Token refresh failed' });

    const challenge = await prisma.challengeConfig.findFirst({ where: { isActive: true } });
    const minPace = challenge?.minPaceMinPerKm || 9;
    const maxPace = challenge?.maxPaceMinPerKm || 16;

    return res.json({
      player: player.user.name,
      playerId: player.id,
      accessToken: tokenResult.accessToken,
      activities: player.activities.map(a => ({
        id: a.id,
        stravaActivityId: a.stravaActivityId,
        date: a.startDate,
        distanceKm: (a.distanceMeters / 1000).toFixed(2),
        avgPace: a.avgSpeed > 0 ? ((1000 / a.avgSpeed) / 60).toFixed(1) : '?',
        movingMin: Math.round(a.movingTimeSeconds / 60),
      })),
      minPace,
      maxPace,
    });
  } catch (err: any) {
    console.error('Bulk split pace prep error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/sync/split-pace/:activityId/analyze
 * Fetch and return split data for a single activity (without flagging)
 * Returns the splits array for display
 * Admin only
 */
syncRouter.post('/split-pace/:activityId/analyze', authorize('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { accessToken } = req.body;
    const activity = await prisma.activity.findUnique({ where: { id: req.params.activityId } });
    if (!activity) return res.status(404).json({ error: 'Activity not found' });

    // Check if we already have split data stored
    if (activity.splitData && (activity.splitData as any[]).length > 0) {
      const splits = activity.splitData as { km: number; pace: number; status: string }[];
      const hasFailed = splits.some(s => s.status !== 'ok');
      return res.json({
        status: hasFailed ? 'flagged' : 'clean',
        splits,
        reason: hasFailed ? activity.flagReason || 'Split pace violation' : 'All splits OK',
        cached: true,
      });
    }

    // Fetch from Strava and store
    const { fetchAndValidateSplits } = await import('../services/validation');
    const challenge = await prisma.challengeConfig.findFirst({ where: { isActive: true } });
    const minPace = challenge?.minPaceMinPerKm || 9;
    const maxPace = challenge?.maxPaceMinPerKm || 16;

    const { splits, flagReason } = await fetchAndValidateSplits(activity.stravaActivityId, accessToken, minPace, maxPace);

    if (splits.length === 0) {
      return res.json({ status: 'no_data', reason: 'No stream data available', splits: [] });
    }

    // Store splits + flag if needed
    await prisma.activity.update({
      where: { id: activity.id },
      data: {
        splitData: splits,
        ...(flagReason && { flagReason }),
      },
    });

    return res.json({ status: flagReason ? 'flagged' : 'clean', splits, reason: flagReason || 'All splits OK', cached: false });
  } catch (err: any) {
    console.error('Split analyze error:', err);
    return res.json({ status: 'error', reason: err.message, splits: [] });
  }
});

/**
 * POST /api/sync/split-pace/:activityId
 * Run per-km split pace validation on a specific activity
 * Requires Strava API call to fetch streams
 * Admin only
 */
syncRouter.post('/split-pace/:activityId', authorize('ADMIN'), async (req: Request, res: Response) => {
  try {
    const activity = await prisma.activity.findUnique({
      where: { id: req.params.activityId },
      include: {
        player: {
          include: {
            user: { select: { stravaAccessToken: true, stravaRefreshToken: true, tokenExpiresAt: true } },
          },
        },
      },
    });

    if (!activity) return res.status(404).json({ error: 'Activity not found' });

    const user = activity.player.user;
    if (!user.stravaAccessToken) {
      return res.json({ status: 'error', reason: 'Player has no Strava token' });
    }

    // Refresh token if needed
    const { getValidAccessToken } = await import('../services/strava');
    const tokenResult = await getValidAccessToken(
      user.stravaAccessToken,
      user.stravaRefreshToken!,
      user.tokenExpiresAt || new Date(0)
    );

    if (!tokenResult) {
      return res.json({ status: 'error', reason: 'Token refresh failed' });
    }

    // Get challenge config for pace limits
    const challenge = await prisma.challengeConfig.findFirst({ where: { isActive: true } });
    const minPace = challenge?.minPaceMinPerKm || 9;
    const maxPace = challenge?.maxPaceMinPerKm || 16;

    // Run split pace validation
    const { validateSplitPace } = await import('../services/validation');
    const result = await validateSplitPace(activity.stravaActivityId, tokenResult.accessToken, minPace, maxPace);

    if (result) {
      // Flag the activity
      await prisma.activity.update({
        where: { id: activity.id },
        data: { flagReason: result },
      });
      return res.json({ status: 'flagged', reason: result });
    }

    return res.json({ status: 'clean', reason: 'All km splits within pace range' });
  } catch (err: any) {
    console.error('Split pace check error:', err);
    return res.status(500).json({ error: 'Split pace check failed', reason: err.message });
  }
});

/**
 * GET /api/sync/auto
 * Get auto-sync state (enabled, interval, next sync time)
 */
syncRouter.get('/auto', authorize('ADMIN'), async (_req: Request, res: Response) => {
  const { autoSync } = await import('../index');
  return res.json({
    enabled: autoSync.enabled,
    intervalHours: autoSync.intervalHours,
    nextSyncAt: autoSync.nextSyncAt?.toISOString() || null,
    lastAutoSyncAt: autoSync.lastAutoSyncAt?.toISOString() || null,
    running: autoSync.running,
    schedule: (autoSync as any).schedule || null,
  });
});

/**
 * POST /api/sync/auto
 * Update auto-sync config (enable/disable, set interval)
 */
syncRouter.post('/auto', authorize('ADMIN'), async (req: Request, res: Response) => {
  const { enabled, intervalHours, schedule } = req.body;
  const mod = await import('../index');
  const { autoSync } = mod;

  if (typeof enabled === 'boolean') autoSync.enabled = enabled;
  if (typeof intervalHours === 'number' && intervalHours >= 1) autoSync.intervalHours = intervalHours;
  if (schedule) (autoSync as any).schedule = schedule;

  if (autoSync.enabled) {
    if (autoSync.timer) clearTimeout(autoSync.timer);

    const sched = (autoSync as any).schedule || schedule;
    const nextTime = calculateNextSyncTime(sched, autoSync.intervalHours);
    autoSync.nextSyncAt = nextTime;

    const delayMs = nextTime.getTime() - Date.now();
    autoSync.timer = setTimeout(async () => {
      if (!autoSync.enabled || autoSync.running) return;
      autoSync.running = true;
      try {
        await syncAllPlayers();
        autoSync.lastAutoSyncAt = new Date();
      } catch (err: any) {
        console.error('[Auto-Sync] Failed:', err.message);
      }
      autoSync.running = false;
      // Reschedule next
      const s = (autoSync as any).schedule;
      autoSync.nextSyncAt = calculateNextSyncTime(s, autoSync.intervalHours);
      const nextDelay = autoSync.nextSyncAt.getTime() - Date.now();
      autoSync.timer = setTimeout(arguments.callee as any, nextDelay);
    }, delayMs);
  } else {
    if (autoSync.timer) clearTimeout(autoSync.timer);
    autoSync.timer = null;
    autoSync.nextSyncAt = null;
  }

  return res.json({
    enabled: autoSync.enabled,
    intervalHours: autoSync.intervalHours,
    nextSyncAt: autoSync.nextSyncAt?.toISOString() || null,
    schedule: (autoSync as any).schedule || null,
  });
});

/**
 * Calculate the next valid sync time based on schedule
 */
function calculateNextSyncTime(schedule: any, intervalHours: number): Date {
  const now = new Date();

  if (!schedule || schedule.frequency === 'hourly') {
    return new Date(now.getTime() + intervalHours * 60 * 60 * 1000);
  }

  const [targetH, targetM] = (schedule.syncTime || '06:00').split(':').map(Number);

  if (schedule.frequency === 'daily') {
    const next = new Date(now);
    next.setHours(targetH, targetM, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next;
  }

  if (schedule.frequency === 'alternate') {
    const next = new Date(now);
    next.setHours(targetH, targetM, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 2);
    else next.setDate(next.getDate() + 1); // next day at minimum for alternate
    return next;
  }

  if (schedule.frequency === 'weekly') {
    const days: number[] = schedule.days || [];
    if (days.length === 0) return new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Days are 0=Mon...6=Sun, JS getDay is 0=Sun...6=Sat
    // Convert: JS day to our format: (jsDay + 6) % 7
    for (let offset = 0; offset < 8; offset++) {
      const candidate = new Date(now);
      candidate.setDate(candidate.getDate() + offset);
      candidate.setHours(targetH, targetM, 0, 0);
      const ourDay = (candidate.getDay() + 6) % 7; // 0=Mon...6=Sun

      if (days.includes(ourDay) && candidate > now) {
        return candidate;
      }
    }
    // Fallback: next week
    return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  }

  return new Date(now.getTime() + intervalHours * 60 * 60 * 1000);
}

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
