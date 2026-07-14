import { Router, Request, Response } from 'express';
import { prisma } from '../utils/db';
import { authenticate, authorize } from '../middleware/auth';

export const teamsRouter = Router();

// All team routes require authentication
teamsRouter.use(authenticate);

/**
 * GET /api/teams
 * List all teams with player counts
 * Accessible by: ADMIN, CAPTAIN, PLAYER (CAPTAIN/PLAYER see limited info)
 */
teamsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const teams = await prisma.team.findMany({
      include: {
        captain: {
          select: { id: true, name: true, avatarUrl: true },
        },
        players: {
          select: {
            id: true,
            gender: true,
            slot: true,
            status: true,
            user: { select: { name: true, avatarUrl: true } },
          },
        },
        _count: {
          select: { players: true, substitutionLogs: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    const result = teams.map((team) => ({
      id: team.id,
      name: team.name,
      emblem: team.emblem,
      captain: team.captain,
      minPlayers: team.minPlayers,
      maxPlayers: team.maxPlayers,
      minFemale: team.minFemale,
      playerCount: team._count.players,
      subCreditsUsed: team._count.substitutionLogs,
      players: team.players,
      createdAt: team.createdAt,
    }));

    return res.json({ teams: result });
  } catch (err) {
    console.error('Error listing teams:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/teams/:id
 * Get single team with full details
 */
teamsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const team = await prisma.team.findUnique({
      where: { id: req.params.id },
      include: {
        captain: {
          select: { id: true, name: true, avatarUrl: true, stravaAthleteId: true },
        },
        players: {
          include: {
            user: { select: { id: true, name: true, avatarUrl: true, stravaAthleteId: true } },
          },
          orderBy: [{ slot: 'asc' }, { status: 'asc' }],
        },
      },
    });

    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    return res.json({ team });
  } catch (err) {
    console.error('Error getting team:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/teams
 * Create a new team
 * Admin only
 */
teamsRouter.post('/', authorize('ADMIN'), async (req: Request, res: Response) => {
  const { name, emblem, minPlayers, maxPlayers, minFemale } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Team name is required' });
  }

  try {
    // Check duplicate name
    const existing = await prisma.team.findUnique({ where: { name } });
    if (existing) {
      return res.status(409).json({ error: 'Team name already exists' });
    }

    const team = await prisma.team.create({
      data: {
        name,
        emblem: emblem || null,
        minPlayers: minPlayers || 6,
        maxPlayers: maxPlayers || 20,
        minFemale: minFemale || 3,
      },
    });

    return res.status(201).json({ team });
  } catch (err) {
    console.error('Error creating team:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/teams/:id
 * Update team details
 * Admin only
 */
teamsRouter.put('/:id', authorize('ADMIN'), async (req: Request, res: Response) => {
  const { name, emblem, minPlayers, maxPlayers, minFemale, captainId } = req.body;

  try {
    const team = await prisma.team.findUnique({ where: { id: req.params.id } });
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // If changing name, check for duplicates
    if (name && name !== team.name) {
      const existing = await prisma.team.findUnique({ where: { name } });
      if (existing) {
        return res.status(409).json({ error: 'Team name already exists' });
      }
    }

    // If setting captain, verify they belong to this team
    if (captainId) {
      const player = await prisma.player.findFirst({
        where: { userId: captainId, teamId: req.params.id },
      });
      if (!player) {
        return res.status(400).json({ error: 'Captain must be a player in this team' });
      }

      // Update user role to CAPTAIN
      await prisma.user.update({
        where: { id: captainId },
        data: { role: 'CAPTAIN' },
      });
    }

    const updated = await prisma.team.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(emblem !== undefined && { emblem }),
        ...(minPlayers && { minPlayers }),
        ...(maxPlayers && { maxPlayers }),
        ...(minFemale !== undefined && { minFemale }),
        ...(captainId && { captainId }),
      },
      include: {
        captain: { select: { id: true, name: true } },
      },
    });

    return res.json({ team: updated });
  } catch (err) {
    console.error('Error updating team:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/teams/:id
 * Delete a team (only if no players assigned)
 * Admin only
 */
teamsRouter.delete('/:id', authorize('ADMIN'), async (req: Request, res: Response) => {
  try {
    const team = await prisma.team.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { players: true } } },
    });

    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    if (team._count.players > 0) {
      return res.status(400).json({
        error: 'Cannot delete team with players. Remove all players first.',
      });
    }

    await prisma.team.delete({ where: { id: req.params.id } });

    return res.json({ message: 'Team deleted' });
  } catch (err) {
    console.error('Error deleting team:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/teams/:id/audit
 * Get audit log for a specific team
 * Admin only
 */
teamsRouter.get('/:id/audit', authorize('ADMIN'), async (req: Request, res: Response) => {
  try {
    const logs = await prisma.auditLog.findMany({
      where: { teamId: req.params.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return res.json({ logs });
  } catch (err) {
    console.error('Error fetching audit log:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
