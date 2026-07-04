import { Router, Request, Response } from 'express';
import { prisma } from '../utils/db';
import { authenticate, authorize } from '../middleware/auth';
import { getStravaAuthUrl } from '../services/strava';

export const playersRouter = Router();

playersRouter.use(authenticate);

/**
 * GET /api/players/unassigned
 * List users who registered via Strava but don't have a player record yet
 * Admin only
 */
playersRouter.get('/unassigned', authorize('ADMIN'), async (_req: Request, res: Response) => {
  try {
    const unassigned = await prisma.user.findMany({
      where: { player: null },
      select: {
        id: true,
        name: true,
        email: true,
        stravaAthleteId: true,
        avatarUrl: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ users: unassigned });
  } catch (err) {
    console.error('Error listing unassigned users:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/players
 * List all players (with filters)
 * Admin sees all, Captain sees own team, Player sees nothing here
 */
playersRouter.get('/', async (req: Request, res: Response) => {
  const { teamId, status, slot } = req.query;

  try {
    let where: any = {};

    // Role-based filtering
    if (req.user!.role === 'CAPTAIN') {
      // Captain can only see their own team
      const captainTeam = await prisma.team.findFirst({
        where: { captainId: req.user!.userId },
      });
      if (!captainTeam) {
        return res.json({ players: [] });
      }
      where.teamId = captainTeam.id;
    } else if (req.user!.role === 'PLAYER') {
      // Player can only see themselves
      where.userId = req.user!.userId;
    }

    // Additional filters (admin can use freely, captain within team)
    if (teamId && req.user!.role === 'ADMIN') {
      where.teamId = teamId;
    }
    if (status) {
      where.status = status;
    }
    if (slot) {
      where.slot = slot;
    }

    const players = await prisma.player.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            stravaAthleteId: true,
            role: true,
          },
        },
        team: {
          select: { id: true, name: true, emblem: true },
        },
      },
      orderBy: [{ slot: 'asc' }, { createdAt: 'asc' }],
    });

    return res.json({ players });
  } catch (err) {
    console.error('Error listing players:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/players/:id
 * Get single player detail
 */
playersRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const player = await prisma.player.findUnique({
      where: { id: req.params.id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            stravaAthleteId: true,
            role: true,
          },
        },
        team: { select: { id: true, name: true, emblem: true } },
        substitutedBy: {
          include: { user: { select: { name: true } } },
        },
      },
    });

    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    // Access check: player can only view themselves, captain only team
    if (req.user!.role === 'PLAYER' && player.userId !== req.user!.userId) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    if (req.user!.role === 'CAPTAIN') {
      const captainTeam = await prisma.team.findFirst({
        where: { captainId: req.user!.userId },
      });
      if (!captainTeam || captainTeam.id !== player.teamId) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
    }

    return res.json({ player });
  } catch (err) {
    console.error('Error getting player:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/players
 * Create a new player (register user + assign to team)
 * Admin only
 *
 * Body: { name, email, stravaAthleteId, teamId, gender, slot, userId }
 * If userId is provided, assigns existing user to team (no new user created)
 */
playersRouter.post('/', authorize('ADMIN'), async (req: Request, res: Response) => {
  const { name, email, stravaAthleteId, teamId, gender, slot, userId } = req.body;

  if (!teamId || !gender) {
    return res.status(400).json({
      error: 'Required fields: teamId, gender',
    });
  }

  if (!userId && (!name || !stravaAthleteId)) {
    return res.status(400).json({
      error: 'Required fields: name, stravaAthleteId (or userId for existing user)',
    });
  }

  if (!['MALE', 'FEMALE'].includes(gender)) {
    return res.status(400).json({ error: 'Gender must be MALE or FEMALE' });
  }

  const playerSlot = slot || 'MAIN';
  if (!['MAIN', 'SUBSTITUTE'].includes(playerSlot)) {
    return res.status(400).json({ error: 'Slot must be MAIN or SUBSTITUTE' });
  }

  try {
    // Verify team exists
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: { _count: { select: { players: true } } },
    });

    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // Check team capacity (only for MAIN players)
    if (playerSlot === 'MAIN') {
      const mainCount = await prisma.player.count({
        where: { teamId, slot: 'MAIN' },
      });
      if (mainCount >= team.maxPlayers) {
        return res.status(400).json({ error: `Team already has maximum ${team.maxPlayers} main players` });
      }
    }

    // Check if user already exists (by userId or stravaAthleteId)
    let existingUser: any = null;
    if (userId) {
      existingUser = await prisma.user.findUnique({ where: { id: userId } });
      if (!existingUser) {
        return res.status(404).json({ error: 'User not found' });
      }
    } else if (stravaAthleteId) {
      existingUser = await prisma.user.findUnique({
        where: { stravaAthleteId: stravaAthleteId.toString() },
      });
    }

    if (existingUser) {
      // Check if they already have a player record
      const existingPlayer = await prisma.player.findUnique({
        where: { userId: existingUser.id },
      });
      if (existingPlayer) {
        return res.status(409).json({ error: 'This user is already registered as a player' });
      }
    }

    // Create user + player in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create or get user
      const user = existingUser || await tx.user.create({
        data: {
          name,
          email: email || null,
          stravaAthleteId: stravaAthleteId.toString(),
          role: 'PLAYER',
        },
      });

      // Create player
      const player = await tx.player.create({
        data: {
          userId: user.id,
          teamId,
          gender,
          slot: playerSlot,
        },
        include: {
          user: { select: { id: true, name: true, stravaAthleteId: true, role: true } },
          team: { select: { id: true, name: true } },
        },
      });

      return player;
    });

    return res.status(201).json({ player: result });
  } catch (err) {
    console.error('Error creating player:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/players/:id
 * Update player details
 * Admin only
 */
playersRouter.put('/:id', authorize('ADMIN'), async (req: Request, res: Response) => {
  const { gender, slot, teamId, status } = req.body;

  try {
    const player = await prisma.player.findUnique({
      where: { id: req.params.id },
    });

    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    if (player.status === 'RETIRED' && status !== 'ACTIVE' && status !== 'STANDBY') {
      return res.status(400).json({ error: 'Cannot update a retired player' });
    }

    // If moving to a different team
    if (teamId && teamId !== player.teamId) {
      const newTeam = await prisma.team.findUnique({ where: { id: teamId } });
      if (!newTeam) {
        return res.status(404).json({ error: 'Target team not found' });
      }
    }

    const updated = await prisma.player.update({
      where: { id: req.params.id },
      data: {
        ...(gender && { gender }),
        ...(slot && { slot }),
        ...(teamId && { teamId }),
        ...(status && { status }),
      },
      include: {
        user: { select: { id: true, name: true, stravaAthleteId: true } },
        team: { select: { id: true, name: true } },
      },
    });

    return res.json({ player: updated });
  } catch (err) {
    console.error('Error updating player:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/players/:id
 * Remove a player (deletes player record, keeps user)
 * Admin only
 */
playersRouter.delete('/:id', authorize('ADMIN'), async (req: Request, res: Response) => {
  try {
    const player = await prisma.player.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { activities: true } } },
    });

    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    if (player._count.activities > 0) {
      return res.status(400).json({
        error: 'Cannot delete player with synced activities. Consider retiring instead.',
      });
    }

    await prisma.player.delete({ where: { id: req.params.id } });

    return res.json({ message: 'Player removed' });
  } catch (err) {
    console.error('Error deleting player:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/players/:id/strava-link
 * Generate Strava OAuth link for a player
 * Admin only
 */
playersRouter.get('/:id/strava-link', authorize('ADMIN'), async (req: Request, res: Response) => {
  try {
    const player = await prisma.player.findUnique({
      where: { id: req.params.id },
      include: { user: true },
    });

    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const authUrl = getStravaAuthUrl(player.userId);

    return res.json({
      playerId: player.id,
      playerName: player.user.name,
      authUrl,
      hasToken: !!player.user.stravaAccessToken,
    });
  } catch (err) {
    console.error('Error generating strava link:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
