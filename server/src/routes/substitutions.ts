import { Router, Request, Response } from 'express';
import { prisma } from '../utils/db';
import { authenticate, authorize } from '../middleware/auth';
import { logAudit } from '../utils/audit';

export const substitutionsRouter = Router();

substitutionsRouter.use(authenticate);
substitutionsRouter.use(authorize('ADMIN'));

/**
 * POST /api/substitutions
 * Execute a substitution: retire a player and activate a sub
 * Males: permanent retirement
 * Females: can be brought back later
 */
substitutionsRouter.post('/', async (req: Request, res: Response) => {
  const { retiredPlayerId, substitutePlayerId, notes } = req.body;

  if (!retiredPlayerId || !substitutePlayerId) {
    return res.status(400).json({ error: 'Required: retiredPlayerId, substitutePlayerId' });
  }

  try {
    const retired = await prisma.player.findUnique({ where: { id: retiredPlayerId } });
    const sub = await prisma.player.findUnique({ where: { id: substitutePlayerId } });

    if (!retired) return res.status(404).json({ error: 'Retired player not found' });
    if (!sub) return res.status(404).json({ error: 'Substitute player not found' });
    if (retired.status === 'RETIRED') return res.status(400).json({ error: 'Player is already retired' });
    if (retired.teamId !== sub.teamId) return res.status(400).json({ error: 'Players must be on the same team' });
    if (sub.status === 'ACTIVE') return res.status(400).json({ error: 'Replacement player is already active' });

    // Max 5 substitutions per team
    const teamSubCount = await prisma.substitutionLog.count({ where: { teamId: retired.teamId } });
    if (teamSubCount >= 5) {
      return res.status(400).json({ error: 'Team has reached maximum 5 substitutions' });
    }

    if (sub.status === 'RETIRED') {
      // Check if the sub is female (females can return)
      if (sub.gender === 'MALE') {
        return res.status(400).json({ error: 'Retired male players cannot come back' });
      }
      // Female can return only once — check if she has already been reactivated before
      const previousReturns = await prisma.substitutionLog.count({
        where: { substitutePlayerId: sub.id },
      });
      if (previousReturns >= 1) {
        return res.status(400).json({ error: 'Female player has already returned once — cannot return again' });
      }
    }

    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      // Retire the player
      await tx.player.update({
        where: { id: retiredPlayerId },
        data: { status: 'RETIRED', substitutedById: substitutePlayerId, substitutedAt: now },
      });

      // Activate the substitute (reactivate if female returning)
      await tx.player.update({
        where: { id: substitutePlayerId },
        data: { slot: 'MAIN', status: 'ACTIVE' },
      });

      // Log it
      const log = await tx.substitutionLog.create({
        data: {
          teamId: retired.teamId,
          retiredPlayerId,
          substitutePlayerId,
          effectiveFrom: now,
          performedById: req.user!.userId,
          notes: notes || null,
        },
        include: {
          retiredPlayer: { include: { user: { select: { name: true } } } },
          substitutePlayer: { include: { user: { select: { name: true } } } },
        },
      });

      return log;
    });

    // Audit logging
    await logAudit(retired.teamId, 'retired', result.retiredPlayer.user.name, `Retired (replaced by ${result.substitutePlayer.user.name})`, req.user!.userId);
    await logAudit(retired.teamId, 'substitution', result.substitutePlayer.user.name, `Activated (replacing ${result.retiredPlayer.user.name})`, req.user!.userId);

    return res.status(201).json({ substitution: result });
  } catch (err) {
    console.error('Error executing substitution:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/substitutions/reactivate
 * Reactivate a retired FEMALE player (bring her back)
 * Males cannot be reactivated.
 */
substitutionsRouter.post('/reactivate', async (req: Request, res: Response) => {
  const { playerId } = req.body;

  if (!playerId) {
    return res.status(400).json({ error: 'Required: playerId' });
  }

  try {
    const player = await prisma.player.findUnique({ where: { id: playerId } });

    if (!player) return res.status(404).json({ error: 'Player not found' });
    if (player.status !== 'RETIRED') return res.status(400).json({ error: 'Player is not retired' });
    if (player.gender === 'MALE') return res.status(400).json({ error: 'Male players cannot be reactivated — retirement is permanent' });

    await prisma.player.update({
      where: { id: playerId },
      data: { status: 'ACTIVE', slot: 'MAIN', substitutedById: null, substitutedAt: null },
    });

    return res.json({ message: 'Female player reactivated successfully' });
  } catch (err) {
    console.error('Error reactivating player:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/substitutions
 * List substitution history (optionally filter by team)
 */
substitutionsRouter.get('/', async (req: Request, res: Response) => {
  const { teamId } = req.query;

  try {
    const logs = await prisma.substitutionLog.findMany({
      where: teamId ? { teamId: teamId as string } : undefined,
      include: {
        team: { select: { id: true, name: true } },
        retiredPlayer: { include: { user: { select: { name: true } }, } },
        substitutePlayer: { include: { user: { select: { name: true } } } },
        performedBy: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ substitutions: logs });
  } catch (err) {
    console.error('Error listing substitutions:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
