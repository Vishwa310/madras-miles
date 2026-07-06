import { prisma } from '../utils/db';

interface FraudResult {
  activityId: string;
  reason: string;
}

/**
 * Tier 1 Fraud Detection — runs on DB data, no external API calls.
 * Scans recently accepted activities for a player and flags suspicious ones.
 */
export async function runFraudDetection(playerId: string, afterDate?: Date): Promise<FraudResult[]> {
  const where: any = {
    playerId,
    status: 'ACCEPTED',
  };
  if (afterDate) {
    where.syncedAt = { gte: afterDate };
  }

  const activities = await prisma.activity.findMany({
    where,
    orderBy: { startDate: 'asc' },
  });

  const flagged: FraudResult[] = [];

  for (const act of activities) {
    // Check 1: Pause trick — elapsed time >> moving time
    // If elapsed is more than 80% greater than moving time, suspicious
    if (act.movingTimeSeconds > 0 && act.elapsedTimeSeconds > 0) {
      const ratio = act.elapsedTimeSeconds / act.movingTimeSeconds;
      if (ratio > 1.8) {
        flagged.push({
          activityId: act.id,
          reason: `Suspicious pause: elapsed time ${Math.round(act.elapsedTimeSeconds / 60)}min vs moving time ${Math.round(act.movingTimeSeconds / 60)}min (ratio ${ratio.toFixed(1)}x)`,
        });
        continue; // One flag per activity
      }
    }

    // Check 2: Unrealistic max speed vs avg speed
    // If max speed is more than 2.5x the average, someone sprinted/used vehicle
    if (act.avgSpeed > 0 && act.maxSpeed > 0) {
      const speedRatio = act.maxSpeed / act.avgSpeed;
      if (speedRatio > 2.5) {
        flagged.push({
          activityId: act.id,
          reason: `Speed spike: max ${(act.maxSpeed * 3.6).toFixed(1)} km/h vs avg ${(act.avgSpeed * 3.6).toFixed(1)} km/h (${speedRatio.toFixed(1)}x difference)`,
        });
        continue;
      }
    }

    // Check 3: Overlapping activities — same player, overlapping time windows
    const actStart = act.startDate.getTime();
    const actEnd = actStart + act.elapsedTimeSeconds * 1000;

    const overlapping = activities.find(other =>
      other.id !== act.id &&
      other.startDate.getTime() < actEnd &&
      (other.startDate.getTime() + other.elapsedTimeSeconds * 1000) > actStart
    );

    if (overlapping) {
      flagged.push({
        activityId: act.id,
        reason: `Overlapping activity detected (conflicts with activity at ${overlapping.startDate.toISOString().split('T')[1].slice(0, 5)})`,
      });
      continue;
    }
  }

  // Apply flags to DB
  for (const flag of flagged) {
    await prisma.activity.update({
      where: { id: flag.activityId },
      data: {
        status: 'FLAGGED',
        rejectionReason: flag.reason,
      },
    });
  }

  return flagged;
}
