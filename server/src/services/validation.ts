import { prisma } from '../utils/db';
import { ActivityStatus } from '@prisma/client';

export interface ValidationResult {
  status: ActivityStatus;
  reason: string | null;
  flagReason?: string | null; // Soft flag — activity is ACCEPTED but flagged for admin review
  cappedDistanceMeters?: number; // If daily cap applies, this is the credited distance
}

/**
 * Validate a single Strava activity against official event rules.
 * Returns ACCEPTED, REJECTED, or FLAGGED with reason.
 */
export async function validateActivity(
  rawActivity: any,
  player: any,
  challenge: any
): Promise<ValidationResult> {
  // 1. Manual entry check
  if (rawActivity.manual) {
    return reject('Manual entry — no GPS recording');
  }

  // 2. Activity type: ONLY Walk allowed
  if (rawActivity.type !== 'Walk') {
    return reject(`Only Walk activities allowed (got '${rawActivity.type}')`);
  }

  // 3. GPS polyline check — soft flag for review (treadmill possible)
  let flagReason: string | null = null;
  if (!rawActivity.map?.summary_polyline) {
    flagReason = 'No GPS route data — possible treadmill activity';
  }

  // 4. GPS start location check — soft flag for review
  if (!flagReason && (!rawActivity.start_latlng || rawActivity.start_latlng.length === 0)) {
    flagReason = 'No GPS start location — needs manual review';
  }

  // 5. Challenge date window check
  const activityDate = new Date(rawActivity.start_date);
  if (activityDate < challenge.startDate || activityDate > challenge.endDate) {
    return reject('Activity outside challenge window');
  }

  // 6. Minimum distance: 1 km
  const distanceMeters = rawActivity.distance || 0;
  if (distanceMeters < 1000) {
    return reject(`Activity must be minimum 1 km (got ${(distanceMeters / 1000).toFixed(2)} km)`);
  }

  // 7. Pace check: 9 to 16 minutes per km (= 3.75 to 6.67 km/h)
  // Strava gives average_speed in m/s
  const avgSpeedMs = rawActivity.average_speed || 0;
  if (avgSpeedMs > 0) {
    const paceMinPerKm = (1000 / avgSpeedMs) / 60; // convert m/s to min/km
    const minPace = challenge.minPaceMinPerKm || 9;
    const maxPace = challenge.maxPaceMinPerKm || 16;

    if (paceMinPerKm < minPace) {
      return reject(`Pace ${paceMinPerKm.toFixed(1)} min/km is too fast (minimum ${minPace} min/km)`);
    }
    if (paceMinPerKm > maxPace) {
      return reject(`Pace ${paceMinPerKm.toFixed(1)} min/km is too slow (maximum ${maxPace} min/km)`);
    }
  }

  // 8. Player active period check — was player active ON THIS DATE?
  const wasActive = await wasPlayerActiveOnDate(player.id, activityDate);
  if (!wasActive) {
    return reject('Activity by an inactive player — not in active roster on this date');
  }

  // 9. Rest day check — cannot walk 7 consecutive days
  const restDay = await isRestDay(player.id, activityDate);
  if (restDay) {
    return reject('Rest day — walked 6 consecutive days, 7th day must be rest');
  }

  // 10. Daily cap check (7 km) — don't reject, but cap
  const dayStart = new Date(activityDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(activityDate);
  dayEnd.setHours(23, 59, 59, 999);

  const dailyDistanceResult = await prisma.activity.aggregate({
    where: {
      playerId: player.id,
      startDate: { gte: dayStart, lte: dayEnd },
      status: 'ACCEPTED',
    },
    _sum: { distanceMeters: true },
  });

  const dailyKmSoFar = (dailyDistanceResult._sum.distanceMeters || 0) / 1000;
  const maxDailyKm = challenge.maxDailyKm || 7;

  if (dailyKmSoFar >= maxDailyKm * 1000) {
    // Already at cap — still accept but with 0 credited distance
    return { status: 'ACCEPTED', reason: 'Daily cap reached — 0 km credited', cappedDistanceMeters: 0 };
  }

  const remainingMeters = (maxDailyKm * 1000) - (dailyDistanceResult._sum.distanceMeters || 0);
  if (distanceMeters > remainingMeters) {
    // Partial credit
    return { status: 'ACCEPTED', reason: `Capped to ${(remainingMeters / 1000).toFixed(2)} km (daily limit)`, cappedDistanceMeters: remainingMeters };
  }

  // 10. Duplicate check
  const existing = await prisma.activity.findUnique({
    where: { stravaActivityId: rawActivity.id.toString() },
  });
  if (existing) {
    return reject('Duplicate activity — already synced');
  }

  // 11. Time window check — flag (not reject) if outside allowed hours
  // Weekdays: 4AM-9AM or 5PM-10PM | Weekends/holidays: 4AM-10PM
  const actHour = activityDate.getHours();
  const dayOfWeek = activityDate.getDay(); // 0=Sun, 6=Sat
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  let outsideWindow = false;
  if (isWeekend) {
    // Weekends: 4AM to 10PM
    outsideWindow = actHour < 4 || actHour >= 22;
  } else {
    // Weekdays: 4AM-9AM or 5PM-10PM
    const inMorning = actHour >= 4 && actHour < 9;
    const inEvening = actHour >= 17 && actHour < 22;
    outsideWindow = !(inMorning || inEvening);
  }

  if (outsideWindow) {
    flagReason = flagReason || `Activity at ${actHour}:00 is outside allowed time window`;
  }

  return { status: 'ACCEPTED', reason: null, flagReason };
}

/**
 * Check if a day should be treated as a rest day.
 * Rule: 1 mandatory rest day per calendar week.
 * Week blocks are defined by challenge start date (7-day blocks, last week may be shorter).
 * If a player has already walked every other day in the week, this day must be rest.
 */
export async function isRestDay(playerId: string, date: Date): Promise<boolean> {
  // Get challenge config to determine week boundaries
  const challenge = await prisma.challengeConfig.findFirst({ where: { isActive: true } });
  if (!challenge) return false;

  const challengeStart = new Date(challenge.startDate);
  challengeStart.setHours(0, 0, 0, 0);
  const challengeEnd = new Date(challenge.endDate);
  challengeEnd.setHours(23, 59, 59, 999);

  // Determine which week this date falls in
  const daysSinceStart = Math.floor((date.getTime() - challengeStart.getTime()) / (1000 * 60 * 60 * 24));
  const weekIndex = Math.floor(daysSinceStart / 7);

  // Calculate this week's start and end
  const weekStart = new Date(challengeStart);
  weekStart.setDate(weekStart.getDate() + weekIndex * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  // Cap week end at challenge end
  const effectiveWeekEnd = weekEnd > challengeEnd ? challengeEnd : weekEnd;

  // Count total days in this week
  const totalDaysInWeek = Math.floor((effectiveWeekEnd.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const maxWalkDays = totalDaysInWeek - 1; // must rest 1 day

  // Count how many days this player has already walked THIS week (excluding today)
  const dateStr = date.toISOString().split('T')[0];
  const daysWalkedThisWeek: Set<string> = new Set();

  for (let i = 0; i < totalDaysInWeek; i++) {
    const checkDate = new Date(weekStart);
    checkDate.setDate(checkDate.getDate() + i);
    const checkStr = checkDate.toISOString().split('T')[0];
    if (checkStr === dateStr) continue; // skip today

    const dayStart = new Date(checkDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(checkDate);
    dayEnd.setHours(23, 59, 59, 999);

    const count = await prisma.activity.count({
      where: {
        playerId,
        startDate: { gte: dayStart, lte: dayEnd },
        status: 'ACCEPTED',
      },
    });

    if (count > 0) daysWalkedThisWeek.add(checkStr);
  }

  // If player already used all their walking days, today must be rest
  return daysWalkedThisWeek.size >= maxWalkDays;
}

/**
 * Determine the week number (1, 2, or 3) for a given date relative to challenge start.
 */
/**
 * Determine if a player was active on a specific date.
 * Logic: Check substitution log to build active/inactive timeline.
 * - Player starts as their initial status (ACTIVE or STANDBY from assignment)
 * - Each sub log entry where they're the retiredPlayer = they became inactive
 * - Each sub log entry where they're the substitutePlayer = they became active
 */
export async function wasPlayerActiveOnDate(playerId: string, date: Date): Promise<boolean> {
  const subEvents = await prisma.substitutionLog.findMany({
    where: {
      OR: [
        { retiredPlayerId: playerId },
        { substitutePlayerId: playerId },
      ],
    },
    orderBy: { effectiveFrom: 'asc' },
  });

  // No sub events — check initial assigned status
  if (subEvents.length === 0) {
    const player = await prisma.player.findUnique({ where: { id: playerId }, select: { status: true } });
    return player?.status === 'ACTIVE';
  }

  // Determine initial state before first sub event
  let isActive: boolean;
  const firstEvent = subEvents[0];
  if (firstEvent.retiredPlayerId === playerId) {
    isActive = true; // Was active before being subbed out
  } else {
    isActive = false; // Was standby before being subbed in
  }

  // Walk through events up to the target date
  for (const event of subEvents) {
    if (event.effectiveFrom > date) break;

    if (event.retiredPlayerId === playerId) {
      isActive = false; // Subbed out
    } else if (event.substitutePlayerId === playerId) {
      isActive = true; // Subbed in
    }
  }

  return isActive;
}

export function getWeekNumber(activityDate: Date, challengeStart: Date): number {
  const diffMs = activityDate.getTime() - challengeStart.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const weekNum = Math.floor(diffDays / 7) + 1;
  return Math.min(weekNum, 4); // Cap at week 4
}

/**
 * Check if a player is in the active roster for a given week.
 * If no weekly roster is configured, assume all players are active.
 */
async function isPlayerActiveThisWeek(playerId: string, weekNumber: number): Promise<boolean> {
  // Check if weekly_roster table has entries for this week
  // If not configured yet, allow all players (graceful fallback)
  try {
    const roster = await (prisma as any).weeklyRoster?.findFirst({
      where: { playerId, weekNumber },
    });

    // If the table doesn't exist or no roster configured, assume active
    if (roster === undefined || roster === null) {
      // Check if ANY roster entries exist for this week
      const anyRoster = await (prisma as any).weeklyRoster?.count({
        where: { weekNumber },
      });
      // If no roster configured at all, everyone is active (fallback)
      if (!anyRoster || anyRoster === 0) return true;
      // Roster exists but this player isn't in it
      return false;
    }

    return roster.isActive === true;
  } catch {
    // Table doesn't exist yet — allow all
    return true;
  }
}

function accept(): ValidationResult {
  return { status: 'ACCEPTED', reason: null };
}

function reject(reason: string): ValidationResult {
  return { status: 'REJECTED', reason };
}

/**
 * Validate per-km split pace using Strava streams.
 * Each 1 km split must be within 9-16 min/km pace.
 * Returns null if valid, or a rejection reason string.
 *
 * Call this AFTER basic validation passes, as it requires an API call.
 */
export async function validateSplitPace(
  stravaActivityId: string,
  accessToken: string,
  minPace: number = 9,
  maxPace: number = 16
): Promise<string | null> {
  try {
    const response = await fetch(
      `https://www.strava.com/api/v3/activities/${stravaActivityId}/streams?keys=distance,time&key_by_type=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!response.ok) {
      // If we can't fetch streams, flag for manual review instead of rejecting
      return null;
    }

    const streams = await response.json();
    const distanceData = streams.distance?.data;
    const timeData = streams.time?.data;

    if (!distanceData || !timeData || distanceData.length === 0) {
      return null; // No stream data — can't validate splits, allow through
    }

    // Calculate pace for each km split
    let lastKmDistance = 0;
    let lastKmTime = 0;
    let kmCount = 0;

    for (let i = 0; i < distanceData.length; i++) {
      const currentDistance = distanceData[i];
      const currentTime = timeData[i];

      // Check if we've crossed another km boundary
      if (currentDistance - lastKmDistance >= 1000) {
        kmCount++;
        const splitDistanceM = currentDistance - lastKmDistance;
        const splitTimeS = currentTime - lastKmTime;

        // Calculate pace in min/km for this split
        const paceMinPerKm = (splitTimeS / 60) / (splitDistanceM / 1000);

        if (paceMinPerKm < minPace) {
          return `Km split ${kmCount} pace ${paceMinPerKm.toFixed(1)} min/km is too fast (min ${minPace})`;
        }
        if (paceMinPerKm > maxPace) {
          return `Km split ${kmCount} pace ${paceMinPerKm.toFixed(1)} min/km is too slow (max ${maxPace})`;
        }

        lastKmDistance = currentDistance;
        lastKmTime = currentTime;
      }
    }

    return null; // All splits valid
  } catch (err) {
    console.error('Error validating split pace:', err);
    return null; // On error, don't block — allow through
  }
}

/**
 * Fetch split pace data and validate — returns both the splits array and any flag reason.
 * Uses Strava's splits_metric from activity detail for accuracy matching Strava UI.
 * Falls back to stream calculation if splits_metric unavailable.
 */
export async function fetchAndValidateSplits(
  stravaActivityId: string,
  accessToken: string,
  minPace: number = 9,
  maxPace: number = 16
): Promise<{ splits: { km: number; pace: number; status: string }[]; flagReason: string | null }> {
  try {
    // Try activity detail first (has splits_metric)
    const detailRes = await fetch(
      `https://www.strava.com/api/v3/activities/${stravaActivityId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (detailRes.ok) {
      const detail = await detailRes.json() as any;
      const splitsMetric = detail.splits_metric;

      if (splitsMetric && splitsMetric.length > 0) {
        const splits: { km: number; pace: number; status: string }[] = [];
        let flagReason: string | null = null;

        for (const s of splitsMetric) {
          const dist = s.distance || 0;
          const movingTime = s.moving_time || 0;
          if (dist < 500) continue; // Skip very short partial splits

          const pace = parseFloat(((movingTime / 60) / (dist / 1000)).toFixed(1));
          let status = 'ok';
          if (pace < minPace) { status = 'fast'; if (!flagReason) flagReason = `Km ${s.split}: ${pace} min/km (too fast)`; }
          else if (pace > maxPace) { status = 'slow'; if (!flagReason) flagReason = `Km ${s.split}: ${pace} min/km (too slow)`; }

          splits.push({ km: s.split, pace, status });
        }

        return { splits, flagReason };
      }
    }

    // Fallback: calculate from streams
    const response = await fetch(
      `https://www.strava.com/api/v3/activities/${stravaActivityId}/streams?keys=distance,time&key_by_type=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!response.ok) return { splits: [], flagReason: null };

    const streams = await response.json() as any;
    const distanceData = streams.distance?.data;
    const timeData = streams.time?.data;

    if (!distanceData || !timeData || distanceData.length === 0) {
      return { splits: [], flagReason: null };
    }

    const splits: { km: number; pace: number; status: string }[] = [];
    let lastKmDistance = 0;
    let lastKmTime = 0;
    let kmCount = 0;
    let flagReason: string | null = null;

    for (let i = 1; i < distanceData.length; i++) {
      if (distanceData[i] - lastKmDistance >= 1000) {
        kmCount++;
        // Interpolate for exact 1km boundary
        const dPrev = distanceData[i-1], dCurr = distanceData[i];
        const tPrev = timeData[i-1], tCurr = timeData[i];
        const ratio = (lastKmDistance + 1000 - dPrev) / (dCurr - dPrev);
        const exactTime = tPrev + ratio * (tCurr - tPrev);

        const splitTime = exactTime - lastKmTime;
        const pace = parseFloat((splitTime / 60).toFixed(1)); // exactly 1km

        let status = 'ok';
        if (pace < minPace) { status = 'fast'; if (!flagReason) flagReason = `Km ${kmCount}: ${pace} min/km (too fast)`; }
        else if (pace > maxPace) { status = 'slow'; if (!flagReason) flagReason = `Km ${kmCount}: ${pace} min/km (too slow)`; }

        splits.push({ km: kmCount, pace, status });
        lastKmTime = exactTime;
        lastKmDistance += 1000;
      }
    }

    return { splits, flagReason };
  } catch (err) {
    console.error('Error fetching splits:', err);
    return { splits: [], flagReason: null };
  }
}
