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
  const { retiredPlayerId, substitutePlayerId, notes, effectiveDate } = req.body;

  if (!retiredPlayerId || !substitutePlayerId) {
    return res.status(400).json({ error: 'Required: retiredPlayerId, substitutePlayerId' });
  }

  try {
    const retired = await prisma.player.findUnique({ where: { id: retiredPlayerId } });
    const sub = await prisma.player.findUnique({ where: { id: substitutePlayerId } });

    if (!retired) return res.status(404).json({ error: 'Player to sub out not found' });
    if (!sub) return res.status(404).json({ error: 'Replacement player not found' });
    if (retired.status !== 'ACTIVE') return res.status(400).json({ error: 'Player is not currently active' });
    if (retired.teamId !== sub.teamId) return res.status(400).json({ error: 'Players must be on the same team' });
    if (sub.status === 'ACTIVE') return res.status(400).json({ error: 'Replacement player is already active' });

    // Check credits
    const challenge = await prisma.challengeConfig.findFirst({ where: { isActive: true } });
    const maxCredits = (challenge as any)?.subCreditsPerTeam ?? 8;
    const usedCredits = await prisma.substitutionLog.count({ where: { teamId: retired.teamId } });

    if (usedCredits >= maxCredits) {
      return res.status(400).json({ error: `Team has used all ${maxCredits} substitution credits (${usedCredits}/${maxCredits} used)` });
    }

    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    const effectiveFrom = effectiveDate ? new Date(new Date(effectiveDate).getTime() - IST_OFFSET_MS) : new Date();

    const result = await prisma.$transaction(async (tx) => {
      // Sub out: set to STANDBY (not RETIRED — they can come back)
      await tx.player.update({
        where: { id: retiredPlayerId },
        data: { status: 'STANDBY', substitutedAt: effectiveFrom },
      });

      // Sub in: activate
      await tx.player.update({
        where: { id: substitutePlayerId },
        data: { status: 'ACTIVE' },
      });

      // Log it (1 credit used)
      const log = await tx.substitutionLog.create({
        data: {
          teamId: retired.teamId,
          retiredPlayerId,
          substitutePlayerId,
          effectiveFrom,
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
    await logAudit(retired.teamId, 'substitution', result.retiredPlayer.user.name,
    const effectiveDateIST = new Date(effectiveFrom.getTime() + 5.5 * 60 * 60 * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    await logAudit(retired.teamId, 'substitution', result.retiredPlayer.user.name,
      `Subbed out → ${result.substitutePlayer.user.name} | Effective: ${effectiveDateIST} (credit ${usedCredits + 1}/${maxCredits})`, req.user!.userId);
    await logAudit(retired.teamId, 'substitution', result.substitutePlayer.user.name,
      `Subbed in (replacing ${result.retiredPlayer.user.name}) | Effective: ${effectiveDateIST}`, req.user!.userId);

    return res.status(201).json({
      substitution: result,
      creditsUsed: usedCredits + 1,
      creditsRemaining: maxCredits - usedCredits - 1,
    });
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
