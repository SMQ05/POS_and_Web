// Superadmin-only DRAP bulk importer. Walks 3-char brand-search prefixes, and
// for every registration number it finds that isn't already in the central
// MasterProduct catalog, fetches the detail and upserts it. Resumable (cursor in
// DB), rate-limited (one DRAP request per tick), pausable. Long-running — meant
// to pre-seed the shared catalog over time, not to block requests.
//
// Data lands in the global MasterProduct catalog all tenants read. DRAP data is
// provisional (their disclaimer) — treat as a draft.
import { prisma } from './prisma.js';
import { searchDrapBrand, getDrapProduct } from './drap.js';
import { upsertProduct } from './catalog.js';

const CHARSET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const TICK_MS = 1200; // ~1 DRAP request per tick

let prefixes: string[] | null = null;
function getPrefixes(): string[] {
  if (prefixes) return prefixes;
  const out: string[] = [];
  for (const a of CHARSET) for (const b of CHARSET) for (const c of CHARSET) out.push(a + b + c);
  prefixes = out;
  return out;
}

// In-memory work queue of registration numbers pending detail-fetch.
let queue: string[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
let ticking = false;

const JOB_ID = 'singleton';
async function readJob() {
  return prisma.drapImportJob.upsert({ where: { id: JOB_ID }, create: { id: JOB_ID }, update: {} });
}
async function patchJob(data: Record<string, unknown>) {
  // Defensive: never let an over-long error string (e.g. a DRAP HTML error page)
  // overflow the column and throw — clamp it before writing.
  if (typeof data.lastError === 'string') data.lastError = data.lastError.slice(0, 1000);
  return prisma.drapImportJob.update({ where: { id: JOB_ID }, data });
}

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const job = await readJob();
    if (job.status !== 'running') return;
    const list = getPrefixes();

    // 1) Drain the detail queue first (one product per tick).
    if (queue.length > 0) {
      const reg = queue.shift()!;
      try {
        const dto = await getDrapProduct(reg);
        if (dto) { await upsertProduct(dto); await patchJob({ processed: { increment: 1 } }); }
        else await patchJob({ failed: { increment: 1 } });
      } catch (err) {
        await patchJob({ failed: { increment: 1 }, lastError: (err as Error).message?.slice(0, 200) });
      }
      return;
    }

    // 2) Queue empty → advance to the next prefix and discover reg numbers.
    if (job.cursor >= list.length) {
      await patchJob({ status: 'done' });
      stopTimer();
      return;
    }
    const prefix = list[job.cursor];
    const candidates = await searchDrapBrand(prefix).catch(() => []);
    // Keep only reg numbers not already in the catalog.
    let newCount = 0;
    if (candidates.length) {
      const regs = candidates.map((c) => c.drapRegNo);
      const existing = await prisma.masterProduct.findMany({ where: { drapRegNo: { in: regs } }, select: { drapRegNo: true } });
      const have = new Set(existing.map((e) => e.drapRegNo));
      for (const r of regs) { if (!have.has(r)) { queue.push(r); newCount++; } }
    }
    await patchJob({ cursor: job.cursor + 1, lastPrefix: prefix, queued: { increment: newCount }, prefixTotal: list.length });
  } catch (err) {
    // A tick must NEVER crash the server. Swallow + best-effort record, but
    // don't let the recording throw either.
    console.warn('[drapImport] tick error:', (err as Error)?.message);
    try { await patchJob({ lastError: (err as Error)?.message ?? 'tick error' }); } catch { /* ignore */ }
  } finally {
    ticking = false;
  }
}

function startTimer() {
  if (timer) return;
  // Extra guard: the rejection from tick() can never become unhandled.
  timer = setInterval(() => { void tick().catch(() => {}); }, TICK_MS);
}
function stopTimer() {
  if (timer) { clearInterval(timer); timer = null; }
}

export async function startImport(reset: boolean) {
  const list = getPrefixes();
  queue = [];
  await prisma.drapImportJob.upsert({
    where: { id: JOB_ID },
    create: { id: JOB_ID, status: 'running', cursor: 0, prefixTotal: list.length, startedAt: new Date() },
    update: reset
      ? { status: 'running', cursor: 0, prefixTotal: list.length, queued: 0, processed: 0, failed: 0, lastError: null, startedAt: new Date() }
      : { status: 'running', prefixTotal: list.length },
  });
  startTimer();
  return readJob();
}

export async function pauseImport() {
  await patchJob({ status: 'paused' });
  stopTimer();
  return readJob();
}

export async function resumeImport() {
  const job = await readJob();
  if (job.status === 'done') return job;
  await patchJob({ status: 'running' });
  startTimer();
  return readJob();
}

export async function importStatus() {
  const job = await readJob();
  // Surface the live in-memory queue depth (DB stores cumulative discovered).
  return { ...job, pending: queue.length };
}

// On server boot, resume an interrupted job (status was 'running').
export async function resumeImportOnBoot() {
  try {
    const job = await prisma.drapImportJob.findUnique({ where: { id: JOB_ID } });
    if (job?.status === 'running') startTimer();
  } catch { /* table may not exist yet */ }
}
