import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from './prisma.js';

const fallbackSecret = 'dev-only-change-me';

export interface AuthContext {
  userId: string;
  tenantId: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export function signToken(payload: AuthContext): string {
  return jwt.sign(payload, process.env.JWT_SECRET || fallbackSecret, { expiresIn: '12h' });
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

  if (!token) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || fallbackSecret) as AuthContext;
    const user = await prisma.user.findFirst({
      where: {
        id: decoded.userId,
        tenantId: decoded.tenantId,
        isActive: true,
        tenant: { isActive: true },
      },
      select: { id: true },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    req.auth = decoded;
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid bearer token' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) return res.status(401).json({ error: 'Missing session' });
    if (!roles.includes(req.auth.role)) return res.status(403).json({ error: 'Forbidden' });
    return next();
  };
}
