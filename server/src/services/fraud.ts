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
    // Check 0: File upload / edited activity detection
    const extId = ((act as any).externalId || '').toLowerCase();
    if (extId) {
      const suspiciousPatterns = ['fitfiletools', 'gotoes', 'dummy', '.gpx', '.tcx', 'edited', 'fake', 'test'];
      const matchedPattern = suspiciousPatterns.find(p => extId.includes(p));
      if (matchedPattern) {
        flagged.push({
          activityId: act.id,
          reason: `Suspicious file upload detected: "${matchedPattern}" found in source (${extId.slice(0, 40)})`,
        });
        continue;
      }
      // Also flag if device is "Strava GPX" (explicit GPX upload)
      const device = ((act as any).deviceName || '').toLowerCase();
      if (device.includes('gpx') || device.includes('tcx')) {
        flagged.push({
          activityId: act.id,
          reason: `Activity uploaded as ${(act as any).deviceName} file — not live recorded`,
        });
        continue;
      }
    }
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

    // Check 2: (Removed — GPS jumps cause too many false positives. Split pace check handles real cheating.)

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

  // Apply soft flags to DB — status stays ACCEPTED, flagReason set for admin
  for (const flag of flagged) {
    await prisma.activity.update({
      where: { id: flag.activityId },
      data: {
        flagReason: flag.reason,
      },
    });
  }

  return flagged;
}
