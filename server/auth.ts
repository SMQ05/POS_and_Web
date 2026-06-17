import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from './prisma.js';

// SECURITY: no hardcoded fallback. A weak/known signing secret means anyone can
// forge a token for any { userId, tenantId, role } and take over every tenant.
// We fail closed: the secret MUST come from the environment, and short/empty
// secrets are rejected. The read is LAZY (first sign/verify) rather than at module
// load, so it can't crash boot due to ESM import ordering vs. dotenv.config()
// (imported modules evaluate before the importer's body where dotenv loads).
let cachedSecret: string | null = null;
function getJwtSecret(): string {
  if (cachedSecret) return cachedSecret;
  const secret = process.env.JWT_SECRET ?? '';
  if (!secret || secret.length < 32) {
    throw new Error(
      'JWT_SECRET is missing or too short (need ≥32 chars). Refusing to sign/verify with a weak/forgeable key.',
    );
  }
  cachedSecret = secret;
  return secret;
}
// Pin the algorithm on both sign and verify to prevent algorithm-confusion
// (e.g. an attacker presenting an "alg":"none" or RS256-vs-HS256 mismatched token).
const JWT_ALG = 'HS256' as const;

export interface AuthContext {
  userId: string;
  tenantId: string;
  role: string;
  // Token version at signing time. Compared against the user's current
  // tokenVersion on every request so a logout/"sign out everywhere" can revoke
  // all outstanding tokens. Optional for backward-compat with tokens issued
  // before this field existed (treated as 0).
  tv?: number;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export function signToken(payload: AuthContext): string {
  return jwt.sign(payload, getJwtSecret(), { algorithm: JWT_ALG, expiresIn: '12h' });
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

  if (!token) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret(), { algorithms: [JWT_ALG] }) as AuthContext;
    const user = await prisma.user.findFirst({
      where: {
        id: decoded.userId,
        tenantId: decoded.tenantId,
        isActive: true,
        tenant: { isActive: true },
      },
      select: { id: true, role: true, tokenVersion: true },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    // Revocation check: a stale token version means the user logged out / was
    // signed out everywhere after this token was issued. Tokens predating the
    // tokenVersion feature carry no `tv` (treated as 0, matching the column
    // default) so they keep working until that user next logs out.
    if ((decoded.tv ?? 0) !== (user.tokenVersion ?? 0)) {
      return res.status(401).json({ error: 'Session expired, please sign in again' });
    }

    // Trust the CURRENT role from the DB, not the (up to 12h old) token claim —
    // so demoting/changing a user's role takes effect immediately rather than
    // letting them keep elevated privileges until their token expires.
    req.auth = { ...decoded, role: user.role };
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
