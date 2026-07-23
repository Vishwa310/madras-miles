import { prisma } from '../utils/db';

export interface PlayerRanking {
  playerId: string;
  playerName: string;
  avatarUrl: string | null;
  teamId: string;
  teamName: string;
  teamEmblem: string;
  totalKm: number;
  totalActivities: number;
  substitutionCount: number;
  rejectedCount: number;
  rank: number;
}

export interface TeamRanking {
  teamId: string;
  teamName: string;
  teamEmblem: string;
  totalKm: number;
  totalActivities: number;
  substitutionCount: number;
  rejectedCount: number;
  rank: number;
}

/**
 * Compute player rankings based on:
 * 1. Total valid KM (capped at 7/day)
 * 2. Number of accepted activities (tiebreaker)
 * 3. Fewer substitutions (tiebreaker)
 * 4. Fewer rejections (tiebreaker)
 */
export async function computePlayerRankings(teamId?: string, asOfDate?: Date): Promise<PlayerRanking[]> {
  const where: any = {};
  if (teamId) where.teamId = teamId;

  // Get challenge date range
  const challenge = await prisma.challengeConfig.findFirst({ where: { isActive: true } });
  const IST_OFFSET = 5.5 * 60 * 60 * 1000;
  const startFilter = challenge ? new Date(challenge.startDate.getTime() - IST_OFFSET) : undefined;
  const endFilter = asOfDate
    ? new Date(asOfDate.getTime() + 24 * 60 * 60 * 1000 - IST_OFFSET) // end of selected day in IST (next day 00:00 IST in UTC)
    : challenge ? new Date(challenge.endDate.getTime() + IST_OFFSET) : undefined;
  const dateFilter = startFilter ? { gte: startFilter, ...(endFilter && { lte: endFilter }) } : undefined;

  const players = await prisma.player.findMany({
    where,
    include: {
      user: { select: { name: true, avatarUrl: true } },
      team: { select: { id: true, name: true, emblem: true } },
      activities: {
        where: { status: 'ACCEPTED', ...(dateFilter && { startDate: dateFilter }) },
        select: { distanceMeters: true, creditedMeters: true, startDate: true },
      },
      retiredIn: { select: { id: true } },
    },
  });

  const rankings: PlayerRanking[] = [];

  for (const player of players) {
    // Calculate total credited distance (already capped at storage time)
    let totalMeters = 0;

    for (const act of player.activities) {
      totalMeters += act.creditedMeters || 0;
    }

    // Count rejected activities
    const rejectedCount = await prisma.activity.count({
      where: { playerId: player.id, status: 'REJECTED', ...(dateFilter && { startDate: dateFilter }) },
    });

    rankings.push({
      playerId: player.id,
      playerName: player.user.name,
      avatarUrl: player.user.avatarUrl,
      teamId: player.team.id,
      teamName: player.team.name,
      teamEmblem: player.team.emblem || '',
      totalKm: totalMeters / 1000,
      totalActivities: player.activities.length,
      substitutionCount: player.retiredIn.length,
      rejectedCount,
      rank: 0,
    });
  }

  // Sort by tiebreaker logic
  rankings.sort((a, b) => {
    // 1. Total KM (desc)
    if (b.totalKm !== a.totalKm) return b.totalKm - a.totalKm;
    // 2. Activity count (desc)
    if (b.totalActivities !== a.totalActivities) return b.totalActivities - a.totalActivities;
    // 3. Fewer substitutions (asc)
    if (a.substitutionCount !== b.substitutionCount) return a.substitutionCount - b.substitutionCount;
    // 4. Fewer rejections (asc)
    return a.rejectedCount - b.rejectedCount;
  });

  // Assign ranks (tied players get same rank)
  for (let i = 0; i < rankings.length; i++) {
    if (i === 0) {
      rankings[i].rank = 1;
    } else {
      const prev = rankings[i - 1];
      const curr = rankings[i];
      // Same rank if all tiebreaker values are equal
      if (curr.totalKm === prev.totalKm && curr.totalActivities === prev.totalActivities &&
          curr.substitutionCount === prev.substitutionCount && curr.rejectedCount === prev.rejectedCount) {
        curr.rank = prev.rank;
      } else {
        curr.rank = i + 1;
      }
    }
  }

  return rankings;
}

/**
 * Compute team rankings (aggregate of player rankings)
 */
export async function computeTeamRankings(asOfDate?: Date): Promise<TeamRanking[]> {
  const playerRankings = await computePlayerRankings(undefined, asOfDate);

  // Aggregate by team
  const teamMap = new Map<string, TeamRanking>();

  for (const pr of playerRankings) {
    const existing = teamMap.get(pr.teamId);
    if (existing) {
      existing.totalKm += pr.totalKm;
      existing.totalActivities += pr.totalActivities;
      existing.substitutionCount += pr.substitutionCount;
      existing.rejectedCount += pr.rejectedCount;
    } else {
      teamMap.set(pr.teamId, {
        teamId: pr.teamId,
        teamName: pr.teamName,
        teamEmblem: pr.teamEmblem,
        totalKm: pr.totalKm,
        totalActivities: pr.totalActivities,
        substitutionCount: pr.substitutionCount,
        rejectedCount: pr.rejectedCount,
        rank: 0,
      });
    }
  }

  const teamRankings = Array.from(teamMap.values());

  // Sort: 1. Total KM (desc), 2. Fewer activities wins (asc), 3. Fewer sub credits used (asc), 4. Alphabetical
  teamRankings.sort((a, b) => {
    if (b.totalKm !== a.totalKm) return b.totalKm - a.totalKm;
    if (a.totalActivities !== b.totalActivities) return a.totalActivities - b.totalActivities;
    if (a.substitutionCount !== b.substitutionCount) return a.substitutionCount - b.substitutionCount;
    return a.teamName.localeCompare(b.teamName);
  });

  // Assign ranks (tied teams get same rank)
  for (let i = 0; i < teamRankings.length; i++) {
    if (i === 0) {
      teamRankings[i].rank = 1;
    } else {
      const prev = teamRankings[i - 1];
      const curr = teamRankings[i];
      // Same rank if all tiebreaker values are equal
      if (curr.totalKm === prev.totalKm && curr.totalActivities === prev.totalActivities &&
          curr.substitutionCount === prev.substitutionCount) {
        curr.rank = prev.rank;
      } else {
        curr.rank = i + 1;
      }
    }
  }

  return teamRankings;
}
