import { Router, Request, Response } from 'express';
import { prisma } from '../utils/db';
import { authenticate, authorize } from '../middleware/auth';

export const rulesRouter = Router();

rulesRouter.use(authenticate);

/**
 * GET /api/rules
 * List all scoring rules (active ones first)
 * Accessible by all authenticated users
 */
rulesRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const rules = await prisma.scoringRule.findMany({
      orderBy: [{ isActive: 'desc' }, { priority: 'asc' }, { createdAt: 'asc' }],
    });

    return res.json({ rules });
  } catch (err) {
    console.error('Error listing rules:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/rules/:id
 * Get single scoring rule
 */
rulesRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const rule = await prisma.scoringRule.findUnique({
      where: { id: req.params.id },
    });

    if (!rule) {
      return res.status(404).json({ error: 'Scoring rule not found' });
    }

    return res.json({ rule });
  } catch (err) {
    console.error('Error getting rule:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/rules
 * Create a new scoring rule
 * Admin only
 *
 * Example body:
 * {
 *   "name": "Distance Points",
 *   "ruleType": "distance",
 *   "params": { "pointsPerUnit": 2, "unitMeters": 1000 },
 *   "priority": 1
 * }
 */
rulesRouter.post('/', authorize('ADMIN'), async (req: Request, res: Response) => {
  const { name, ruleType, params, priority, isActive } = req.body;

  if (!name || !ruleType || !params) {
    return res.status(400).json({ error: 'Required fields: name, ruleType, params' });
  }

  const validRuleTypes = ['distance', 'speed_bonus', 'streak', 'early_bird', 'daily_cap', 'time_bonus', 'max_km_bonus', 'custom'];
  if (!validRuleTypes.includes(ruleType)) {
    return res.status(400).json({
      error: `Invalid ruleType. Must be one of: ${validRuleTypes.join(', ')}`,
    });
  }

  try {
    const rule = await prisma.scoringRule.create({
      data: {
        name,
        ruleType,
        params,
        priority: priority ?? 0,
        isActive: isActive ?? true,
      },
    });

    return res.status(201).json({ rule });
  } catch (err) {
    console.error('Error creating rule:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/rules/:id
 * Update a scoring rule
 * Admin only
 */
rulesRouter.put('/:id', authorize('ADMIN'), async (req: Request, res: Response) => {
  const { name, ruleType, params, priority, isActive } = req.body;

  try {
    const existing = await prisma.scoringRule.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Scoring rule not found' });
    }

    const updated = await prisma.scoringRule.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(ruleType && { ruleType }),
        ...(params && { params }),
        ...(priority !== undefined && { priority }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    return res.json({ rule: updated });
  } catch (err) {
    console.error('Error updating rule:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/rules/:id/toggle
 * Toggle a scoring rule active/inactive
 * Admin only
 */
rulesRouter.patch('/:id/toggle', authorize('ADMIN'), async (req: Request, res: Response) => {
  try {
    const existing = await prisma.scoringRule.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Scoring rule not found' });
    }

    const updated = await prisma.scoringRule.update({
      where: { id: req.params.id },
      data: { isActive: !existing.isActive },
    });

    return res.json({ rule: updated, message: `Rule ${updated.isActive ? 'activated' : 'deactivated'}` });
  } catch (err) {
    console.error('Error toggling rule:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/rules/:id
 * Delete a scoring rule
 * Admin only
 */
rulesRouter.delete('/:id', authorize('ADMIN'), async (req: Request, res: Response) => {
  try {
    const existing = await prisma.scoringRule.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Scoring rule not found' });
    }

    await prisma.scoringRule.delete({ where: { id: req.params.id } });

    return res.json({ message: 'Scoring rule deleted' });
  } catch (err) {
    console.error('Error deleting rule:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
