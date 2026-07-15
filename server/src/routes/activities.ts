import { Router, Request, Response } from 'express';
import { prisma } from '../utils/db';
import { authenticate, authorize } from '../middleware/auth';

export const activitiesRouter = Router();

activitiesRouter.use(authenticate);

/**
 * GET /api/activities
 * List activities with role-based filtering
 * Admin: sees all. Captain: own team. Player: own only.
 * Query params: status, playerId, date
 */
activitiesRouter.get('/', async (req: Request, res: Response) => {
  const { status, playerId, date, limit, offset, teamId } = req.query;

  try {
    let where: any = {};

    // Role-based access
    if (req.user!.role === 'PLAYER') {
      const player = await prisma.player.findUnique({ where: { userId: req.user!.userId } });
      if (!player) return res.json({ activities: [], total: 0 });
      where.playerId = player.id;
    } else if (req.user!.role === 'CAPTAIN') {
      const team = await prisma.team.findFirst({ where: { captainId: req.user!.userId } });
      if (!team) return res.json({ activities: [], total: 0 });
      where.player = { teamId: team.id };
    }

    // Filters
    if (status) where.status = status;
    if (playerId && req.user!.role === 'ADMIN') where.playerId = playerId;
    if (teamId && req.user!.role === 'ADMIN') where.player = { ...where.player, teamId };
    if (date) {
      const day = new Date(date as string);
      const dayEnd = new Date(day);
      dayEnd.setHours(23, 59, 59, 999);
      where.startDate = { gte: day, lte: dayEnd };
    } else {
      // Default: filter to active challenge date range
      const challenge = await prisma.challengeConfig.findFirst({ where: { isActive: true } });
      if (challenge) {
        const IST_OFFSET = 5.5 * 60 * 60 * 1000;
        where.startDate = { gte: new Date(challenge.startDate.getTime() - IST_OFFSET), lte: new Date(challenge.endDate.getTime() + IST_OFFSET) };
      }
    }

    const [activities, total] = await Promise.all([
      prisma.activity.findMany({
        where,
        include: {
          player: {
            include: {
              user: { select: { name: true, avatarUrl: true } },
              team: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { startDate: 'desc' },
        take: parseInt(limit as string) || 50,
        skip: parseInt(offset as string) || 0,
      }),
      prisma.activity.count({ where }),
    ]);

    return res.json({ activities, total });
  } catch (err) {
    console.error('Error listing activities:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/activities/flagged
 * Get all flagged activities pending review
 * Admin: all. Captain: own team.
 */
activitiesRouter.get('/flagged', async (req: Request, res: Response) => {
  try {
    let where: any = { status: 'FLAGGED' };

    if (req.user!.role === 'CAPTAIN') {
      const team = await prisma.team.findFirst({ where: { captainId: req.user!.userId } });
      if (!team) return res.json({ activities: [] });
      where.player = { teamId: team.id };
    } else if (req.user!.role === 'PLAYER') {
      const player = await prisma.player.findUnique({ where: { userId: req.user!.userId } });
      if (!player) return res.json({ activities: [] });
      where.playerId = player.id;
    }

    const activities = await prisma.activity.findMany({
      where,
      include: {
        player: {
          include: {
            user: { select: { name: true, avatarUrl: true } },
            team: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { startDate: 'desc' },
    });

    return res.json({ activities });
  } catch (err) {
    console.error('Error listing flagged:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/activities/:id/approve
 * Override: Force-approve any activity (regardless of current status)
 * Admin only
 */
activitiesRouter.post('/:id/approve', authorize('ADMIN'), async (req: Request, res: Response) => {
  try {
    const activity = await prisma.activity.findUnique({ where: { id: req.params.id } });

    if (!activity) return res.status(404).json({ error: 'Activity not found' });

    const updated = await prisma.activity.update({
      where: { id: req.params.id },
      data: {
        status: 'ACCEPTED',
        rejectionReason: null,
        reviewedById: req.user!.userId,
        reviewedAt: new Date(),
      },
    });

    return res.json({ activity: updated, message: 'Activity approved (admin override)' });
  } catch (err) {
    console.error('Error approving activity:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/activities/:id/reject
 * Override: Force-reject any activity (regardless of current status)
 * Admin only
 */
activitiesRouter.post('/:id/reject', authorize('ADMIN'), async (req: Request, res: Response) => {
  const { reason } = req.body;

  try {
    const activity = await prisma.activity.findUnique({ where: { id: req.params.id } });

    if (!activity) return res.status(404).json({ error: 'Activity not found' });

    const updated = await prisma.activity.update({
      where: { id: req.params.id },
      data: {
        status: 'REJECTED',
        rejectionReason: reason || 'Rejected by admin (manual override)',
        reviewedById: req.user!.userId,
        reviewedAt: new Date(),
      },
    });

    return res.json({ activity: updated, message: 'Activity rejected (admin override)' });
  } catch (err) {
    console.error('Error rejecting activity:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
