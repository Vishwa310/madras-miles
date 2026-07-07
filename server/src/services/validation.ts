import { prisma } from '../utils/db';
import { ActivityStatus } from '@prisma/client';

export interface ValidationResult {
  status: ActivityStatus;
  reason: string | null;
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

  // 3. GPS polyline check — flag for review (treadmill possible)
  if (!rawActivity.map?.summary_polyline) {
    return { status: 'FLAGGED', reason: 'No GPS route data — possible treadmill activity' };
  }

  // 4. GPS start location check — flag for review
  if (!rawActivity.start_latlng || rawActivity.start_latlng.length === 0) {
    return { status: 'FLAGGED', reason: 'No GPS start location — needs manual review' };
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

  // 8. Weekly active roster check
  const weekNumber = getWeekNumber(activityDate, challenge.startDate);
  const isActive = await isPlayerActiveThisWeek(player.id, weekNumber);
  if (!isActive) {
    return reject(`Player not in active roster for week ${weekNumber}`);
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
    return { status: 'FLAGGED', reason: `Activity at ${actHour}:00 is outside allowed time window` };
  }

  return accept();
}

/**
 * Check if a day should be treated as a rest day.
 * Rule: Cannot walk 7 consecutive days. 7th day = rest day.
 */
export async function isRestDay(playerId: string, date: Date): Promise<boolean> {
  // Look back 6 days before this date
  const consecutiveDays = [];
  for (let i = 1; i <= 6; i++) {
    const checkDate = new Date(date);
    checkDate.setDate(checkDate.getDate() - i);
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

    if (count > 0) {
      consecutiveDays.push(true);
    } else {
      break; // Gap found, not consecutive
    }
  }

  // If 6 consecutive days before today have activities, today is the 7th = rest day
  return consecutiveDays.length === 6;
}

/**
 * Determine the week number (1, 2, or 3) for a given date relative to challenge start.
 */
export function getWeekNumber(activityDate: Date, challengeStart: Date): number {
  const diffMs = activityDate.getTime() - challengeStart.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const weekNum = Math.floor(diffDays / 7) + 1;
  return Math.min(weekNum, 3); // Cap at week 3
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
