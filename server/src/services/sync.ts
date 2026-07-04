import { prisma } from '../utils/db';
import { fetchStravaActivities, getValidAccessToken } from './strava';
import { validateActivity } from './validation';
import { ActivityType } from '@prisma/client';

interface SyncResult {
  syncLogId: string;
  playersSynced: number;
  activitiesFound: number;
  accepted: number;
  rejected: number;
  flagged: number;
  errors: string[];
}

/**
 * Sync activities from Strava for all active players
 */
export async function syncAllPlayers(): Promise<SyncResult> {
  // Create sync log entry
  const syncLog = await prisma.syncLog.create({
    data: { status: 'running' },
  });

  const result: SyncResult = {
    syncLogId: syncLog.id,
    playersSynced: 0,
    activitiesFound: 0,
    accepted: 0,
    rejected: 0,
    flagged: 0,
    errors: [],
  };

  try {
    // Get active challenge config
    const challenge = await prisma.challengeConfig.findFirst({
      where: { isActive: true },
    });

    if (!challenge) {
      throw new Error('No active challenge configured');
    }

    // Get all active players with Strava tokens
    const players = await prisma.player.findMany({
      where: { status: 'ACTIVE' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            stravaAccessToken: true,
            stravaRefreshToken: true,
            tokenExpiresAt: true,
          },
        },
      },
    });

    for (const player of players) {
      try {
        await syncSinglePlayer(player, challenge, result);
        result.playersSynced++;
      } catch (err: any) {
        result.errors.push(`${player.user.name}: ${err.message}`);
      }
    }

    // Update sync log
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        playerssynced: result.playersSynced,
        activitiesFound: result.activitiesFound,
        accepted: result.accepted,
        rejected: result.rejected,
        flagged: result.flagged,
        error: result.errors.length > 0 ? result.errors.join('; ') : null,
      },
    });
  } catch (err: any) {
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: { status: 'failed', completedAt: new Date(), error: err.message },
    });
    result.errors.push(err.message);
  }

  return result;
}

/**
 * Sync a single player's activities
 */
async function syncSinglePlayer(
  player: any,
  challenge: any,
  result: SyncResult
): Promise<void> {
  const { user } = player;

  if (!user.stravaAccessToken || !user.stravaRefreshToken) {
    throw new Error('No Strava tokens — player has not authorized');
  }

  // Refresh token if needed
  const tokenResult = await getValidAccessToken(
    user.stravaAccessToken,
    user.stravaRefreshToken,
    user.tokenExpiresAt || new Date(0)
  );

  if (!tokenResult) {
    throw new Error('Failed to refresh Strava token');
  }

  // Update tokens in DB if refreshed
  if (tokenResult.accessToken !== user.stravaAccessToken) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        stravaAccessToken: tokenResult.accessToken,
        stravaRefreshToken: tokenResult.refreshToken,
        tokenExpiresAt: tokenResult.expiresAt,
      },
    });
  }

  // Fetch activities since challenge start (or last sync for efficiency)
  const lastSynced = await prisma.activity.findFirst({
    where: { playerId: player.id },
    orderBy: { startDate: 'desc' },
    select: { startDate: true },
  });

  // If we have synced before, only fetch activities after the last one (minus 1 day buffer)
  const afterDate = lastSynced
    ? new Date(lastSynced.startDate.getTime() - 86400000) // 1 day buffer
    : challenge.startDate;
  const afterTimestamp = Math.floor(afterDate.getTime() / 1000);

  // Fetch all pages
  let allActivities: any[] = [];
  let page = 1;
  while (true) {
    const batch = await fetchStravaActivities(tokenResult.accessToken, afterTimestamp, page, 50);
    if (!batch || batch.length === 0) break;
    // Pre-filter: only keep Walk and Hike types (skip Run, Ride, Swim, etc.)
    const relevant = batch.filter((a: any) => a.type === 'Walk' || a.type === 'Hike');
    allActivities = allActivities.concat(relevant);
    if (batch.length < 50) break; // last page
    page++;
    if (page > 10) break; // safety cap
  }

  for (const rawActivity of allActivities) {
    result.activitiesFound++;

    // Skip if already synced
    const existing = await prisma.activity.findUnique({
      where: { stravaActivityId: rawActivity.id.toString() },
    });

    if (existing) continue;

    // Map activity type
    const activityType = mapActivityType(rawActivity.type);

    // Validate the activity
    const validation = await validateActivity(rawActivity, player, challenge);

    // Calculate credited distance (after daily 7km cap)
    let creditedMeters: number | null = null;
    if (validation.status === 'ACCEPTED') {
      if (validation.cappedDistanceMeters !== undefined) {
        creditedMeters = validation.cappedDistanceMeters;
      } else {
        // Check how much of daily cap remains
        const actDate = new Date(rawActivity.start_date);
        const dayStart = new Date(actDate); dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(actDate); dayEnd.setHours(23, 59, 59, 999);

        const dailySoFar = await prisma.activity.aggregate({
          where: { playerId: player.id, startDate: { gte: dayStart, lte: dayEnd }, status: 'ACCEPTED' },
          _sum: { creditedMeters: true },
        });

        const usedMeters = dailySoFar._sum.creditedMeters || 0;
        const maxDaily = (challenge.maxDailyKm || 7) * 1000;
        const remaining = Math.max(0, maxDaily - usedMeters);
        const actDistance = rawActivity.distance || 0;
        creditedMeters = Math.min(actDistance, remaining);
      }
    } else {
      creditedMeters = 0; // Rejected/flagged = 0 credited
    }

    // Store in DB
    await prisma.activity.create({
      data: {
        stravaActivityId: rawActivity.id.toString(),
        playerId: player.id,
        type: activityType || 'WALK',
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

    // Count results
    if (validation.status === 'ACCEPTED') result.accepted++;
    else if (validation.status === 'REJECTED') result.rejected++;
    else if (validation.status === 'FLAGGED') result.flagged++;
  }
}

/**
 * Map Strava activity type string to our enum
 */
function mapActivityType(stravaType: string): ActivityType | null {
  const mapping: Record<string, ActivityType> = {
    Walk: 'WALK',
    Hike: 'HIKE',
    Run: 'RUN',
  };
  return mapping[stravaType] || null;
}
