// DRAP (Drug Regulatory Authority of Pakistan) connector — fallback source for
// the central catalog. No public API; we replicate the WebProductIndex page's
// AJAX call. Discovered endpoint (June 2026):
//   POST https://eapp.dra.gov.pk/productView.php  body: webRegNo=<regNo>
//     → HTML fragment: <li>Label: <span style="font-weight:bold;">VALUE</span></li>
//       + a Composition table + "Pack Size(s): … (GTIN : <digits>)".
// Brand/generic typeahead is a GET (select2's default method):
//   GET productView.php?search=<term>&_type=brand%20name
//     → {"results":[{"id":"<regNo>","text":"<brand>"}]}
//   GET productView.php?searchGeneric=<term>&_type=generic%20name (generic groups)
//
// Best-effort + resilient: 8s timeout, never throws, returns null/[] on failure
// so the app always falls back to manual entry. Data is DRAP-provisional.
import type { DrapDTO } from './catalog.js';

const BASE = process.env.DRAP_BASE_URL || 'https://eapp.dra.gov.pk';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36';

const COMMON_HEADERS = {
  'X-Requested-With': 'XMLHttpRequest',
  'Referer': `${BASE}/WebProductIndex.php`,
  'User-Agent': UA,
};

async function postForm(path: string, body: Record<string, string>): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${BASE}/${path}`, {
      method: 'POST',
      headers: { ...COMMON_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function getText(path: string, query: Record<string, string>): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const qs = new URLSearchParams(query).toString();
    const res = await fetch(`${BASE}/${path}?${qs}`, { method: 'GET', headers: COMMON_HEADERS, signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** A DRAP search candidate (lightweight — full detail fetched on pick). */
export interface DrapCandidate { drapRegNo: string; brand: string }

/** Brand typeahead → [{ regNo, brand }]. The `id` field is the registration no. */
export async function searchDrapBrand(term: string): Promise<DrapCandidate[]> {
  if (!term || term.trim().length < 3) return [];
  const json = await getText('productView.php', { search: term.trim(), _type: 'brand name' });
  if (!json) return [];
  try {
    const data = JSON.parse(json.replace(/^﻿/, '').trim());
    const results: Array<{ id?: string; text?: string }> = data?.results ?? [];
    const out: DrapCandidate[] = [];
    const seen = new Set<string>();
    for (const r of results) {
      const reg = (r.id ?? '').trim();
      const brand = (r.text ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      if (!reg || seen.has(reg)) continue;
      seen.add(reg);
      out.push({ drapRegNo: reg, brand });
    }
    return out;
  } catch {
    return [];
  }
}

const stripTags = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();

/** label (lowercased, trimmed of ':') → value, from the <li> list. */
function fieldMap(html: string): Map<string, string> {
  const map = new Map<string, string>();
  const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = liRe.exec(html))) {
    const li = m[1];
    const spanIdx = li.search(/<span/i);
    if (spanIdx < 0) continue;
    const label = stripTags(li.slice(0, spanIdx)).replace(/[:\s]+$/, '').toLowerCase();
    const span = li.slice(spanIdx).match(/<span[^>]*>([\s\S]*?)<\/span>/i);
    if (label && span) map.set(label, stripTags(span[1]));
  }
  return map;
}

function parseComposition(html: string): DrapDTO['composition'] {
  const out: NonNullable<DrapDTO['composition']> = [];
  const tbody = html.match(/composition detail[\s\S]*?<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!tbody) return out;
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let r: RegExpExecArray | null;
  while ((r = rowRe.exec(tbody[1]))) {
    const cells = [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => stripTags(c[1]));
    if (cells.length >= 4 && cells[0]) {
      out.push({ generic: cells[0], strength: cells[1] || undefined, unit: cells[2] || undefined, atcCode: cells[3] || undefined });
    }
  }
  return out;
}

function parsePackSizes(packText: string): { packSizes: DrapDTO['packSizes']; gtins: string[] } {
  const packSizes: NonNullable<DrapDTO['packSizes']> = [];
  const gtins = new Set<string>();
  // DRAP renders a comma-separated list of "<pack label> – (GTIN : <digits?>)".
  // The GTIN is frequently EMPTY (e.g. "2*10 – (GTIN : )") and the label uses
  // any of *, x, × as a separator — so we capture the label regardless of
  // whether a GTIN follows, and pull the GTIN out separately when present.
  for (const rawSeg of packText.split(',')) {
    const seg = rawSeg.trim();
    if (!seg) continue;
    const gm = seg.match(/GTIN\s*:\s*(\d{8,14})/i);
    if (gm) gtins.add(gm[1]);
    // Strip the "– (GTIN : …)" tail (with or without a number / closing paren).
    let pack = seg
      .replace(/[–-]?\s*\(?\s*GTIN\s*:[^)]*\)?/i, '')
      .replace(/[–-]\s*$/, '')
      .trim()
      .replace(/\s+/g, ' ');
    if (pack || gm) packSizes.push({ pack: pack || undefined, gtin: gm?.[1] });
  }
  return { packSizes, gtins: [...gtins] };
}

/** Fetch + parse a DRAP product by registration number. Returns null on failure. */
export async function getDrapProduct(regNo: string): Promise<DrapDTO | null> {
  const reg = regNo.trim();
  if (!reg) return null;
  const html = await postForm('productView.php', { webRegNo: reg });
  if (!html || !/product\s*name/i.test(html)) return null;
  try {
    const f = fieldMap(html);
    const brand = f.get('product name') || f.get('product name:') || '';
    if (!brand) return null;
    const composition = parseComposition(html) ?? [];
    const packText = f.get('pack size(s)') || f.get('pack size') || html;
    const { packSizes, gtins } = parsePackSizes(packText);
    const first = composition[0];

    // Generic = all active ingredients joined (combos), e.g. "A + B".
    const genericName = composition.length
      ? composition.map((c) => c.generic).filter(Boolean).join(' + ')
      : undefined;
    // Brand token = product name up to the first strength/number ("RIGIX 10mg…" → "RIGIX").
    const brandToken = brand.split(/\s+\d/)[0].trim() || brand;

    // Everything else DRAP gives us, kept for reference / future mapping.
    const extra: Record<string, string> = {};
    const put = (k: string, label: string) => { const v = f.get(label); if (v) extra[k] = v; };
    extra.brandName = brandToken;
    put('registrationDate', 'registration date');
    put('companyAddress', 'company address');
    put('labelClaim', 'label claim');
    put('productSpecification', 'product specification');
    put('manufacturingType', 'manufacturing type');
    put('usedFor', 'used for');
    put('containerClosure', 'container closure');

    return {
      drapRegNo: f.get('registration no') || reg,
      brand,
      brandName: brandToken,
      genericName,
      strength: first?.strength,
      unit: first?.unit,
      atcCode: first?.atcCode,
      dosageForm: f.get('dosage form'),
      manufacturer: f.get('company name'),
      routeOfAdmin: f.get('route of admin'),
      composition,
      packSizes,
      gtins,
      extra,
      source: 'drap',
    };
  } catch {
    return null;
  }
}

/**
 * Search DRAP and return lightweight candidates (regNo + brand). Brand uses the
 * GET typeahead; reg-no returns the single product's brand. Full detail is
 * fetched on pick via getDrapProduct(). Fast — one request.
 */
export async function searchDrapCandidates(params: { regNo?: string; brand?: string }): Promise<DrapCandidate[]> {
  if (params.brand) return searchDrapBrand(params.brand);
  if (params.regNo) {
    const p = await getDrapProduct(params.regNo);
    return p ? [{ drapRegNo: p.drapRegNo ?? params.regNo, brand: p.brand }] : [];
  }
  return [];
}
