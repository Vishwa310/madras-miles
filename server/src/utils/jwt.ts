import jwt from 'jsonwebtoken';
import { config } from '../config';
import { Role } from '@prisma/client';

export interface JwtPayload {
  userId: string;
  stravaAthleteId: string;
  role: Role;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, config.jwt.secret) as JwtPayload;
  } catch {
    return null;
  }
}
