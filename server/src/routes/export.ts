import { Router, Request, Response } from 'express';
import { prisma } from '../utils/db';
import { authenticate, authorize } from '../middleware/auth';

export const exportRouter = Router();

exportRouter.use(authenticate);
exportRouter.use(authorize('ADMIN'));

/**
 * GET /api/export/team/:teamId
 * Download all players and activities for a team as CSV
 */
exportRouter.get('/team/:teamId', async (req: Request, res: Response) => {
  try {
    const team = await prisma.team.findUnique({
      where: { id: req.params.teamId },
      include: {
        players: {
          include: {
            user: { select: { name: true, stravaAthleteId: true } },
            activities: {
              orderBy: { startDate: 'desc' },
            },
          },
        },
      },
    });

    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // Build CSV
    const headers = [
      'Player Name',
      'Strava ID',
      'Gender',
      'Status',
      'Activity Date',
      'Activity Type',
      'Distance (km)',
      'Credited (km)',
      'Duration (min)',
      'Moving Time (min)',
      'Avg Speed (km/h)',
      'Max Speed (km/h)',
      'Pause (sec)',
      'Activity Status',
      'Rejection Reason',
    ];

    const rows: string[] = [headers.join(',')];

    for (const player of team.players) {
      if (player.activities.length === 0) {
        rows.push([
          `"${player.user.name}"`,
          player.user.stravaAthleteId,
          player.gender,
          player.status,
          '', '', '', '', '', '', '', '', '', '', '',
        ].join(','));
      } else {
        for (const act of player.activities) {
          rows.push([
            `"${player.user.name}"`,
            player.user.stravaAthleteId,
            player.gender,
            player.status,
            act.startDate.toISOString(),
            act.type,
            (act.distanceMeters / 1000).toFixed(2),
            ((act.creditedMeters || 0) / 1000).toFixed(2),
            (act.durationSeconds / 60).toFixed(1),
            (act.movingTimeSeconds / 60).toFixed(1),
            (act.avgSpeed * 3.6).toFixed(2),
            (act.maxSpeed * 3.6).toFixed(2),
            (act.elapsedTimeSeconds - act.movingTimeSeconds).toString(),
            act.status,
            `"${act.rejectionReason || ''}"`,
          ].join(','));
        }
      }
    }

    const csv = rows.join('\n');
    const filename = `${team.name.replace(/[^a-zA-Z0-9]/g, '_')}_export_${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (err) {
    console.error('Error exporting team:', err);
    return res.status(500).json({ error: 'Export failed' });
  }
});
