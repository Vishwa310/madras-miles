import { prisma } from './db';

export async function logAudit(teamId: string, action: string, playerName: string, details: string, performedBy: string) {
  await prisma.auditLog.create({
    data: { teamId, action, playerName, details, performedBy },
  });
}
