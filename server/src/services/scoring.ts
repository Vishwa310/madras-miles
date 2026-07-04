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
export async function computePlayerRankings(teamId?: string): Promise<PlayerRanking[]> {
  const where: any = {};
  if (teamId) where.teamId = teamId;

  const players = await prisma.player.findMany({
    where,
    include: {
      user: { select: { name: true, avatarUrl: true } },
      team: { select: { id: true, name: true, emblem: true } },
      activities: {
        where: { status: 'ACCEPTED' },
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
      where: { playerId: player.id, status: 'REJECTED' },
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

  // Assign ranks
  rankings.forEach((r, i) => { r.rank = i + 1; });

  return rankings;
}

/**
 * Compute team rankings (aggregate of player rankings)
 */
export async function computeTeamRankings(): Promise<TeamRanking[]> {
  const playerRankings = await computePlayerRankings();

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

  // Sort by same tiebreaker logic
  teamRankings.sort((a, b) => {
    if (b.totalKm !== a.totalKm) return b.totalKm - a.totalKm;
    if (b.totalActivities !== a.totalActivities) return b.totalActivities - a.totalActivities;
    if (a.substitutionCount !== b.substitutionCount) return a.substitutionCount - b.substitutionCount;
    return a.rejectedCount - b.rejectedCount;
  });

  teamRankings.forEach((r, i) => { r.rank = i + 1; });

  return teamRankings;
}
