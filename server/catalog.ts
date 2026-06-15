// Central shared product catalog service.
//
// The catalog (MasterProduct + MasterProductGtin) is GLOBAL — not tenant-scoped.
// Any pharmacy resolves a scanned GTIN to a product master here; if it's missing
// the DRAP route fills it (see drap.ts) and upserts it so the next pharmacy gets
// it instantly. Manual medicine additions also contribute back.
//
// Only non-sensitive master fields live here. Pricing/stock/rack stay per-tenant.
import { prisma } from './prisma.js';

/** Canonical 14-digit GTIN key (handles EAN-13 ↔ GTIN-14 zero-pad). */
export function normalizeGtin(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length < 8) return null;
  return digits.padStart(14, '0').slice(-14);
}

export interface DrapDTO {
  drapRegNo?: string;
  brand: string;
  brandName?: string;
  genericName?: string;
  strength?: string;
  unit?: string;
  dosageForm?: string;
  manufacturer?: string;
  atcCode?: string;
  routeOfAdmin?: string;
  packSizes?: Array<{ pack?: string; gtin?: string }>;
  composition?: Array<{ generic?: string; strength?: string; unit?: string; atcCode?: string }>;
  /** Misc DRAP fields without dedicated columns (labelClaim, regDate, …). */
  extra?: Record<string, string>;
  gtins?: string[];
  source?: 'drap' | 'contributed' | 'verified';
  contributedByTenantId?: string;
}

/** Find a catalog product by any of its pack GTINs. */
export async function lookupByGtin(gtin: string) {
  const key = normalizeGtin(gtin);
  if (!key) return null;
  const row = await prisma.masterProductGtin.findUnique({
    where: { gtin: key },
    include: { product: { include: { gtins: true } } },
  });
  return row?.product ?? null;
}

export async function searchCatalog(params: { brand?: string; generic?: string; regNo?: string }, limit = 20) {
  const { brand, generic, regNo } = params;
  if (regNo) {
    const row = await prisma.masterProduct.findUnique({ where: { drapRegNo: regNo }, include: { gtins: true } });
    return row ? [row] : [];
  }
  const OR: Array<Record<string, unknown>> = [];
  if (brand) OR.push({ brand: { contains: brand } });
  if (generic) OR.push({ genericName: { contains: generic } });
  if (OR.length === 0) return [];
  return prisma.masterProduct.findMany({ where: { OR }, include: { gtins: true }, take: limit, orderBy: { brand: 'asc' } });
}

/** Collect every GTIN a DTO mentions (top-level + per pack size), normalized. */
function gtinsFromDTO(dto: DrapDTO): string[] {
  const all = [...(dto.gtins ?? []), ...((dto.packSizes ?? []).map((p) => p.gtin).filter(Boolean) as string[])];
  const out = new Set<string>();
  for (const g of all) { const n = normalizeGtin(g); if (n) out.add(n); }
  return [...out];
}

/**
 * Upsert a product master from a DRAP DTO. Matches an existing row by DRAP reg
 * no or by any shared GTIN. A 'contributed' source never overwrites a richer
 * 'drap'/'verified' record — it only fills gaps. New GTINs are always linked.
 */
export async function upsertProduct(dto: DrapDTO) {
  const source = dto.source ?? 'contributed';
  const gtins = gtinsFromDTO(dto);

  // Find an existing product: prefer reg-no, else any matching GTIN.
  let existing = dto.drapRegNo
    ? await prisma.masterProduct.findUnique({ where: { drapRegNo: dto.drapRegNo }, include: { gtins: true } })
    : null;
  if (!existing && gtins.length) {
    const g = await prisma.masterProductGtin.findFirst({ where: { gtin: { in: gtins } }, include: { product: { include: { gtins: true } } } });
    existing = g?.product ?? null;
  }

  const masterFields = {
    brand: dto.brand,
    genericName: dto.genericName ?? null,
    strength: dto.strength ?? null,
    unit: dto.unit ?? null,
    dosageForm: dto.dosageForm ?? null,
    manufacturer: dto.manufacturer ?? null,
    atcCode: dto.atcCode ?? null,
    routeOfAdmin: dto.routeOfAdmin ?? null,
    packSizes: (dto.packSizes ?? undefined) as object | undefined,
    composition: (dto.composition ?? undefined) as object | undefined,
    extra: (dto.extra ?? undefined) as object | undefined,
  };

  let product;
  if (existing) {
    // Trust rule: only a drap/verified source may overwrite; contributed fills gaps.
    const canOverwrite = source === 'drap' || source === 'verified';
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(masterFields)) {
      const cur = (existing as unknown as Record<string, unknown>)[k];
      if (v == null) continue;
      if (canOverwrite || cur == null || cur === '') data[k] = v;
    }
    if (canOverwrite && (existing.source !== 'verified')) data.source = source;
    if (dto.drapRegNo && !existing.drapRegNo) data.drapRegNo = dto.drapRegNo;
    product = await prisma.masterProduct.update({ where: { id: existing.id }, data, include: { gtins: true } });
  } else {
    product = await prisma.masterProduct.create({
      data: {
        ...masterFields,
        drapRegNo: dto.drapRegNo ?? null,
        source,
        contributedByTenantId: dto.contributedByTenantId ?? null,
      },
      include: { gtins: true },
    });
  }

  // Link any new GTINs (ignore ones already owned by another product).
  for (const g of gtins) {
    try {
      await prisma.masterProductGtin.upsert({
        where: { gtin: g },
        create: { gtin: g, productId: product.id },
        update: {},
      });
    } catch { /* a GTIN already linked elsewhere — leave it */ }
  }
  return prisma.masterProduct.findUnique({ where: { id: product.id }, include: { gtins: true } });
}

/**
 * Contribute a manually-added medicine to the catalog (fire-and-forget). Adds a
 * 'contributed' record only when the GTIN/reg-no isn't represented yet.
 */
export async function contributeFromMedicine(
  med: { name: string; genericName?: string | null; strength?: string | null; dosageForm?: string | null; manufacturer?: string | null; barcode?: string | null; drapRegNo?: string | null },
  tenantId: string,
): Promise<void> {
  try {
    const gtin = normalizeGtin(med.barcode);
    if (!gtin && !med.drapRegNo) return; // nothing stable to key on
    if (gtin) {
      const found = await prisma.masterProductGtin.findUnique({ where: { gtin } });
      if (found) return; // already in catalog
    }
    await upsertProduct({
      brand: med.name,
      genericName: med.genericName ?? undefined,
      strength: med.strength ?? undefined,
      dosageForm: med.dosageForm ?? undefined,
      manufacturer: med.manufacturer ?? undefined,
      drapRegNo: med.drapRegNo ?? undefined,
      gtins: gtin ? [gtin] : [],
      source: 'contributed',
      contributedByTenantId: tenantId,
    });
  } catch (err) {
    console.warn('[catalog] contribute failed:', err);
  }
}
