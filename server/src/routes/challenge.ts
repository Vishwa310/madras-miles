import { Router, Request, Response } from 'express';
import { prisma } from '../utils/db';
import { authenticate, authorize } from '../middleware/auth';

export const challengeRouter = Router();

challengeRouter.use(authenticate);

/**
 * GET /api/challenge
 * Get the active challenge config
 */
challengeRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const config = await prisma.challengeConfig.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!config) {
      return res.json({ config: null, message: 'No active challenge configured' });
    }

    return res.json({ config });
  } catch (err) {
    console.error('Error getting challenge config:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/challenge/all
 * Get all challenge configs (history)
 */
challengeRouter.get('/all', authorize('ADMIN'), async (_req: Request, res: Response) => {
  try {
    const configs = await prisma.challengeConfig.findMany({ orderBy: { createdAt: 'desc' } });
    return res.json({ configs });
  } catch (err) {
    console.error('Error listing configs:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/challenge
 * Create a new challenge config
 */
challengeRouter.post('/', authorize('ADMIN'), async (req: Request, res: Response) => {
  const {
    name, startDate, endDate,
    maxDailyKm, minDistancePerActivity,
    minPaceMinPerKm, maxPaceMinPerKm,
    maxPlayersWeek1, maxPlayersWeek2, maxPlayersWeek3,
    minFemalePerWeek,
  } = req.body;

  if (!name || !startDate || !endDate) {
    return res.status(400).json({ error: 'Required fields: name, startDate, endDate' });
  }

  try {
    await prisma.challengeConfig.updateMany({ where: { isActive: true }, data: { isActive: false } });

    const config = await prisma.challengeConfig.create({
      data: {
        name,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        allowedActivityTypes: ['WALK'],
        maxDailyKm: maxDailyKm ?? 7,
        minDistancePerActivity: minDistancePerActivity ?? 1000,
        minPaceMinPerKm: minPaceMinPerKm ?? 9,
        maxPaceMinPerKm: maxPaceMinPerKm ?? 16,
        maxPlayersWeek1: maxPlayersWeek1 ?? 12,
        maxPlayersWeek2: maxPlayersWeek2 ?? 15,
        maxPlayersWeek3: maxPlayersWeek3 ?? 18,
        minFemalePerWeek: minFemalePerWeek ?? 3,
        isActive: true,
      },
    });

    return res.status(201).json({ config });
  } catch (err) {
    console.error('Error creating challenge config:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/challenge/:id
 * Update challenge config
 */
challengeRouter.put('/:id', authorize('ADMIN'), async (req: Request, res: Response) => {
  const {
    name, startDate, endDate,
    maxDailyKm, minDistancePerActivity,
    minPaceMinPerKm, maxPaceMinPerKm,
    maxPlayersWeek1, maxPlayersWeek2, maxPlayersWeek3, maxPlayersWeek4,
    useConstantRoster, minFemalePerWeek,
    maxSubstitutions, maleCanReturn, femaleCanReturn, maxReturns, subCreditsPerTeam,
    isActive,
  } = req.body;

  try {
    const existing = await prisma.challengeConfig.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Challenge config not found' });

    if (isActive === true) {
      await prisma.challengeConfig.updateMany({ where: { isActive: true, id: { not: req.params.id } }, data: { isActive: false } });
    }

    const updated = await prisma.challengeConfig.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(startDate && { startDate: new Date(startDate) }),
        ...(endDate && { endDate: new Date(endDate) }),
        ...(maxDailyKm !== undefined && { maxDailyKm }),
        ...(minDistancePerActivity !== undefined && { minDistancePerActivity }),
        ...(minPaceMinPerKm !== undefined && { minPaceMinPerKm }),
        ...(maxPaceMinPerKm !== undefined && { maxPaceMinPerKm }),
        ...(maxPlayersWeek1 !== undefined && { maxPlayersWeek1 }),
        ...(maxPlayersWeek2 !== undefined && { maxPlayersWeek2 }),
        ...(maxPlayersWeek3 !== undefined && { maxPlayersWeek3 }),
        ...(maxPlayersWeek4 !== undefined && { maxPlayersWeek4 }),
        ...(useConstantRoster !== undefined && { useConstantRoster }),
        ...(minFemalePerWeek !== undefined && { minFemalePerWeek }),
        ...(maxSubstitutions !== undefined && { maxSubstitutions }),
        ...(maleCanReturn !== undefined && { maleCanReturn }),
        ...(femaleCanReturn !== undefined && { femaleCanReturn }),
        ...(maxReturns !== undefined && { maxReturns }),
        ...(subCreditsPerTeam !== undefined && { subCreditsPerTeam }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    return res.json({ config: updated });
  } catch (err) {
    console.error('Error updating challenge config:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
