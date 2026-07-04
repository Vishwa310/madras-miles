import { Router, Request, Response } from 'express';
import { prisma } from '../utils/db';
import { authenticate, authorize } from '../middleware/auth';
import { syncAllPlayers } from '../services/sync';

export const syncRouter = Router();

syncRouter.use(authenticate);

/**
 * POST /api/sync
 * Trigger a manual sync for all players
 * Admin only
 */
syncRouter.post('/', authorize('ADMIN'), async (_req: Request, res: Response) => {
  try {
    const result = await syncAllPlayers();
    return res.json({
      message: 'Sync completed',
      ...result,
    });
  } catch (err: any) {
    console.error('Sync error:', err);
    return res.status(500).json({ error: 'Sync failed', details: err.message });
  }
});

/**
 * GET /api/sync/status
 * Get the latest sync status
 */
syncRouter.get('/status', async (_req: Request, res: Response) => {
  try {
    const latest = await prisma.syncLog.findFirst({
      orderBy: { startedAt: 'desc' },
    });

    return res.json({ lastSync: latest });
  } catch (err) {
    console.error('Error getting sync status:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/sync/history
 * Get sync history (last 20 syncs)
 * Admin only
 */
syncRouter.get('/history', authorize('ADMIN'), async (_req: Request, res: Response) => {
  try {
    const history = await prisma.syncLog.findMany({
      orderBy: { startedAt: 'desc' },
      take: 20,
    });

    return res.json({ history });
  } catch (err) {
    console.error('Error getting sync history:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
