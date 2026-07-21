import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { computePlayerRankings, computeTeamRankings } from '../services/scoring';

export const scoresRouter = Router();

scoresRouter.use(authenticate);

/**
 * GET /api/scores/leaderboard
 * Team leaderboard — ranked by total KM with tiebreakers
 */
scoresRouter.get('/leaderboard', async (req: Request, res: Response) => {
  try {
    const asOf = req.query.asOf ? new Date(req.query.asOf as string) : undefined;
    const leaderboard = await computeTeamRankings(asOf);
    return res.json({ leaderboard });
  } catch (err) {
    console.error('Error getting leaderboard:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/scores/players
 * Individual player rankings
 * Optional: ?teamId=xxx to filter by team
 */
scoresRouter.get('/players', async (req: Request, res: Response) => {
  const { teamId, asOf } = req.query;
  try {
    const asOfDate = asOf ? new Date(asOf as string) : undefined;
    const rankings = await computePlayerRankings(teamId as string | undefined, asOfDate);
    return res.json({ rankings });
  } catch (err) {
    console.error('Error getting player rankings:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/scores/player/:playerId
 * Get detailed stats for a specific player
 */
scoresRouter.get('/player/:playerId', async (req: Request, res: Response) => {
  try {
    const rankings = await computePlayerRankings();
    const player = rankings.find(r => r.playerId === req.params.playerId);

    if (!player) {
      return res.json({ totalKm: 0, totalActivities: 0, rank: 0 });
    }

    return res.json(player);
  } catch (err) {
    console.error('Error getting player scores:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
