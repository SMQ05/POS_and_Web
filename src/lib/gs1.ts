// GS1 DataMatrix / FBR-QR parsing for pharmacy packs.
//
// Pakistani pharma packs carry GS1 DataMatrix codes (and a non-standard FBR QR
// variant). The constant part is the GTIN (Application Identifier 01) which
// identifies the product; batch (10), expiry (17), manufacture date (11) and —
// in the FBR variant — a human-readable tail with product name / pack / MRP all
// change per pack. This module turns a raw scanned string into structured data.
//
// Design rules:
//  - parseScannedCode never throws — anything unreadable returns
//    { isStructured: false, raw } so plain EAN-13 scanning is unaffected.
//  - The GTIN is fixed-length and first, so it always parses correctly even when
//    a scanner drops the GS separator and the variable batch field is ambiguous.

export interface ParsedScan {
  gtin?: string;
  batchNumber?: string;
  expiryDate?: Date;
  manufactureDate?: Date;
  serial?: string;
  mrp?: number;
  packSize?: string;
  productName?: string;
  /** True when we extracted at least one meaningful field. */
  isStructured: boolean;
  /** The original scanned string, untouched. */
  raw: string;
}

const GS = '\x1d'; // ASCII 29 group separator (terminates variable-length AIs)

// Fixed-length data AIs → length of the VALUE (excluding the 2-char AI).
const FIXED_AI_VALUE_LEN: Record<string, number> = {
  '01': 14, // GTIN-14
  '11': 6, // production / manufacture date YYMMDD
  '13': 6, // packaging date
  '15': 6, // best-before date
  '17': 6, // expiry date YYMMDD
};
// Variable-length AIs (terminated by GS or the next AI). Capped at 20 per GS1.
const VARIABLE_AIS = new Set(['10', '21']);
// AIs we know how to start parsing — used to find the end of a variable field
// when no GS separator is present.
const KNOWN_AIS = new Set(['01', '10', '11', '13', '15', '17', '21']);
const MAX_VARIABLE_LEN = 20;

/** Decode a GS1 YYMMDD value into a local Date. DD=00 → last day of month. */
export function decodeYYMMDD(v: string): Date | undefined {
  if (!/^\d{6}$/.test(v)) return undefined;
  const yy = Number(v.slice(0, 2));
  const mm = Number(v.slice(2, 4));
  const dd = Number(v.slice(4, 6));
  if (mm < 1 || mm > 12) return undefined;
  // No pharma expiries pre-2000; GS1 century pivot collapses to 2000+yy here.
  const year = 2000 + yy;
  if (dd === 0) return new Date(year, mm, 0); // day 0 of next month = last day
  if (dd > 31) return undefined;
  return new Date(year, mm - 1, dd);
}

/** Local YYYY-MM-DD for <input type="date"> (avoids toISOString timezone shift). */
export function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Match a parsed GTIN against a stored barcode, tolerant of EAN-13 ↔ GTIN-14
 * (a GTIN-14 is a zero-padded EAN-13). Compares digits-only, zero-padded to 14,
 * with a trailing-13-digits fallback. Never recomputes the check digit.
 */
export function gtinMatches(parsedGtin: string | undefined, storedBarcode: string | undefined): boolean {
  if (!parsedGtin || !storedBarcode) return false;
  const a = parsedGtin.replace(/\D/g, '');
  const b = storedBarcode.replace(/\D/g, '');
  if (!a || !b) return false;
  if (a.padStart(14, '0') === b.padStart(14, '0')) return true;
  // Fallback: compare the last 13 digits (tolerates a differing indicator digit).
  return a.slice(-13) === b.slice(-13);
}

const DATE_AIS = new Set(['11', '13', '15', '17']);

/**
 * Does the substring at `pos` begin a parseable known AI with a valid payload?
 * Date AIs must decode to a real date — this is what stops a batch like "BAF176"
 * being split at the "17" inside it (its trailing payload isn't a valid date).
 */
function isAiBoundary(s: string, pos: number): boolean {
  const ai = s.slice(pos, pos + 2);
  if (!KNOWN_AIS.has(ai)) return false;
  if (ai in FIXED_AI_VALUE_LEN) {
    const len = FIXED_AI_VALUE_LEN[ai];
    const val = s.slice(pos + 2, pos + 2 + len);
    if (val.length < len || !/^\d+$/.test(val)) return false;
    if (DATE_AIS.has(ai)) return decodeYYMMDD(val) !== undefined;
    return true; // 01 GTIN: 14 digits is enough
  }
  return true; // another variable AI (10/21)
}

function extractTail(tail: string): Pick<ParsedScan, 'mrp' | 'packSize' | 'productName'> {
  const out: Pick<ParsedScan, 'mrp' | 'packSize' | 'productName'> = {};
  let rest = tail;
  try {
    const m = tail.match(/Rs\.?\s*([\d,]+(?:\.\d+)?)/i);
    if (m) {
      const n = parseFloat(m[1].replace(/,/g, ''));
      if (Number.isFinite(n)) out.mrp = n;
      rest = rest.replace(m[0], ' ');
    }
  } catch { /* ignore */ }
  try {
    const tab = tail.match(/(\d+)\s*tab/i);
    const strip = tail.match(/(\d+)\s*s\b/i);
    const parts: string[] = [];
    if (tab) { parts.push(`${tab[1]} tab`); rest = rest.replace(tab[0], ' '); }
    if (strip) { parts.push(`${strip[1]}s`); rest = rest.replace(strip[0], ' '); }
    if (parts.length) out.packSize = parts.join(' / ');
  } catch { /* ignore */ }
  try {
    // Product name = the longest alphabetic token (e.g. "Rigix", "AnafortanPlus"),
    // then split camelCase. Avoids gluing stray serial letters into the name.
    const tokens = (rest.match(/[A-Za-z]{3,}/g) ?? []).sort((a, b) => b.length - a.length);
    const longest = tokens[0];
    if (longest && longest.length >= 4) {
      out.productName = longest.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').trim();
    }
  } catch { /* ignore */ }
  return out;
}

/**
 * Parse a raw scanned string. Returns structured GS1 fields plus best-effort
 * FBR-tail extraction. Never throws.
 */
export function parseScannedCode(raw: string): ParsedScan {
  const result: ParsedScan = { isStructured: false, raw };
  try {
    let s = (raw ?? '').trim();
    if (!s) return result;
    // Strip a leading symbology identifier, e.g. ]d2 (DataMatrix), ]Q3 (QR), ]C1.
    s = s.replace(/^\][A-Za-z]\d/, '');

    let i = 0;
    while (i < s.length) {
      if (s[i] === GS) { i += 1; continue; }
      const ai = s.slice(i, i + 2);

      if (ai in FIXED_AI_VALUE_LEN) {
        const len = FIXED_AI_VALUE_LEN[ai];
        const val = s.slice(i + 2, i + 2 + len);
        if (val.length < len || !/^\d+$/.test(val)) break; // malformed → stop, rest is tail
        if (ai === '01') result.gtin = val;
        else if (ai === '11') result.manufactureDate = decodeYYMMDD(val);
        else if (ai === '17') result.expiryDate = decodeYYMMDD(val);
        // 13/15 parsed-but-unmapped (advance cursor)
        i += 2 + len;
        continue;
      }

      if (VARIABLE_AIS.has(ai)) {
        let j = i + 2;
        // End at GS, the next AI boundary, or the 20-char cap.
        while (j < s.length && s[j] !== GS && (j - (i + 2)) < MAX_VARIABLE_LEN && !isAiBoundary(s, j)) {
          j += 1;
        }
        const val = s.slice(i + 2, j);
        if (ai === '10') result.batchNumber = val || undefined;
        else if (ai === '21') result.serial = val || undefined;
        i = s[j] === GS ? j + 1 : j;
        continue;
      }

      // Unknown AI → the remainder is the FBR human-readable tail.
      break;
    }

    if (i < s.length) {
      Object.assign(result, extractTail(s.slice(i)));
    }

    // FBR fallback: these codes embed a price ("Rs. 390.00") and a product
    // name/pack in a human-readable tail that the AI walk can mangle (e.g. the
    // "10" inside "Rigix10tab" looks like AI 10). When a price is present, mine
    // MRP / pack / name from the WHOLE string to fill anything missing.
    if (/Rs\.?\s*\d/i.test(s)) {
      const t = extractTail(s);
      if (result.mrp == null) result.mrp = t.mrp;
      if (!result.packSize) result.packSize = t.packSize;
      if (!result.productName) result.productName = t.productName;
    }

    // Drop a batch that clearly captured tail garbage (price/pack/spaces/dots).
    if (result.batchNumber && (/[.\s]/.test(result.batchNumber) || /rs|tab/i.test(result.batchNumber) || result.batchNumber.length > 15)) {
      result.batchNumber = undefined;
    }

    // "Structured" means we parsed a real GS1 AI or a distinctive MRP token — a
    // bare product name (free letters) or a plain numeric barcode does not count.
    result.isStructured = Boolean(
      result.gtin || result.batchNumber || result.expiryDate ||
      result.manufactureDate || result.serial || result.mrp,
    );
  } catch {
    return { isStructured: false, raw };
  }
  return result;
}
