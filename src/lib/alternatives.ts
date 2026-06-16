// Feature 5 — therapeutic alternatives for a salt/generic. Combines the brands
// we already stock with same-generic brands from the shared DRAP catalog,
// flagging which are in stock so staff can offer a substitute for a medicine we
// don't have. (Pharmapedia was unreachable from server IPs, so this is built on
// the DRAP-fed shared catalog instead.)
import type { Medicine } from '@/types';
import type { CatalogProduct } from '@/lib/backend';

export interface Alternative {
  key: string;
  brand: string;
  genericName?: string;
  strength?: string;
  dosageForm?: string;
  manufacturer?: string;
  source: 'stock' | 'catalog';
  inStock: boolean;
  stockQty: number;
  medicineId?: string;
  drapRegNo?: string;
}

const norm = (s: string | undefined) => (s ?? '').toLowerCase().trim();
/** A loose two-way generic match (so "Paracetamol" matches "Paracetamol 500mg"). */
function genericMatches(a: string | undefined, target: string): boolean {
  const x = norm(a), t = norm(target);
  if (!x || !t) return false;
  return x === t || x.includes(t) || t.includes(x);
}

export function mergeAlternatives(opts: {
  generic: string;
  ourMedicines: Medicine[];
  stockOf: (medicineId: string) => number;
  catalog: CatalogProduct[];
  excludeMedicineId?: string;
}): Alternative[] {
  const { generic, ourMedicines, stockOf, catalog, excludeMedicineId } = opts;
  const out: Alternative[] = [];
  const seenBrand = new Set<string>();

  // Brands we stock with the same generic (live stock).
  for (const m of ourMedicines) {
    if (m.id === excludeMedicineId) continue;
    if (!genericMatches(m.genericName, generic)) continue;
    const brandKey = norm(m.brandName || m.name);
    if (seenBrand.has(brandKey)) continue;
    seenBrand.add(brandKey);
    const qty = stockOf(m.id);
    out.push({
      key: `stock-${m.id}`,
      brand: m.brandName || m.name,
      genericName: m.genericName,
      strength: m.strength,
      dosageForm: m.dosageForm,
      manufacturer: m.manufacturer,
      source: 'stock',
      inStock: qty > 0,
      stockQty: qty,
      medicineId: m.id,
    });
  }

  // Same-generic brands from the shared catalog that we don't already list.
  for (const c of catalog) {
    const brandKey = norm(c.brand);
    if (!brandKey || seenBrand.has(brandKey)) continue;
    seenBrand.add(brandKey);
    out.push({
      key: `cat-${c.id}`,
      brand: c.brand,
      genericName: c.genericName,
      strength: c.strength,
      dosageForm: c.dosageForm,
      manufacturer: c.manufacturer,
      source: 'catalog',
      inStock: false,
      stockQty: 0,
      drapRegNo: c.drapRegNo,
    });
  }

  // In-stock first, then stocked-but-empty, then catalog; alphabetical within.
  return out.sort((a, b) => {
    const rank = (x: Alternative) => (x.inStock ? 0 : x.source === 'stock' ? 1 : 2);
    return rank(a) - rank(b) || a.brand.localeCompare(b.brand);
  });
}
