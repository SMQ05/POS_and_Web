import { PrismaClient } from '@prisma/client';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function readDatabaseUrl(): { url: string; source: string } {
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../.env'),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const content = readFileSync(path, 'utf-8');
      const match = content.match(/^\s*DATABASE_URL\s*=\s*["']?([^"'\n\r]+)["']?\s*$/m);
      if (match && match[1]) {
        return { url: match[1].trim(), source: `file:${path}` };
      }
    } catch {
      /* continue */
    }
  }

  if (process.env.DATABASE_URL) {
    let url = process.env.DATABASE_URL;
    if (url.includes('\\%')) url = url.replace(/\\%/g, '%');
    return { url, source: 'process.env' };
  }
  throw new Error('DATABASE_URL not found in .env file or process.env');
}

const { url: databaseUrl, source: dbUrlSource } = readDatabaseUrl();

// Force the OpenSSL 3.0.x binary engine path. We use engineType="binary" because the
// library engine ("PANIC: timer has gone away") is unstable with Node 24 on Hostinger's
// CloudLinux/CageFS sandbox.
function forceEngine30(): string | null {
  const cwd = process.cwd();
  const candidates = [
    resolve(cwd, 'node_modules/.prisma/client/query-engine-debian-openssl-3.0.x'),
    resolve(cwd, '../node_modules/.prisma/client/query-engine-debian-openssl-3.0.x'),
    resolve(cwd, 'node_modules/@prisma/engines/query-engine-debian-openssl-3.0.x'),
    resolve(cwd, 'node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      process.env.PRISMA_QUERY_ENGINE_BINARY = p;
      process.env.PRISMA_QUERY_ENGINE_LIBRARY = p;
      return p;
    }
  }
  return null;
}
const forcedEnginePath = forceEngine30();

export const dbUrlInfo = {
  source: dbUrlSource,
  masked: databaseUrl.replace(/:\/\/([^:]+):[^@]*@/, '://$1:***@'),
  forcedEnginePath,
};

console.log(`[prisma] DATABASE_URL source: ${dbUrlSource}`);
console.log(`[prisma] DATABASE_URL (masked): ${dbUrlInfo.masked}`);
console.log(`[prisma] forced engine: ${forcedEnginePath ?? '(not found, using auto)'}`);

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: databaseUrl } },
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['query', 'error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
