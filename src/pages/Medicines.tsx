import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSettingsStore, useInventoryStore, useSupplierStore, useSalesStore } from '@/store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { importFromCSV } from '@/lib/csv';
import { ImportHelpPopover } from '@/components/ImportHelpPopover';
import { toast } from 'sonner';
import { fbrApi, FBR_SALE_TYPE_LABELS, type FbrUom, searchCatalog, fetchDrapProduct, fetchCatalogByGtin, searchDrap, type CatalogProduct, type DrapCandidate } from '@/lib/backend';
import { processUploadedFile } from '@/lib/image';
import { parseScannedCode, toDateInputValue } from '@/lib/gs1';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Search,
  Plus,
  Check,
  Pill,
  Barcode,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  Package,
  Filter,
  Upload,
  Save,
  X,
  AlertCircle,
  Globe,
  ScanLine,
  Sparkles,
  ImagePlus,
  Loader2,
} from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import type { Medicine, MedicineCategory, DosageForm, MedicineUnit, Batch } from '@/types';

const categories: { value: MedicineCategory; label: string }[] = [
  { value: 'tablets', label: 'Tablets' },
  { value: 'capsules', label: 'Capsules' },
  { value: 'caplets', label: 'Caplets' },
  { value: 'syrups', label: 'Syrups' },
  { value: 'injections', label: 'Injections' },
  { value: 'ampoules', label: 'Ampoules' },
  { value: 'infusions', label: 'Infusions' },
  { value: 'drops', label: 'Drops' },
  { value: 'creams', label: 'Creams' },
  { value: 'ointments', label: 'Ointments' },
  { value: 'inhalers', label: 'Inhalers' },
  { value: 'powders', label: 'Powders' },
  { value: 'granules', label: 'Granules' },
  { value: 'supplements', label: 'Supplements' },
  { value: 'surgical', label: 'Surgical' },
  { value: 'medical_instruments', label: 'Medical Instruments' },
  { value: 'medical_devices', label: 'Medical Devices' },
  { value: 'personal_care', label: 'Personal Care' },
  { value: 'baby_care', label: 'Baby Care' },
  { value: 'shampoo', label: 'Shampoo' },
  { value: 'soap', label: 'Soap' },
  { value: 'cosmetics', label: 'Cosmetics' },
  { value: 'beauty_products', label: 'Beauty Products' },
  { value: 'groceries', label: 'Groceries' },
  { value: 'food_beverages', label: 'Food & Beverages' },
  { value: 'packaged_foods', label: 'Packaged Foods' },
  { value: 'otc', label: 'OTC' },
];

const dosageForms: { value: DosageForm; label: string }[] = [
  { value: 'tablet', label: 'Tablet' },
  { value: 'caplet', label: 'Caplet' },
  { value: 'capsule', label: 'Capsule' },
  { value: 'syrup', label: 'Syrup' },
  { value: 'injection', label: 'Injection' },
  { value: 'ampoule', label: 'Ampoule' },
  { value: 'infusion', label: 'Infusion' },
  { value: 'drop', label: 'Drop' },
  { value: 'cream', label: 'Cream' },
  { value: 'ointment', label: 'Ointment' },
  { value: 'inhaler', label: 'Inhaler' },
  { value: 'powder', label: 'Powder' },
  { value: 'granules', label: 'Granules' },
  { value: 'suspension', label: 'Suspension' },
  { value: 'solution', label: 'Solution' },
  { value: 'gel', label: 'Gel' },
  { value: 'lotion', label: 'Lotion' },
  { value: 'spray', label: 'Spray' },
  { value: 'patch', label: 'Patch' },
  { value: 'surgical', label: 'Surgical' },
  { value: 'medical_instrument', label: 'Medical Instrument' },
  { value: 'shampoo', label: 'Shampoo' },
  { value: 'soap', label: 'Soap' },
  { value: 'cosmetics', label: 'Cosmetics' },
  { value: 'beauty_products', label: 'Beauty Products' },
  { value: 'groceries', label: 'Groceries / Grocery Food' },
  { value: 'food_beverages', label: 'Food & Beverages (F&B)' },
  { value: 'packaged_foods', label: 'Packaged Foods' },
];

// Category is the same thing as dosage form (just the plural family), so we no
// longer ask for it separately — derive it from the dosage form.
function deriveCategory(dosageForm?: string): MedicineCategory {
  const map: Record<string, MedicineCategory> = {
    tablet: 'tablets', caplet: 'caplets', capsule: 'capsules', syrup: 'syrups',
    injection: 'injections', ampoule: 'ampoules', infusion: 'infusions', drop: 'drops',
    cream: 'creams', ointment: 'ointments', inhaler: 'inhalers', powder: 'powders',
    granules: 'granules', suspension: 'suspensions', solution: 'solutions',
    gel: 'creams', lotion: 'creams', spray: 'solutions', patch: 'otc',
    surgical: 'surgical', medical_instrument: 'medical_instruments',
    shampoo: 'shampoo', soap: 'soap',
    cosmetics: 'cosmetics', beauty_products: 'beauty_products',
    groceries: 'groceries', food_beverages: 'food_beverages', packaged_foods: 'packaged_foods',
  };
  return map[(dosageForm ?? '').toLowerCase()] ?? 'otc';
}

// Stock display: shows current stock in pack-unit hierarchy (e.g. "5 box / 50 strip / 500 tabs").
function StockCell({ medicine, batches }: { medicine: Medicine; batches: { medicineId: string; quantity: number; isActive: boolean }[] }) {
  const totalBase = batches
    .filter((b) => b.medicineId === medicine.id && b.isActive)
    .reduce((s, b) => s + (b.quantity ?? 0), 0);
  const cat = categorize(medicine.dosageForm);
  const baseLabel = cat === 'tablet' ? (medicine.dosageForm === 'capsule' ? 'cap' : 'tab')
    : cat === 'liquid' ? 'ml' : cat === 'tube' ? 'g' : cat === 'injection' ? 'ml' : cat === 'sachet' ? 'g' : cat === 'inhaler' ? 'dose' : 'unit';

  const units = medicine.units ?? [];
  const sub = units.find((u) => !u.isBaseUnit && (u.name?.toLowerCase().includes('strip') || u.name?.toLowerCase().includes('bottle') || u.name?.toLowerCase().includes('tube') || u.name?.toLowerCase().includes('vial') || u.name?.toLowerCase().includes('sachet') || u.name?.toLowerCase().includes('inhaler')));
  const master = units.find((u) => !u.isBaseUnit && (u.name?.toLowerCase().includes('box') || u.name?.toLowerCase().includes('carton')));

  if (totalBase === 0) {
    return <span className="text-red-600 text-xs font-medium">Out of stock</span>;
  }

  const isLow = medicine.reorderLevel > 0 && totalBase <= medicine.reorderLevel;
  let breakdown = '';
  let remaining = totalBase;
  if (master && master.multiplier > 0 && remaining >= master.multiplier) {
    const boxes = Math.floor(remaining / master.multiplier);
    remaining = remaining % master.multiplier;
    breakdown += `${boxes} ${master.name}`;
  }
  if (sub && sub.multiplier > 0 && remaining >= sub.multiplier) {
    const subs = Math.floor(remaining / sub.multiplier);
    remaining = remaining % sub.multiplier;
    if (breakdown) breakdown += ', ';
    breakdown += `${subs} ${sub.name}`;
  }
  if (remaining > 0) {
    if (breakdown) breakdown += ', ';
    breakdown += `${remaining} ${baseLabel}`;
  }

  return (
    <div className={cn('text-xs', isLow ? 'text-amber-700' : 'text-gray-700')}>
      <div className="font-semibold">{totalBase.toLocaleString()} {baseLabel}</div>
      {breakdown && <div className="text-gray-500">{breakdown}</div>}
      {isLow && <div className="text-amber-700 font-medium">⚠ Low stock</div>}
    </div>
  );
}

// Form-aware packaging hierarchy. Each dosage form has its own structure:
//   tablet/capsule  → 3 levels: Box → Strip → Tablet,   loose sale OK
//   syrup/drops     → 2 levels: Carton → Bottle (Xml),  no loose sale
//   cream/ointment  → 2 levels: Carton → Tube (Xg),     no loose sale
//   injection       → 2 levels: Box → Ampoule (Xml),    loose sale OK, cold-storage hint
//   inhaler/spray   → 2 levels: Carton → Inhaler (Xpuffs), no loose sale
//   sachet/powder   → 2 levels: Box → Sachet (Xg),      loose sale OK
type FormCategory = 'tablet' | 'liquid' | 'tube' | 'injection' | 'sachet' | 'inhaler' | 'retail' | 'generic';
function categorize(dosageForm?: string): FormCategory {
  const f = (dosageForm ?? '').toLowerCase();
  if (['tablet', 'caplet', 'capsule'].includes(f)) return 'tablet';
  if (['syrup', 'suspension', 'solution', 'drops', 'shampoo'].includes(f)) return 'liquid';
  if (['cream', 'ointment', 'gel', 'lotion', 'soap'].includes(f)) return 'tube';
  if (['injection', 'ampoule', 'infusion'].includes(f)) return 'injection';
  if (['powder', 'granules'].includes(f)) return 'sachet';
  if (['patch'].includes(f)) return 'sachet';
  if (['spray', 'inhaler'].includes(f)) return 'inhaler';
  // Non-medicine retail lines — sold per piece, optionally by the pack.
  if (['cosmetics', 'beauty_products', 'groceries', 'food_beverages', 'packaged_foods'].includes(f)) return 'retail';
  return 'generic';
}

interface FormVocab {
  base: string;            // "tablet", "bottle", "tube", "ampoule", "inhaler", "sachet"
  sub?: string;            // only for tablets: "strip"
  master?: string;         // "box" or "carton"
  subQtyLabel?: string;
  masterQtyLabel?: string;
  contentLabel?: string;   // descriptive volume/weight: "ml per bottle", "g per tube", "puffs per inhaler"
  contentUnit?: string;    // "ml", "g", "puffs"
  looseSale: boolean;      // can the customer buy a single base unit?
  coldStorage?: boolean;   // hint for injections
}

function getVocab(cat: FormCategory, dosageForm?: string): FormVocab {
  const isCapsule = dosageForm === 'capsule';
  switch (cat) {
    case 'tablet':
      return { base: isCapsule ? 'capsule' : 'tablet', sub: 'strip', master: 'box',
        subQtyLabel: isCapsule ? 'capsules per strip' : 'tablets per strip',
        masterQtyLabel: 'strips per box', looseSale: true };
    case 'liquid':
      return { base: 'bottle', master: 'carton', masterQtyLabel: 'bottles per carton',
        contentLabel: 'ml per bottle', contentUnit: 'ml', looseSale: false };
    case 'tube':
      return { base: 'tube', master: 'carton', masterQtyLabel: 'tubes per carton',
        contentLabel: 'grams per tube', contentUnit: 'g', looseSale: false };
    case 'injection':
      return { base: 'ampoule', master: 'box', masterQtyLabel: 'ampoules per box',
        contentLabel: 'ml per ampoule (optional)', contentUnit: 'ml', looseSale: true, coldStorage: true };
    case 'sachet':
      return { base: 'sachet', master: 'box', masterQtyLabel: 'sachets per box',
        contentLabel: 'grams per sachet (optional)', contentUnit: 'g', looseSale: true };
    case 'inhaler':
      return { base: 'inhaler', master: 'carton', masterQtyLabel: 'inhalers per carton',
        contentLabel: 'puffs per inhaler', contentUnit: 'puffs', looseSale: false };
    case 'retail':
      return { base: 'piece', master: 'pack', masterQtyLabel: 'pieces per pack', looseSale: true };
    default:
      return { base: 'unit', looseSale: true };
  }
}

function SaleUnitsSection({ formData, setFormData }: { formData: Partial<Medicine>; setFormData: (m: Partial<Medicine>) => void }) {
  const cat = categorize(formData.dosageForm);
  const v = getVocab(cat, formData.dosageForm);

  const units = formData.units ?? [];
  const subUnit = v.sub ? units.find((u) => !u.isBaseUnit && u.name?.toLowerCase() === v.sub) : undefined;
  const masterUnit = v.master ? units.find((u) => !u.isBaseUnit && u.name?.toLowerCase() === v.master) : undefined;
  const subQty = subUnit?.multiplier ?? 0;
  // For 3-level forms (tablet): masterMult = subQty * stripsPerBox
  // For 2-level forms: masterMult is just N base units per master
  const masterMult = masterUnit?.multiplier ?? 0;
  const masterCountFromSub = v.sub && subQty > 0 ? Math.round(masterMult / subQty) : masterMult;

  const writeUnits = (newUnits: typeof units) => {
    // Auto-derive packSize for display
    let packSize = '';
    if (v.sub && subQty && masterCountFromSub) {
      packSize = `${subQty}×${masterCountFromSub} ${v.base}s per ${v.master}`;
    } else if (v.sub && subQty) {
      packSize = `${subQty} ${v.base}s per ${v.sub}`;
    } else if (masterMult) {
      packSize = `${masterMult} ${v.base}s per ${v.master}`;
    }
    setFormData({ ...formData, units: newUnits, unit: newUnits[0]?.name ?? v.base, packSize });
  };

  const ensureBase = (list: typeof units) => {
    if (list.length === 0 || !list[0].isBaseUnit) {
      return [{ id: 'unit-base', name: v.base, abbreviation: v.base, multiplier: 1, isBaseUnit: true, isActive: true, salePrice: undefined }, ...list];
    }
    return [{ ...list[0], name: v.base, abbreviation: v.base }, ...list.slice(1)];
  };

  const setSubQty = (qty: number) => {
    let list = ensureBase([...units]);
    list = list.filter((u) => u.id !== subUnit?.id);
    if (qty > 0 && v.sub) {
      list.push({ id: subUnit?.id ?? `unit-sub-${Date.now()}`, name: v.sub, abbreviation: v.sub, multiplier: qty, isBaseUnit: false, isActive: true, salePrice: subUnit?.salePrice });
    }
    // Recompute master if it exists
    if (masterUnit && qty > 0 && masterCountFromSub > 0) {
      const idx = list.findIndex((u) => u.id === masterUnit.id);
      if (idx !== -1) list[idx] = { ...masterUnit, multiplier: qty * masterCountFromSub };
    }
    writeUnits(list);
  };

  const setMasterQty = (qty: number) => {
    let list = ensureBase([...units]);
    list = list.filter((u) => u.id !== masterUnit?.id);
    if (qty > 0 && v.master) {
      // For 3-level: master multiplier = subQty × qty (count of subs per master)
      // For 2-level: master multiplier = qty (count of bases per master)
      const multiplier = v.sub ? subQty * qty : qty;
      if (multiplier > 0) {
        list.push({ id: masterUnit?.id ?? `unit-master-${Date.now()}`, name: v.master, abbreviation: v.master, multiplier, isBaseUnit: false, isActive: true, salePrice: masterUnit?.salePrice });
      }
    }
    writeUnits(list);
  };

  if (cat === 'generic' || !v.master) {
    return (
      <div>
        <div className="border-b pb-2 mb-3">
          <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Packaging &amp; Sale</h4>
          <p className="text-xs text-gray-500 mt-0.5">Pick a Dosage Form above to get smart packaging options</p>
        </div>
        <div className="p-4 rounded-lg bg-gray-50 border text-sm text-gray-600">
          Pick the Dosage Form (tablet, syrup, cream, injection…) in Basic Information first.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="border-b pb-2 mb-3">
        <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Packaging</h4>
        <p className="text-xs text-gray-500 mt-0.5">How this medicine is packaged. Stock is counted in <strong>{v.base}s</strong>.</p>
      </div>

      {/* Cold storage hint for injections */}
      {v.coldStorage && (
        <div className="p-2 rounded-lg bg-cyan-50 border border-cyan-200 text-xs text-cyan-900 mb-3 flex items-center gap-2">
          <span>❄️</span>
          <span>Many injections require cold storage (2–8°C). Note this in <strong>Storage Instructions</strong> above if applicable.</span>
        </div>
      )}

      {/* Base unit info card */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200 mb-3">
        <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-emerald-900">Inventory unit: 1 {v.base}</p>
          <p className="text-xs text-emerald-700">
            {v.looseSale
              ? `One ${v.base} is the smallest sellable unit.`
              : `Customers cannot buy a fraction — they always buy the whole ${v.base}.`}
          </p>
        </div>
      </div>

      {/* Optional volume/weight content (descriptive, for non-tablet forms) */}
      {v.contentLabel && (
        <div className="p-3 rounded-lg border bg-white mb-3">
          <Label className="text-sm">{v.contentLabel}</Label>
          <div className="flex gap-2 mt-1.5 items-center">
            <Input
              type="number" min={0} step="0.01"
              placeholder={cat === 'liquid' ? '120' : cat === 'tube' ? '30' : cat === 'inhaler' ? '200' : cat === 'injection' ? '5' : '1'}
              value={(formData as { unitContentValue?: number }).unitContentValue ?? formData.packSize?.match(/^(\d+(?:\.\d+)?)/)?.[1] ?? ''}
              onChange={(e) => setFormData({ ...formData, packSize: e.target.value ? `${e.target.value}${v.contentUnit} ${v.base}` + (masterMult > 0 ? `, ${masterCountFromSub} per ${v.master}` : '') : '' })}
              className="flex-1"
            />
            <span className="text-sm text-gray-500 px-2">{v.contentUnit}</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">Descriptive — does NOT change inventory math (stock stays in {v.base}s)</p>
        </div>
      )}

      {/* Pack quantities (tablets per strip, strips per box) are set in the
          Pricing section below — pick the unit you price in, then the quantity. */}

      {/* Summary */}
      {(subQty > 0 || masterMult > 0) && (
        <div className="mt-3 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm">
          <p className="font-semibold text-blue-900 mb-1">📦 Inventory model</p>
          <ul className="text-xs text-blue-800 space-y-0.5">
            <li>• Stock is counted in <strong>{v.base}s</strong></li>
            {v.sub && subQty > 0 && <li>• Selling 1 {v.sub} deducts <strong>{subQty} {v.base}{subQty === 1 ? '' : 's'}</strong></li>}
            {masterMult > 0 && <li>• Selling 1 {v.master} deducts <strong>{masterMult} {v.base}{masterMult === 1 ? '' : 's'}</strong></li>}
            {masterMult > 0 && <li>• Buying 5 {v.master}s adds <strong>{masterMult * 5} {v.base}s</strong> to inventory</li>}
            {!v.looseSale && <li>• ⚠ Loose sale disabled — customers always buy a whole {v.base}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

// Pricing section — consolidates all sale prices in ONE place, reads from packaging hierarchy
function PricingSection({ formData, setFormData, level, onLevelChange }: { formData: Partial<Medicine>; setFormData: (m: Partial<Medicine>) => void; level: 'base' | 'sub' | 'master'; onLevelChange: (l: 'base' | 'sub' | 'master') => void }) {
  const cat = categorize(formData.dosageForm);
  const v = getVocab(cat, formData.dosageForm);
  const baseLabel = v.base;
  const units = formData.units ?? [];
  const baseUnit = units.find((u) => u.isBaseUnit) ?? units[0];
  const subUnit = v.sub ? units.find((u) => !u.isBaseUnit && u.name?.toLowerCase() === v.sub) : undefined;
  const masterUnit = v.master ? units.find((u) => !u.isBaseUnit && u.name?.toLowerCase() === v.master) : undefined;
  const looseSaleAllowed = v.looseSale && (formData.allowLooseSale ?? true);

  // Units available for per-unit pricing (base → sub → master), driven by the
  // dosage form. Used by the MRP unit selector.
  // Packaging math (same as the Packaging section — multipliers live on units).
  const subQty = subUnit?.multiplier ?? 0;
  const masterMult = masterUnit?.multiplier ?? 0;
  const masterCountFromSub = v.sub && subQty > 0 ? Math.round(masterMult / subQty) : masterMult;

  // The pricing LEVELS available for this dosage form (tablet → strip → box,
  // syrup → bottle → box, ampoule → ampoule → box, …). The user picks the unit
  // they price in FIRST, then the relevant packaging quantity appears.
  const levels = [
    { key: 'base' as const, name: v.base },
    ...(v.sub ? [{ key: 'sub' as const, name: v.sub }] : []),
    ...(v.master ? [{ key: 'master' as const, name: v.master }] : []),
  ];
  // Pricing level is owned by the parent so the Stock Thresholds section can
  // default its unit to the same "I price this per" choice.
  const mrpLevel = level;
  const setMrpLevel = onLevelChange;
  const levelMult = mrpLevel === 'base' ? 1 : mrpLevel === 'sub' ? (subQty || 1) : (masterMult || 1);
  const levelName = levels.find((l) => l.key === mrpLevel)?.name ?? v.base;

  // MRP typed AT the chosen level is the source of truth; it does NOT change when
  // packaging multipliers change — instead the stored per-base mrp is adjusted.
  const [mrpValue, setMrpValue] = useState<string>(() => (formData.mrp != null ? String(formData.mrp) : ''));
  const lastBaseRef = useRef<number | undefined>(formData.mrp ?? undefined);
  // Until the user types a sale price, sale prices track MRP (sell-at-MRP). Once
  // they edit one, MRP stops overriding and editing any price cascades to all.
  const [saleTouched, setSaleTouched] = useState<boolean>(() => (formData.units ?? []).some((u) => u.salePrice != null));

  // Set every unit's sale price from a single per-base value (keeps them in sync).
  const priceUnitsAt = (list: MedicineUnit[], base: number | undefined) =>
    list.map((u) => ({ ...u, salePrice: base != null ? Number((base * u.multiplier).toFixed(2)) : undefined }));

  const applyMrp = (raw: string) => {
    setMrpValue(raw);
    const val = parseFloat(raw);
    if (raw === '' || !Number.isFinite(val)) { lastBaseRef.current = undefined; setFormData({ ...formData, mrp: undefined }); return; }
    const base = levelMult > 0 ? Number((val / levelMult).toFixed(4)) : val;
    lastBaseRef.current = base;
    // Sale prices follow MRP across ALL units (consistent) until the user edits one.
    const list = saleTouched ? units : priceUnitsAt(units, base);
    setFormData({ ...formData, mrp: base, units: list });
  };

  // Trade price — the discount floor salesmen can't sell below (shown on POS when
  // enabled in Settings → POS price visibility). Entered at the selected unit,
  // stored per-base, and kept constant when packaging changes.
  const [tradeValue, setTradeValue] = useState<string>(() => (formData.tradePrice != null ? String(formData.tradePrice) : ''));
  const applyTrade = (raw: string) => {
    setTradeValue(raw);
    const val = parseFloat(raw);
    const base = raw === '' || !Number.isFinite(val) ? undefined : (levelMult > 0 ? Number((val / levelMult).toFixed(4)) : val);
    setFormData({ ...formData, tradePrice: base });
  };
  useEffect(() => {
    const tv = parseFloat(tradeValue);
    if (Number.isFinite(tv) && levelMult > 0) {
      const base = Number((tv / levelMult).toFixed(4));
      if (formData.tradePrice !== base) setFormData({ ...formData, tradePrice: base });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelMult]);

  // Packaging changed → keep the typed per-unit MRP constant, adjust the base.
  useEffect(() => {
    const val = parseFloat(mrpValue);
    if (Number.isFinite(val) && levelMult > 0) {
      const base = Number((val / levelMult).toFixed(4));
      // Keep MRP-per-unit constant; refresh MRP-tracking sale prices to the new packaging.
      const list = saleTouched ? (formData.units ?? []) : priceUnitsAt(formData.units ?? [], base);
      if (formData.mrp !== base || !saleTouched) { lastBaseRef.current = base; setFormData({ ...formData, mrp: base, units: list }); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelMult]);

  // External mrp (e.g. scanned FBR QR) → reflect at the selected level.
  useEffect(() => {
    if (formData.mrp === lastBaseRef.current) return;
    if (formData.mrp != null && levelMult > 0) setMrpValue(String(Number((formData.mrp * levelMult).toFixed(2))));
    else if (formData.mrp == null) setMrpValue('');
    lastBaseRef.current = formData.mrp ?? undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.mrp]);

  // Packaging editors (relocated here so the flow is: pick unit → qty per pack → price).
  const ensureBase = (list: MedicineUnit[]): MedicineUnit[] =>
    (list.length === 0 || !list[0].isBaseUnit)
      ? [{ id: 'unit-base', name: v.base, abbreviation: v.base, multiplier: 1, isBaseUnit: true, isActive: true, salePrice: undefined }, ...list]
      : [{ ...list[0], name: v.base, abbreviation: v.base }, ...list.slice(1)];
  const writeUnits = (newUnits: MedicineUnit[]) => setFormData({ ...formData, units: newUnits, unit: newUnits[0]?.name ?? v.base });
  const setSubQty = (qty: number) => {
    let list = ensureBase([...units]).filter((u) => u.id !== subUnit?.id);
    if (qty > 0 && v.sub) list.push({ id: subUnit?.id ?? `unit-sub-${Date.now()}`, name: v.sub, abbreviation: v.sub, multiplier: qty, isBaseUnit: false, isActive: true, salePrice: subUnit?.salePrice });
    if (masterUnit && qty > 0 && masterCountFromSub > 0) {
      const idx = list.findIndex((u) => u.id === masterUnit.id);
      if (idx !== -1) list[idx] = { ...masterUnit, multiplier: qty * masterCountFromSub };
    }
    writeUnits(list);
  };
  const setMasterQty = (qty: number) => {
    let list = ensureBase([...units]).filter((u) => u.id !== masterUnit?.id);
    if (qty > 0 && v.master) {
      const multiplier = v.sub ? subQty * qty : qty;
      if (multiplier > 0) list.push({ id: masterUnit?.id ?? `unit-master-${Date.now()}`, name: v.master, abbreviation: v.master, multiplier, isBaseUnit: false, isActive: true, salePrice: masterUnit?.salePrice });
    }
    writeUnits(list);
  };

  // Each sale price is edited INDEPENDENTLY — defaults are derived from MRP, but
  // the owner can override any single one (e.g. a higher per-tablet/loose price)
  // without it cascading to the strip/box prices. "Set all to MRP" re-syncs them.
  const setPrice = (id: string | undefined, price: number | undefined) => {
    if (!id) return;
    setSaleTouched(true);
    setFormData({ ...formData, units: units.map((u) => (u.id === id ? { ...u, salePrice: price } : u)) });
  };

  return (
    <div>
      <div className="border-b pb-2 mb-3">
        <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Pricing</h4>
        <p className="text-xs text-gray-500 mt-0.5">All sale prices in one place. MRP is the legal printed maximum price.</p>
      </div>

      {/* Step 1 — pick the unit you price/sell in. */}
      <div className="mb-3 flex items-center gap-2 flex-wrap">
        <Label className="m-0">I price this per</Label>
        <Select value={mrpLevel} onValueChange={(val) => setMrpLevel(val as 'base' | 'sub' | 'master')}>
          <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {levels.map((l) => <SelectItem key={l.key} value={l.key}>{l.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Step 2 — the packaging quantity needed for the chosen unit. */}
      {(mrpLevel === 'sub' || mrpLevel === 'master') && v.sub && (
        <div className="p-3 rounded-lg border bg-white mb-3">
          <Label className="text-sm">{v.subQtyLabel}</Label>
          <Input type="number" min={0} className="mt-1.5" placeholder="10"
            value={subQty || ''} onChange={(e) => setSubQty(parseInt(e.target.value) || 0)} />
          {subQty > 0 && <p className="text-xs text-blue-700 mt-2">✓ 1 {v.sub} = <strong>{subQty} {v.base}{subQty === 1 ? '' : 's'}</strong></p>}
        </div>
      )}
      {mrpLevel === 'master' && v.master && (
        <div className="p-3 rounded-lg border bg-white mb-3">
          <Label className="text-sm">{v.masterQtyLabel}</Label>
          <Input type="number" min={0} className="mt-1.5" placeholder="10"
            value={masterCountFromSub || ''} onChange={(e) => setMasterQty(parseInt(e.target.value) || 0)} />
          {masterMult > 0 && (
            <p className="text-xs text-blue-700 mt-2">✓ 1 {v.master} = {v.sub ? `${masterCountFromSub} ${v.sub}s = ` : ''}<strong>{masterMult} {v.base}{masterMult === 1 ? '' : 's'}</strong></p>
          )}
        </div>
      )}

      {/* Step 3 — MRP at the chosen unit (stays fixed when packaging changes). */}
      <div className="mb-3 space-y-1.5">
        <Label>MRP <span className="text-xs font-normal text-gray-500">(per {levelName} — legal printed max price)</span></Label>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">PKR</span>
          <Input type="number" step="0.01" placeholder="0" className="w-32 h-9"
            value={mrpValue} onChange={(e) => applyMrp(e.target.value)} />
          <span className="text-xs text-gray-400">per {levelName}</span>
        </div>
      </div>

      {/* Trade price — optional discount floor for salesmen (per the selected unit). */}
      <div className="mb-4 space-y-1.5">
        <Label>Trade Price <span className="text-xs font-normal text-gray-500">(per {levelName} — optional; min price salesmen can discount to)</span></Label>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">PKR</span>
          <Input type="number" step="0.01" placeholder="0" className="w-32 h-9"
            value={tradeValue} onChange={(e) => applyTrade(e.target.value)} />
          <span className="text-xs text-gray-400">per {levelName}</span>
        </div>
      </div>

      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-medium text-gray-700">Sale Prices</p>
        {formData.mrp != null && (
          <button
            type="button"
            className="text-xs text-blue-600 hover:underline"
            onClick={() => { setSaleTouched(false); setFormData({ ...formData, units: priceUnitsAt(units, formData.mrp!) }); }}
          >
            Set all to MRP
          </button>
        )}
      </div>
      <p className="text-xs text-gray-500 mb-2">Auto-filled from MRP — edit any one independently (e.g. a higher per-{baseLabel} price). Use “Set all to MRP” to re-sync.</p>
      <div className="space-y-2">
        {/* Loose price (only if form-allows + toggle on) */}
        {looseSaleAllowed && baseUnit && (
          <div className="flex items-center gap-3 p-3 rounded-lg border bg-gray-50">
            <div className="flex-1">
              <p className="text-sm font-medium">Per {baseLabel} (loose)</p>
              <p className="text-xs text-gray-500">Customer buys a single {baseLabel}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">PKR</span>
              <Input
                type="number" min={0} className="w-28 h-9"
                placeholder="0"
                value={baseUnit.salePrice ?? ''}
                onChange={(e) => setPrice(baseUnit.id, e.target.value ? parseFloat(e.target.value) : undefined)}
              />
            </div>
          </div>
        )}

        {/* Sub pack price */}
        {subUnit && (
          <div className="flex items-center gap-3 p-3 rounded-lg border bg-gray-50">
            <div className="flex-1">
              <p className="text-sm font-medium">Per {subUnit.name} ({subUnit.multiplier} {baseLabel}s)</p>
              <p className="text-xs text-gray-500">Customer buys a whole {subUnit.name}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">PKR</span>
              <Input
                type="number" min={0} className="w-28 h-9"
                placeholder="0"
                value={subUnit.salePrice ?? ''}
                onChange={(e) => setPrice(subUnit.id, e.target.value ? parseFloat(e.target.value) : undefined)}
              />
            </div>
          </div>
        )}

        {/* Master pack price */}
        {masterUnit && (
          <div className="flex items-center gap-3 p-3 rounded-lg border bg-gray-50">
            <div className="flex-1">
              <p className="text-sm font-medium">Per {masterUnit.name} ({masterUnit.multiplier} {baseLabel}s)</p>
              <p className="text-xs text-gray-500">Customer buys a whole {masterUnit.name}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">PKR</span>
              <Input
                type="number" min={0} className="w-28 h-9"
                placeholder="0"
                value={masterUnit.salePrice ?? ''}
                onChange={(e) => setPrice(masterUnit.id, e.target.value ? parseFloat(e.target.value) : undefined)}
              />
            </div>
          </div>
        )}
      </div>

      {v.looseSale ? (
        <div className="flex items-center space-x-2 mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
          <Checkbox
            id="loose-sale"
            checked={formData.allowLooseSale ?? true}
            onCheckedChange={(checked) => setFormData({ ...formData, allowLooseSale: checked as boolean })}
          />
          <div className="flex-1">
            <Label htmlFor="loose-sale" className="cursor-pointer">Allow loose sale (single {baseLabel}s)</Label>
            <p className="text-xs text-gray-600">If unchecked, customers can only buy whole {subUnit?.name ?? masterUnit?.name ?? 'packs'}</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center space-x-2 mt-4 p-3 rounded-lg bg-gray-50 border border-gray-200">
          <span className="text-gray-500">🔒</span>
          <div className="flex-1">
            <p className="text-sm text-gray-700">Loose sale not applicable for {formData.dosageForm}s</p>
            <p className="text-xs text-gray-500">Customers always buy a whole {baseLabel}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// Opening Stock — captured ONLY when adding a new medicine. After that, stock changes go through Purchase Orders.
interface OpeningStock {
  enabled: boolean;
  quantity: string;
  unit: 'base' | 'sub' | 'master';
  batchNumber: string;
  expiryDate: string;
  manufacturingDate: string;
  purchasePricePerBase: string;
  supplierId: string;
}

function OpeningStockSection({ formData, opening, setOpening, mappedSupplierName }: {
  formData: Partial<Medicine>;
  opening: OpeningStock;
  setOpening: (o: OpeningStock) => void;
  /** Name of the distributor this opening batch is attributed to (the primary
   *  mapped one). Supplier is chosen once, in the Suppliers / Distributors
   *  section — not duplicated here. */
  mappedSupplierName?: string;
}) {
  const cat = categorize(formData.dosageForm);
  const v = getVocab(cat, formData.dosageForm);
  const baseLabel = v.base;
  const units = formData.units ?? [];
  const subUnit = v.sub ? units.find((u) => !u.isBaseUnit && u.name?.toLowerCase() === v.sub) : undefined;
  const masterUnit = v.master ? units.find((u) => !u.isBaseUnit && u.name?.toLowerCase() === v.master) : undefined;

  // If user picked 'master' but no master pack exists, fall back to sub or base
  const effectiveUnit: OpeningStock['unit'] =
    opening.unit === 'master' && !masterUnit ? (subUnit ? 'sub' : 'base')
    : opening.unit === 'sub' && !subUnit ? 'base'
    : opening.unit;

  const qtyEntered = parseFloat(opening.quantity) || 0;
  const multiplier = effectiveUnit === 'master' && masterUnit ? masterUnit.multiplier
    : effectiveUnit === 'sub' && subUnit ? subUnit.multiplier
    : 1;
  const totalBase = Math.round(qtyEntered * multiplier);

  // The user enters purchase rate AT THE SAME UNIT they bought in (e.g. PKR 1000 per box).
  // We compute per-base internally for storage.
  const pricePerPack = parseFloat(opening.purchasePricePerBase) || 0;
  const pricePerBase = multiplier > 0 ? pricePerPack / multiplier : 0;
  const totalPaid = qtyEntered * pricePerPack;

  const unitWord = effectiveUnit === 'master' ? masterUnit?.name : effectiveUnit === 'sub' ? subUnit?.name : baseLabel;

  return (
    <div>
      <div className="border-b pb-2 mb-3 flex items-center justify-between">
        <div>
          <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Opening Stock</h4>
          <p className="text-xs text-gray-500 mt-0.5">Initial batch for this medicine. Skip if you'll add stock later via Purchase Orders.</p>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="opening-toggle"
            checked={opening.enabled}
            onCheckedChange={(c) => setOpening({ ...opening, enabled: c as boolean })}
          />
          <Label htmlFor="opening-toggle" className="text-xs cursor-pointer">Add now</Label>
        </div>
      </div>

      {!opening.enabled ? (
        <p className="text-xs text-gray-500 italic">Stock not added now. You can add stock anytime through Purchase Orders.</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Quantity received</Label>
              <div className="flex gap-2">
                <Input
                  type="number" min={0} step="0.01"
                  placeholder="0"
                  value={opening.quantity}
                  onChange={(e) => setOpening({ ...opening, quantity: e.target.value })}
                  className="flex-1"
                />
                <Select
                  value={effectiveUnit}
                  onValueChange={(v) => setOpening({ ...opening, unit: v as OpeningStock['unit'] })}
                >
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {masterUnit && <SelectItem value="master">{masterUnit.name}{masterUnit.name?.endsWith('s') ? '' : 'es'}</SelectItem>}
                    {subUnit && <SelectItem value="sub">{subUnit.name}{subUnit.name?.endsWith('s') ? '' : 's'}</SelectItem>}
                    <SelectItem value="base">{baseLabel}{baseLabel.endsWith('s') ? '' : 's'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {totalBase > 0 && multiplier > 1 && (
                <p className="text-xs text-blue-700">= {totalBase.toLocaleString()} {baseLabel}s in inventory</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>
                Purchase rate <span className="text-xs font-normal text-emerald-700 font-semibold">per {unitWord ?? baseLabel}</span>
              </Label>
              <Input
                type="number" step="0.01" min={0}
                placeholder={`PKR per ${unitWord}`}
                value={opening.purchasePricePerBase}
                onChange={(e) => setOpening({ ...opening, purchasePricePerBase: e.target.value })}
              />
              <p className="text-xs text-gray-500">What you paid per {unitWord} (not per {baseLabel})</p>
              {pricePerPack > 0 && multiplier > 1 && (
                <p className="text-xs text-blue-700">→ {pricePerBase.toFixed(2)} per {baseLabel}</p>
              )}
            </div>
          </div>

          {totalPaid > 0 && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm">
              <p className="font-semibold text-emerald-900 mb-1">
                💰 Total paid: PKR {totalPaid.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-emerald-700">
                {qtyEntered} {unitWord}{qtyEntered === 1 ? '' : 's'} × PKR {pricePerPack.toLocaleString()} = PKR {totalPaid.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                {multiplier > 1 && ` · stored as PKR ${pricePerBase.toFixed(2)} cost per ${baseLabel}`}
              </p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Batch Number</Label>
              <Input
                placeholder="e.g. BN-2026-001"
                value={opening.batchNumber}
                onChange={(e) => setOpening({ ...opening, batchNumber: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Expiry Date</Label>
              <Input
                type="date"
                value={opening.expiryDate}
                onChange={(e) => setOpening({ ...opening, expiryDate: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Manufacturing Date</Label>
              <Input
                type="date"
                value={opening.manufacturingDate}
                onChange={(e) => setOpening({ ...opening, manufacturingDate: e.target.value })}
              />
            </div>
          </div>

          <div className="text-sm text-gray-500">
            {mappedSupplierName ? (
              <p>Supplier: <span className="font-medium text-gray-700">{mappedSupplierName}</span> <span className="text-xs">— from your mapped distributors below.</span></p>
            ) : (
              <p className="text-amber-700">No distributor mapped yet — map one in <strong>Suppliers / Distributors</strong> below and this opening batch will be attributed to it.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── FBR section (v1.12 spec aware, auto-fetches UoMs per HS code) ──────────

function MedicineFbrSection({
  formData,
  setFormData,
}: {
  formData: Partial<Medicine>;
  setFormData: (m: Partial<Medicine>) => void;
}) {
  const [uoms, setUoms] = useState<FbrUom[]>([]);
  const [uomsLoading, setUomsLoading] = useState(false);
  const [uomError, setUomError] = useState<string | null>(null);

  // §5.9 — when HS code changes, fetch the valid UoMs for it. Auto-pick if single.
  useEffect(() => {
    const hs = (formData.hsCode ?? '').trim();
    if (!hs || hs.length < 6) { setUoms([]); setUomError(null); return; }
    let cancelled = false;
    setUomsLoading(true);
    setUomError(null);
    fbrApi.hsUom(hs)
      .then((list) => {
        if (cancelled) return;
        setUoms(list ?? []);
        // Auto-select the UoM if only one valid option (spec §4 error 0099 risk avoidance).
        if (list?.length === 1 && !formData.fbrUom) {
          setFormData({ ...formData, fbrUom: list[0].description });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setUomError(err instanceof Error ? err.message : 'UoM lookup failed');
        setUoms([]);
      })
      .finally(() => { if (!cancelled) setUomsLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.hsCode]);

  // Category is derived from the dosage form (they're the same family) — keep it
  // in sync so downstream logic (HS code, etc.) and the saved record are correct
  // without showing a duplicate field.
  useEffect(() => {
    const derived = deriveCategory(formData.dosageForm);
    if (formData.category !== derived) setFormData({ ...formData, category: derived });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.dosageForm]);

  // Auto-suggest HS code from category — drugs default to 30049099 (Pakistan Customs Tariff
  // chapter 30 "Pharmaceutical products", subheading 3004.90.99 "Other medicaments").
  useEffect(() => {
    if (formData.hsCode) return;
    const cat = formData.category;
    if (['tablets', 'capsules', 'syrups', 'injections', 'drops', 'creams', 'ointments', 'inhalers', 'powders', 'suspensions', 'solutions'].includes(cat ?? '')) {
      setFormData({ ...formData, hsCode: '3004.9099' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.category]);

  // Auto-pick the FBR UoM from the dosage form so the FBR block fills itself:
  // liquids → Litres, everything else (tablets, caps, ampoules…) → Numbers/pieces.
  // Prefers a matching entry from the live FBR list when one is loaded.
  useEffect(() => {
    if (formData.fbrUom) return;
    const t = (formData.dosageForm ?? '').toLowerCase();
    const liquid = ['syrup', 'suspension', 'solution', 'drop', 'infusion', 'lotion', 'spray'].some((k) => t.includes(k));
    const fromLive = uoms.find((u) => {
      const d = u.description.toLowerCase();
      return liquid ? (d.includes('litre') || d.includes('ml')) : (d.includes('number') || d.includes('piece') || d.includes('unit'));
    });
    const pick = uoms.length > 0 ? (fromLive?.description ?? uoms[0].description) : (liquid ? 'Litres' : 'Numbers, pieces, units');
    if (pick) setFormData({ ...formData, fbrUom: pick });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.dosageForm, uoms]);

  // Auto-default saleType per drug classification.
  // Most pharmacy retail SKUs fall under "3rd Schedule Goods" (fixed MRP printed on pack)
  // OR "Goods at Standard Rate (default)" for OTC items. We default to 3rd Schedule
  // when classification is Prescription/Controlled, which is the safer assumption.
  useEffect(() => {
    if (formData.fbrSaleType) return;
    const cls = (formData.classification ?? '').toString().toLowerCase();
    if (cls === 'prescription' || cls === 'controlled') {
      setFormData({ ...formData, fbrSaleType: '3rd Schedule Goods' });
    } else if (cls === 'otc') {
      setFormData({ ...formData, fbrSaleType: 'Goods at Standard Rate (default)' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.classification]);

  const requiresFixedPrice = formData.fbrSaleType === '3rd Schedule Goods' || formData.fbrSaleType === 'Non-Adjustable Supplies';
  const showSroFields = formData.fbrSaleType === 'Goods as per SRO.297(|)/2023' || (formData.fbrSroScheduleNo ?? '').length > 0;

  const missingRequired = !formData.hsCode || !formData.fbrUom || !formData.fbrSaleType;

  return (
    <details className="border rounded-lg p-3 bg-gray-50" open={missingRequired}>
      <summary className="cursor-pointer font-semibold text-sm text-gray-700 flex items-center gap-2">
        FBR Digital Invoicing
        <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">v1.12</span>
        {missingRequired ? (
          <span className="text-xs font-normal text-rose-600">— required fields missing</span>
        ) : (
          <span className="text-xs font-normal text-emerald-700">— configured ✓</span>
        )}
      </summary>
      <div className="grid grid-cols-2 gap-4 mt-4">
        <div className="space-y-1.5">
          <Label>HS Code (PCT) <span className="text-red-500">*</span></Label>
          <Input
            placeholder="e.g. 3004.9099"
            value={formData.hsCode ?? ''}
            onChange={(e) => setFormData({ ...formData, hsCode: e.target.value.trim() })}
          />
          <p className="text-xs text-gray-500">
            Pakistan Customs Tariff — pharmaceuticals usually <span className="font-mono">3004.9099</span>. FBR spec errors 0019/0044 if missing.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>FBR UoM <span className="text-red-500">*</span></Label>
          <Select
            value={formData.fbrUom ?? ''}
            onValueChange={(v) => setFormData({ ...formData, fbrUom: v })}
            disabled={uomsLoading || (uoms.length === 0 && !uomError)}
          >
            <SelectTrigger>
              <SelectValue placeholder={uomsLoading ? 'Loading from FBR…' : 'Select unit'} />
            </SelectTrigger>
            <SelectContent>
              {uoms.length > 0
                ? uoms.map((u) => (
                    <SelectItem key={u.uoM_ID} value={u.description}>{u.description}</SelectItem>
                  ))
                : (
                    // Fallback common pharmacy UoMs (still spec-compliant labels)
                    ['Numbers, pieces, units', 'KG', 'Litres', 'Box', 'Strip', 'Bottle'].map((label) => (
                      <SelectItem key={label} value={label}>{label}</SelectItem>
                    ))
                  )}
            </SelectContent>
          </Select>
          {uomError ? (
            <p className="text-[11px] text-amber-700">⚠ Live UoM list unavailable ({uomError}). Using fallback list.</p>
          ) : (
            <p className="text-[11px] text-gray-500">
              {uoms.length > 0 ? `Filtered for HS ${formData.hsCode} via FBR §5.9.` : 'Set HS Code to load valid UoMs from FBR.'}
            </p>
          )}
        </div>

        <div className="space-y-1.5 col-span-2">
          <Label>Sale Type <span className="text-red-500">*</span></Label>
          <Select
            value={formData.fbrSaleType ?? ''}
            onValueChange={(v) => setFormData({ ...formData, fbrSaleType: v })}
          >
            <SelectTrigger><SelectValue placeholder="Pick a sale type" /></SelectTrigger>
            <SelectContent>
              {FBR_SALE_TYPE_LABELS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-gray-500">
            Most prescription/controlled drugs are <span className="font-mono">3rd Schedule Goods</span> (MRP printed on pack).
            OTC items at 17/18% are <span className="font-mono">Goods at Standard Rate</span>. Spec §9 list.
          </p>
        </div>

        {requiresFixedPrice && (
          <div className="space-y-1.5 col-span-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <Label>Fixed Notified Value / Retail Price <span className="text-red-500">*</span></Label>
            <Input
              type="number"
              step="0.01"
              placeholder="e.g. 280.50"
              value={formData.fbrFixedNotifiedValueOrRetailPrice ?? ''}
              onChange={(e) => setFormData({ ...formData, fbrFixedNotifiedValueOrRetailPrice: parseFloat(e.target.value) || 0 })}
            />
            <p className="text-[11px] text-amber-700">
              Required for "{formData.fbrSaleType}" — this is the MRP printed on the pack. Without it FBR rejects with error 0090/0175.
            </p>
          </div>
        )}

        {showSroFields && (
          <>
            <div className="space-y-1.5">
              <Label>SRO Schedule No</Label>
              <Input
                placeholder="e.g. SRO123"
                value={formData.fbrSroScheduleNo ?? ''}
                onChange={(e) => setFormData({ ...formData, fbrSroScheduleNo: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>SRO Item Serial No</Label>
              <Input
                placeholder="e.g. 81"
                value={formData.fbrSroItemSerialNo ?? ''}
                onChange={(e) => setFormData({ ...formData, fbrSroItemSerialNo: e.target.value })}
              />
            </div>
          </>
        )}

        <details className="col-span-2 mt-1">
          <summary className="text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer">Advanced</summary>
          <div className="mt-2 space-y-1.5">
            <Label>Sandbox Scenario Override</Label>
            <Input
              placeholder="e.g. SN025 (drugs at fixed ST rate)"
              value={formData.fbrScenarioId ?? ''}
              onChange={(e) => setFormData({ ...formData, fbrScenarioId: e.target.value.trim().toUpperCase() })}
            />
            <p className="text-[11px] text-gray-500">
              Per-medicine override of the tenant default scenario. Used only in sandbox.
            </p>
          </div>
        </details>
      </div>
    </details>
  );
}

export function Medicines() {
  const [searchParams] = useSearchParams();
  const { settings } = useSettingsStore();
  const { t, isRTL } = useTranslation();
  const { medicines, batches, addMedicine, updateMedicine, deleteMedicine, searchMedicines, addBatch } = useInventoryStore();
  const { suppliers, medicineSuppliers, addMedicineSupplier, removeMedicineSupplier } = useSupplierStore();
  // Distributors mapped to the medicine being added/edited (multi-select).
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<string[]>([]);
  const [supplierFilter, setSupplierFilter] = useState('');
  // The "I price this per" unit (base/sub/master), lifted out of PricingSection
  // so the Stock Thresholds section can default its unit to the same choice.
  const [pricingLevel, setPricingLevel] = useState<'base' | 'sub' | 'master'>('base');
  // Stock-threshold unit — defaults to the pricing level until the user changes it.
  const [thresholdLevel, setThresholdLevel] = useState<'base' | 'sub' | 'master'>('base');
  const thresholdTouched = useRef(false);
  useEffect(() => { if (!thresholdTouched.current) setThresholdLevel(pricingLevel); }, [pricingLevel]);
  const { sales } = useSalesStore();

  // Sales-velocity-driven reorder suggestion. Reads the last 30 days of sale
  // line items for this medicine, scales up to a 30-day cover, and clamps
  // against maxStock when set. Pure derivation — does not write to state.
  const suggestReorderQty = (medicineId: string, currentMaxStock?: number): number | null => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recent = sales
      .filter((s) => s.status === 'completed' && new Date(s.saleDate).getTime() >= cutoff)
      .flatMap((s) => s.items)
      .filter((i) => i.medicineId === medicineId);
    const totalSold = recent.reduce((sum, i) => sum + (i.quantity ?? 0), 0);
    if (totalSold <= 0) return null;
    const avgPerDay = totalSold / 30;
    const suggestion = Math.ceil(avgPerDay * 30); // 30-day cover
    if (currentMaxStock && suggestion > currentMaxStock) return currentMaxStock;
    return suggestion;
  };

  // Barcode-scanner dialog state. USB scanners type characters fast and
  // press Enter; we focus the input, capture Enter, write into the form.
  const [showBarcodeScanDialog, setShowBarcodeScanDialog] = useState(false);
  const [scanBuffer, setScanBuffer] = useState('');
  // "Find product" — central catalog first, DRAP fallback.
  const [findQuery, setFindQuery] = useState('');
  const [findResults, setFindResults] = useState<CatalogProduct[]>([]);
  const [drapCandidates, setDrapCandidates] = useState<DrapCandidate[]>([]);
  const [findLoading, setFindLoading] = useState(false);
  const [drapLoading, setDrapLoading] = useState(false);
  const [drapError, setDrapError] = useState(false);
  const [findRan, setFindRan] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);

  // Force-confirm dialog when a probable duplicate is detected on add.
  const [duplicateWarn, setDuplicateWarn] = useState<{ existing: Medicine; proceed: () => void } | null>(null);
  
  const [openingStock, setOpeningStock] = useState<OpeningStock>({
    enabled: false, quantity: '', unit: 'master', batchNumber: '', expiryDate: '',
    manufacturingDate: '', purchasePricePerBase: '', supplierId: '',
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  // Active / inactive / all filter — lets the owner re-find deactivated drugs
  // (soft-deleted medicines stay in the DB so historical batches/sales keep
  // their FK refs; only the listing hides them).
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedMedicine, setSelectedMedicine] = useState<Medicine | null>(null);

  // ── CSV column definition ──
  const csvColumns = [
    { key: 'name' as const, label: 'Name' },
    { key: 'genericName' as const, label: 'Generic Name' },
    { key: 'brandName' as const, label: 'Brand' },
    { key: 'manufacturer' as const, label: 'Manufacturer' },
    { key: 'category' as const, label: 'Category' },
    { key: 'dosageForm' as const, label: 'Dosage Form' },
    { key: 'strength' as const, label: 'Strength' },
    { key: 'unit' as const, label: 'Unit' },
    { key: 'barcode' as const, label: 'Barcode' },
    { key: 'classification' as const, label: 'Classification' },
    { key: 'schedule' as const, label: 'Schedule' },
    { key: 'drapRegistration' as const, label: 'DRAP Registration' },
    { key: 'countryOfOrigin' as const, label: 'Country of Origin' },
    { key: 'packSize' as const, label: 'Pack Size' },
    { key: 'shelfLocation' as const, label: 'Shelf Location' },
    { key: 'rackNumber' as const, label: 'Rack Number' },
    { key: 'storageInstructions' as const, label: 'Storage Instructions' },
    { key: 'mrp' as const, label: 'MRP' },
    { key: 'allowLooseSale' as const, label: 'Allow Loose Sale' },
    { key: 'reorderLevel' as const, label: 'Min Stock' },
    { key: 'maxStock' as const, label: 'Max Stock' },
    { key: 'reorderQuantity' as const, label: 'Reorder Qty' },
  ];

  const handleImportMedicines = () => {
    importFromCSV<Record<string, string>>(
      (rows) => {
        let imported = 0;
        rows.forEach((row) => {
          if (!row['Name']) return;
          const dosageForm = (row['Dosage Form'] || 'tablet') as DosageForm;
          const looseStr = (row['Allow Loose Sale'] || '').toLowerCase();
          const allowLoose = looseStr === '' ? undefined : ['yes', 'true', '1', 'y'].includes(looseStr);
          const med: Medicine = {
            id: Date.now().toString() + Math.random().toString(36).slice(2, 7),
            name: row['Name'] || '',
            genericName: row['Generic Name'] || '',
            brandName: row['Brand'] || '',
            manufacturer: row['Manufacturer'] || undefined,
            category: (row['Category'] || 'tablets') as MedicineCategory,
            dosageForm,
            strength: row['Strength'] || '',
            unit: row['Unit'] || 'tablet',
            barcode: row['Barcode'] || undefined,
            classification: (row['Classification'] || 'otc') as 'otc' | 'prescription' | 'controlled',
            schedule: row['Schedule'] || undefined,
            drapRegistration: row['DRAP Registration'] || undefined,
            countryOfOrigin: row['Country of Origin'] || undefined,
            packSize: row['Pack Size'] || undefined,
            shelfLocation: row['Shelf Location'] || undefined,
            rackNumber: row['Rack Number'] || undefined,
            storageInstructions: row['Storage Instructions'] || undefined,
            mrp: row['MRP'] ? parseFloat(row['MRP']) : undefined,
            allowLooseSale: allowLoose,
            isPrescriptionRequired: (row['Classification'] || '').toLowerCase() === 'prescription',
            isActive: true,
            webLive: false,
            reorderLevel: parseInt(row['Min Stock'] || row['Reorder Level'] || '50', 10),
            maxStock: row['Max Stock'] ? parseInt(row['Max Stock'], 10) : undefined,
            reorderQuantity: parseInt(row['Reorder Qty'] || row['Reorder Quantity'] || '100', 10),
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          addMedicine(med);
          imported++;
        });
        toast.success(t('medicines.imported', imported));
      },
      (err) => toast.error(err),
    );
  };
  
  const [formData, setFormData] = useState<Partial<Medicine>>({
    name: '',
    genericName: '',
    brandName: '',
    category: 'tablets',
    dosageForm: 'tablet',
    strength: '',
    unit: 'tablet',
    units: [
      { id: 'unit-base', name: 'tablet', abbreviation: 'tablet', multiplier: 1, isBaseUnit: true, isActive: true },
    ],
    barcode: '',
    isPrescriptionRequired: false,
    webLive: false,
    reorderLevel: 50,
    reorderQuantity: 100,
    description: '',
  });

  const normalizeUnits = (medicine: Partial<Medicine>): MedicineUnit[] => {
    const units = medicine.units?.filter((unit) => unit.name && unit.multiplier > 0) ?? [];
    if (units.length > 0) return units.map((unit, index) => ({ ...unit, isBaseUnit: index === 0 || unit.isBaseUnit }));
    const baseUnit = medicine.unit || 'tablet';
    return [
      { id: `unit-${Date.now()}-base`, name: baseUnit, abbreviation: baseUnit, multiplier: 1, isBaseUnit: true, isActive: true },
    ];
  };

  // Initialize the distributor multi-select when a dialog opens: empty for a new
  // medicine, pre-filled from existing mappings when editing.
  useEffect(() => {
    if (showAddDialog) {
      setSelectedSupplierIds([]); setSupplierFilter('');
      setPricingLevel('base'); setThresholdLevel('base'); thresholdTouched.current = false;
    }
  }, [showAddDialog]);
  useEffect(() => {
    if (!showEditDialog || !selectedMedicine) return;
    setSupplierFilter('');
    setSelectedSupplierIds(
      useSupplierStore.getState().medicineSuppliers
        .filter((m) => m.medicineId === selectedMedicine.id)
        .map((m) => m.supplierId),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showEditDialog, selectedMedicine?.id]);

  // Persist the medicine↔supplier mappings to match the current selection:
  // add newly-ticked distributors, remove unticked ones. Reads fresh state so
  // it works immediately after a brand-new medicine is created.
  const syncMedicineSuppliers = (medicineId: string, supplierIds: string[]) => {
    const existing = useSupplierStore.getState().medicineSuppliers.filter((m) => m.medicineId === medicineId);
    for (const sid of supplierIds) {
      if (!existing.some((m) => m.supplierId === sid)) {
        addMedicineSupplier({
          id: `ms-${Date.now()}-${sid.slice(-5)}`,
          medicineId, supplierId: sid, isPrimary: false,
          createdAt: new Date(), updatedAt: new Date(),
        });
      }
    }
    for (const m of existing) {
      if (!supplierIds.includes(m.supplierId)) removeMedicineSupplier(m.id);
    }
  };

  // Check for edit parameter
  useEffect(() => {
    const editId = searchParams.get('id');
    if (editId) {
      const medicine = medicines.find(m => m.id === editId);
      if (medicine) {
        setSelectedMedicine(medicine);
        setFormData(medicine);
        setShowEditDialog(true);
      }
    }
  }, [searchParams, medicines]);

  // Filter medicines
  const filteredMedicines = medicines.filter((medicine) => {
    const matchesSearch = searchQuery === '' ||
      medicine.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      medicine.genericName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      medicine.barcode?.includes(searchQuery);

    const matchesCategory = categoryFilter === 'all' || medicine.category === categoryFilter;

    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'active' && medicine.isActive)
      || (statusFilter === 'inactive' && !medicine.isActive);

    return matchesSearch && matchesCategory && matchesStatus;
  });

  // Handle add medicine
  const handleAdd = () => {
    // Duplicate detection — flag (don't block) when name+strength+dosageForm
    // already exists. Trim+lower for tolerant matching. Owner can still proceed
    // (e.g. different manufacturer of the same compound).
    const dupKey = `${(formData.name ?? '').trim().toLowerCase()}|${(formData.strength ?? '').trim().toLowerCase()}|${(formData.dosageForm ?? '').toLowerCase()}`;
    const existing = medicines.find((m) =>
      m.isActive
      && `${m.name.trim().toLowerCase()}|${m.strength.trim().toLowerCase()}|${m.dosageForm.toLowerCase()}` === dupKey
    );
    if (existing) {
      // Defer the actual add behind a confirm dialog. The proceed callback
      // re-invokes this function with a marker so we skip the check next time.
      setDuplicateWarn({
        existing,
        proceed: () => { setDuplicateWarn(null); doActualAdd(); },
      });
      return;
    }
    doActualAdd();
  };

  const doActualAdd = () => {
    const medId = Date.now().toString();
    const newMedicine: Medicine = {
      id: medId,
      name: formData.name || '',
      genericName: formData.genericName || '',
      brandName: formData.brandName,
      manufacturer: formData.manufacturer,
      category: deriveCategory(formData.dosageForm),
      dosageForm: (formData.dosageForm as DosageForm) || 'tablet',
      strength: formData.strength || '',
      unit: formData.unit || 'tablet',
      units: normalizeUnits(formData),
      barcode: formData.barcode,
      barcodeImageUrl: formData.barcodeImageUrl,
      isPrescriptionRequired: formData.isPrescriptionRequired || false,
      classification: formData.classification || 'otc',
      schedule: formData.schedule,
      drapRegistration: formData.drapRegistration,
      countryOfOrigin: formData.countryOfOrigin,
      packSize: formData.packSize,
      shelfLocation: formData.shelfLocation,
      rackNumber: formData.rackNumber,
      storageInstructions: formData.storageInstructions,
      mrp: formData.mrp,
      tradePrice: formData.tradePrice,
      taxRatePercent: formData.taxRatePercent,
      maxStock: formData.maxStock,
      allowLooseSale: formData.allowLooseSale ?? true,
      isActive: true,
      webLive: formData.webLive ?? false,
      reorderLevel: formData.reorderLevel || 50,
      reorderQuantity: formData.reorderQuantity || 100,
      reorderActive: formData.reorderActive ?? true,
      description: formData.description,
      hsCode: formData.hsCode,
      fbrUom: formData.fbrUom,
      fbrSaleType: formData.fbrSaleType,
      fbrScenarioId: formData.fbrScenarioId,
      fbrSroScheduleNo: formData.fbrSroScheduleNo,
      fbrSroItemSerialNo: formData.fbrSroItemSerialNo,
      fbrFixedNotifiedValueOrRetailPrice: formData.fbrFixedNotifiedValueOrRetailPrice,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    addMedicine(newMedicine);

    // Map the selected distributors to this new medicine.
    syncMedicineSuppliers(medId, selectedSupplierIds);

    // Create initial batch if opening stock is provided
    if (openingStock.enabled && openingStock.quantity) {
      const qty = parseFloat(openingStock.quantity) || 0;
      if (qty > 0) {
        const units = newMedicine.units ?? [];
        const subUnit = units.find((u) => !u.isBaseUnit && (u.name?.toLowerCase().includes('strip') || u.name?.toLowerCase().includes('bottle') || u.name?.toLowerCase().includes('tube') || u.name?.toLowerCase().includes('vial') || u.name?.toLowerCase().includes('ampoule')));
        const masterUnit = units.find((u) => !u.isBaseUnit && (u.name?.toLowerCase().includes('box') || u.name?.toLowerCase().includes('carton')));
        const multiplier = openingStock.unit === 'master' && masterUnit ? masterUnit.multiplier
          : openingStock.unit === 'sub' && subUnit ? subUnit.multiplier
          : 1;
        const totalBase = Math.round(qty * multiplier);
        // User entered purchase rate AT THE PACK LEVEL they bought in (e.g. PKR 1000 per box).
        // Convert to per-base (PKR 10 per tablet) for storage consistency.
        const pricePerPack = parseFloat(openingStock.purchasePricePerBase) || 0;
        const purchasePerBase = multiplier > 0 ? pricePerPack / multiplier : 0;
        const newBatch: Batch = {
          id: `batch-${Date.now()}`,
          medicineId: medId,
          batchNumber: openingStock.batchNumber || `OPENING-${Date.now()}`,
          expiryDate: openingStock.expiryDate ? new Date(openingStock.expiryDate) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          manufacturingDate: openingStock.manufacturingDate ? new Date(openingStock.manufacturingDate) : undefined,
          quantity: totalBase,
          purchasePrice: purchasePerBase,
          salePrice: units[0]?.salePrice ?? newMedicine.mrp ?? 0,
          mrp: newMedicine.mrp ?? 0,
          supplierId: openingStock.supplierId || selectedSupplierIds[0] || '',
          purchaseId: '',
          isActive: true,
          createdAt: new Date(),
        };
        addBatch(newBatch);
        toast.success(`Medicine added with ${totalBase.toLocaleString()} ${units[0]?.name ?? 'units'} in stock`);
      }
    }

    setShowAddDialog(false);
    resetForm();
    setOpeningStock({ enabled: false, quantity: '', unit: 'master', batchNumber: '', expiryDate: '', manufacturingDate: '', purchasePricePerBase: '', supplierId: '' });
  };

  // Handle edit medicine
  const handleEdit = () => {
    if (selectedMedicine) {
      updateMedicine(selectedMedicine.id, { ...formData, units: normalizeUnits(formData) });
      syncMedicineSuppliers(selectedMedicine.id, selectedSupplierIds);
      setShowEditDialog(false);
      resetForm();
    }
  };

  // Handle delete medicine
  const handleDelete = () => {
    if (selectedMedicine) {
      deleteMedicine(selectedMedicine.id);
      setShowDeleteDialog(false);
      setSelectedMedicine(null);
    }
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      name: '',
      genericName: '',
      brandName: '',
      category: 'tablets',
      dosageForm: 'tablet',
      strength: '',
      unit: 'tablet',
      units: [
        { id: 'unit-base', name: 'tablet', abbreviation: 'tablet', multiplier: 1, isBaseUnit: true, isActive: true },
      ],
      barcode: '',
      barcodeImageUrl: undefined,
      isPrescriptionRequired: false,
      webLive: false,
      reorderLevel: 50,
      reorderQuantity: 100,
      reorderActive: true,
      description: '',
    });
  };

  // Open edit dialog
  const openEditDialog = (medicine: Medicine) => {
    setSelectedMedicine(medicine);
    setFormData(medicine);
    setPricingLevel('base'); setThresholdLevel('base'); thresholdTouched.current = false;
    setShowEditDialog(true);
  };

  // Open delete dialog
  const openDeleteDialog = (medicine: Medicine) => {
    setSelectedMedicine(medicine);
    setShowDeleteDialog(true);
  };

  // Medicine Form Content (plain JSX, not a component — avoids remount/focus-loss)
  const Required = () => <span className="text-red-500 ml-0.5">*</span>;
  const SectionHeader = ({ title, desc }: { title: string; desc?: string }) => (
    <div className="border-b pb-2 mb-3">
      <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide">{title}</h4>
      {desc && <p className="text-xs text-gray-500 mt-0.5">{desc}</p>}
    </div>
  );

  // Look up a product: central shared catalog first (fast, cross-pharmacy), then
  // DRAP as a fallback (which caches the result back into the catalog).
  const handleFindProduct = async () => {
    const q = findQuery.trim();
    if (!q) return;
    setFindLoading(true);
    setFindRan(true);
    setDrapCandidates([]);
    setDrapError(false);
    try {
      // Scanned a pack QR / GS1 code into the box → resolve by GTIN. Capture the
      // GTIN (+MRP) onto the form even if the product isn't catalogued yet.
      const parsed = parseScannedCode(q);
      if (parsed.isStructured && parsed.gtin) {
        const gtin = parsed.gtin;
        setFormData((prev) => ({ ...prev, barcode: gtin, ...(parsed.mrp != null ? { mrp: parsed.mrp } : {}) }));
        const found = await fetchCatalogByGtin(gtin);
        if (found) applyFoundProduct(found);
        else if (parsed.productName) {
          // Unknown pack → look the product up in DRAP by its printed name.
          setDrapLoading(true);
          setDrapCandidates(await searchDrap({ brand: parsed.productName }));
          setDrapLoading(false);
        } else {
          toast(`Pack barcode ${gtin} captured. Enter the brand or DRAP reg. no to pull details.`, { duration: 6000 });
        }
        return;
      }

      const looksLikeRegNo = /^[0-9][0-9-]*$/.test(q);
      // 1) Shared catalog first (instant, cross-pharmacy).
      const results = await searchCatalog(looksLikeRegNo ? { regNo: q } : { brand: q }).catch(() => []);
      setFindResults(results);
      // 2) Not in the catalog → fetch from DRAP on demand (isolated so a network
      //    hiccup shows a clear, retryable message rather than a dead end).
      if (results.length === 0) {
        setDrapLoading(true);
        try {
          if (looksLikeRegNo) {
            const d = await fetchDrapProduct(q); // reg-no → full detail + cache
            if (d) setFindResults([d]);
          } else {
            setDrapCandidates(await searchDrap({ brand: q })); // brand typeahead → candidates
          }
        } catch (err) {
          // Surface the real error so we can see the actual cause (network / CORS
          // / auth / parse) rather than guessing.
          console.error('[find-product] DRAP lookup failed:', err);
          setDrapError(true);
          toast.error(`DRAP lookup error: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          setDrapLoading(false);
        }
      }
    } catch {
      toast.error('Lookup failed — enter details manually.');
    } finally {
      setFindLoading(false);
    }
  };

  // User picked a DRAP candidate → fetch full detail (caches it) and pre-fill.
  const pickDrapCandidate = async (c: DrapCandidate) => {
    setDrapLoading(true);
    try {
      const full = await fetchDrapProduct(c.drapRegNo);
      if (full) applyFoundProduct(full);
      else toast.error('Could not fetch details from DRAP — try the registration number.');
    } catch {
      toast.error('DRAP fetch failed.');
    } finally {
      setDrapLoading(false);
    }
  };

  // Pre-fill the form from a catalog/DRAP product. Operational fields (pricing,
  // stock, rack, loose-purchase) are intentionally left for manual entry.
  const applyFoundProduct = (p: CatalogProduct) => {
    // DRAP free-text dosage form ("Film-coated tablet", "Oral Solution", "Eye
    // Drops"…) → our enum. First keyword match wins (most specific first).
    const mapDosageForm = (s?: string): DosageForm | undefined => {
      if (!s) return undefined;
      const t = s.toLowerCase();
      const table: Array<[RegExp, DosageForm]> = [
        [/caplet/, 'caplet'], [/tablet/, 'tablet'], [/capsule/, 'capsule'],
        [/syrup/, 'syrup'], [/suspension/, 'suspension'], [/solution/, 'solution'],
        [/inject/, 'injection'], [/amp(oule|ule)/, 'ampoule'], [/infusion/, 'infusion'],
        [/drop/, 'drop'], [/ointment/, 'ointment'], [/cream/, 'cream'], [/gel/, 'gel'],
        [/lotion/, 'lotion'], [/inhal/, 'inhaler'], [/spray|aerosol/, 'spray'],
        [/sachet|powder/, 'powder'], [/granule/, 'granules'], [/patch/, 'patch'],
        [/shampoo/, 'shampoo'], [/soap/, 'soap'],
      ];
      return table.find(([re]) => re.test(t))?.[1];
    };
    // DRAP pack sizes like "10's", "30's & 45's (3x15's)" → per-strip + strips-per-box.
    const parsePack = (packs?: Array<{ pack?: string }>): { sub?: number; masterCount?: number } => {
      const strs = (packs ?? []).map((x) => x.pack ?? '');
      for (const s of strs) { const m = s.match(/(\d+)\s*[*x×]\s*(\d+)/i); if (m) return { sub: +m[2], masterCount: +m[1] }; }
      for (const s of strs) { const m = s.match(/(\d+)\s*'?\s*s\b/i); if (m) return { sub: +m[1] }; }
      return {};
    };

    const df = mapDosageForm(p.dosageForm);
    const extra = p.extra ?? {};
    // Most DRAP-registered self-manufactured products are made in Pakistan.
    const country = /self/i.test(extra.manufacturingType ?? '') ? 'Pakistan' : undefined;

    // Build the packaging units from the dosage form + parsed pack size so the
    // base unit, strip/box and quantities pre-fill from DRAP.
    let builtUnits: MedicineUnit[] | undefined;
    if (df) {
      const vocab = getVocab(categorize(df), df);
      const { sub, masterCount } = parsePack(p.packSizes);
      const list: MedicineUnit[] = [{ id: 'unit-base', name: vocab.base, abbreviation: vocab.base, multiplier: 1, isBaseUnit: true, isActive: true }];
      if (vocab.sub && sub) list.push({ id: 'unit-sub', name: vocab.sub, abbreviation: vocab.sub, multiplier: sub, isBaseUnit: false, isActive: true });
      if (vocab.master && masterCount) {
        const mult = vocab.sub ? (sub || 1) * masterCount : masterCount;
        list.push({ id: 'unit-master', name: vocab.master, abbreviation: vocab.master, multiplier: mult, isBaseUnit: false, isActive: true });
      }
      builtUnits = list;
    }

    setFormData((prev) => ({
      ...prev,
      name: p.brand,
      brandName: extra.brandName ?? prev.brandName,
      genericName: p.genericName ?? prev.genericName,
      strength: p.strength ? `${p.strength}${p.unit ?? ''}` : prev.strength,
      dosageForm: df ?? prev.dosageForm,
      category: df ? deriveCategory(df) : prev.category,
      manufacturer: p.manufacturer ?? prev.manufacturer,
      countryOfOrigin: country ?? prev.countryOfOrigin,
      description: extra.labelClaim ?? prev.description,
      barcode: p.gtins?.[0] ?? prev.barcode,
      // The form's "DRAP Registration No." field binds to drapRegistration;
      // keep drapRegNo too for the catalog contribution link.
      drapRegistration: p.drapRegNo ?? prev.drapRegistration,
      drapRegNo: p.drapRegNo ?? prev.drapRegNo,
      masterProductId: p.id,
      ...(builtUnits ? { units: builtUnits, unit: builtUnits[0].name } : {}),
    }));
    setFindResults([]);
    setDrapCandidates([]);
    setFindRan(false);
    setFindQuery('');
    toast.success(`Loaded ${p.brand} — review, then add pricing & stock`);
  };

  const medicineFormContent = (
    <div className="space-y-6">
      {/* Find product — only when adding a new medicine */}
      {!selectedMedicine && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/60 dark:bg-blue-900/10 p-4">
          <p className="text-sm font-semibold flex items-center gap-2">
            <Search className="w-4 h-4" /> Find product (shared catalog · DRAP)
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            Scan the pack QR/barcode, or enter a DRAP registration number (or brand), to auto-fill the master details. You add pricing, stock & rack.
          </p>
          <div className="flex gap-2 mt-2">
            <Input
              value={findQuery}
              onChange={(e) => setFindQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleFindProduct(); } }}
              placeholder="Scan QR  ·  or  011248  ·  or  RIGIX"
              className="h-9"
            />
            <Button onClick={handleFindProduct} disabled={findLoading} className="h-9 shrink-0">
              {findLoading ? 'Searching…' : 'Search'}
            </Button>
          </div>
          {findResults.length > 0 && (
            <div className="mt-2 space-y-1">
              {findResults.map((p) => (
                <button
                  key={p.id}
                  onClick={() => applyFoundProduct(p)}
                  className="w-full text-left rounded border bg-white dark:bg-gray-800 px-3 py-2 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20"
                >
                  <span className="font-medium">{p.brand}</span>
                  {p.genericName && <span className="text-gray-500"> · {p.genericName}</span>}
                  <span className="block text-[11px] text-gray-400">
                    {p.manufacturer ?? ''}{p.drapRegNo ? ` · Reg ${p.drapRegNo}` : ''}
                    {p.source === 'drap' ? ' · DRAP' : ' · shared catalog'}
                  </span>
                </button>
              ))}
              <p className="text-[11px] text-amber-600">DRAP data is provisional — verify before saving.</p>
            </div>
          )}

          {/* Fetching from DRAP… */}
          {drapLoading && (
            <div className="mt-2 flex items-center gap-2 text-sm text-blue-700">
              <Loader2 className="w-4 h-4 animate-spin" /> Fetching data from DRAP…
            </div>
          )}

          {/* DRAP brand candidates (not yet catalogued) — pick to pull full details. */}
          {!drapLoading && drapCandidates.length > 0 && (
            <div className="mt-2 space-y-1">
              <p className="text-[11px] text-gray-500">From DRAP — pick one to load its details:</p>
              {drapCandidates.map((c) => (
                <button
                  key={c.drapRegNo}
                  onClick={() => pickDrapCandidate(c)}
                  className="w-full text-left rounded border bg-white dark:bg-gray-800 px-3 py-2 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20"
                >
                  <span className="font-medium">{c.brand}</span>
                  <span className="block text-[11px] text-gray-400">Reg {c.drapRegNo} · DRAP</span>
                </button>
              ))}
              <p className="text-[11px] text-amber-600">DRAP data is provisional — verify before saving.</p>
            </div>
          )}

          {drapError && !drapLoading && (
            <p className="text-xs text-amber-600 mt-2">Couldn't reach DRAP just now — press <strong>Search</strong> again to retry.</p>
          )}
          {findRan && !findLoading && !drapLoading && !drapError && findResults.length === 0 && drapCandidates.length === 0 && (
            <p className="text-xs text-gray-500 mt-2">No match in catalog or DRAP — fill the form below manually.</p>
          )}
        </div>
      )}

      {/* SECTION 1: Basic Identification */}
      <div>
        <SectionHeader title="Basic Information" desc="Core details that identify this medicine" />
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Medicine Name<Required /></Label>
            <Input
              placeholder="e.g. Panadol Extra"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Generic Name / Salt Composition<Required /></Label>
            <Input
              placeholder="e.g. Paracetamol 500mg + Caffeine 30mg"
              value={formData.genericName}
              onChange={(e) => setFormData({ ...formData, genericName: e.target.value })}
            />
            <p className="text-xs text-gray-500">Active ingredient(s) with strengths — used for finding substitutes</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 mt-3">
          <div className="space-y-1.5">
            <Label>Brand / Trade Name</Label>
            <Input
              placeholder="e.g. GSK"
              value={formData.brandName}
              onChange={(e) => setFormData({ ...formData, brandName: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Manufacturer</Label>
            <Input
              placeholder="e.g. GlaxoSmithKline Pakistan"
              value={formData.manufacturer ?? ''}
              onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 mt-3">
          <div className="space-y-1.5">
            <Label>Strength<Required /></Label>
            <Input
              placeholder="e.g. 500mg, 5ml"
              value={formData.strength}
              onChange={(e) => setFormData({ ...formData, strength: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Dosage Form / Category<Required /></Label>
            <Select
              value={formData.dosageForm}
              onValueChange={(value) => setFormData({ ...formData, dosageForm: value as DosageForm })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {dosageForms.map(form => (
                  <SelectItem key={form.value} value={form.value}>{form.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* SECTION 2: Classification & Pakistan Compliance */}
      <div>
        <SectionHeader title="Classification & Compliance" desc="DRAP and prescription requirements" />
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Classification<Required /></Label>
            <Select
              value={formData.classification}
              onValueChange={(value) => setFormData({ ...formData, classification: value as 'otc' | 'prescription' | 'controlled' })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="otc">OTC (Over the Counter)</SelectItem>
                <SelectItem value="prescription">Prescription Only</SelectItem>
                <SelectItem value="controlled">Controlled Drug</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {formData.classification === 'controlled' && (
          <div className="mt-3 space-y-1.5">
            <Label>Drug Schedule</Label>
            <Select
              value={formData.schedule ?? ''}
              onValueChange={(v) => setFormData({ ...formData, schedule: v })}
            >
              <SelectTrigger><SelectValue placeholder="Select schedule" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="H">Schedule H — Prescription only</SelectItem>
                <SelectItem value="H1">Schedule H1 — Antibiotics, register required</SelectItem>
                <SelectItem value="X">Schedule X — Narcotics, prescription + license</SelectItem>
                <SelectItem value="G">Schedule G — Substance with caution warning</SelectItem>
                <SelectItem value="K">Schedule K — Special dispensing</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">Required for narcotic / antibiotic compliance</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4 mt-3">
          <div className="space-y-1.5">
            <Label>DRAP Registration No.</Label>
            <Input
              placeholder="e.g. 012345"
              value={formData.drapRegistration ?? ''}
              onChange={(e) => setFormData({ ...formData, drapRegistration: e.target.value })}
            />
            <p className="text-xs text-gray-500">Drug Regulatory Authority of Pakistan registration</p>
          </div>
          <div className="space-y-1.5">
            <Label>Country of Origin</Label>
            <Select
              value={formData.countryOfOrigin ?? ''}
              onValueChange={(value) => setFormData({ ...formData, countryOfOrigin: value })}
            >
              <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Pakistan">Pakistan</SelectItem>
                <SelectItem value="India">India</SelectItem>
                <SelectItem value="China">China</SelectItem>
                <SelectItem value="UK">United Kingdom</SelectItem>
                <SelectItem value="USA">United States</SelectItem>
                <SelectItem value="Germany">Germany</SelectItem>
                <SelectItem value="Switzerland">Switzerland</SelectItem>
                <SelectItem value="Turkey">Turkey</SelectItem>
                <SelectItem value="Bangladesh">Bangladesh</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center space-x-2 mt-3">
          <Checkbox
            id="prescription"
            checked={formData.isPrescriptionRequired}
            onCheckedChange={(checked) =>
              setFormData({ ...formData, isPrescriptionRequired: checked as boolean })
            }
          />
          <Label htmlFor="prescription">Prescription required at point of sale</Label>
        </div>
      </div>

      {/* SECTION 3: Location, Identification & Storage */}
      <div>
        <SectionHeader title="Shelf Location & Identification" desc="Where the medicine is kept and how to scan it" />
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Shelf / Section</Label>
            <Input
              placeholder="e.g. Shelf A, Cold Storage, Schedule X Cabinet"
              value={formData.shelfLocation ?? ''}
              onChange={(e) => setFormData({ ...formData, shelfLocation: e.target.value })}
            />
            <p className="text-xs text-gray-500">Where this medicine is normally kept</p>
          </div>
          <div className="space-y-1.5">
            <Label>Rack / Bin Number</Label>
            <Input
              placeholder="e.g. R-12, Bin 3, Row 2"
              value={formData.rackNumber ?? ''}
              onChange={(e) => setFormData({ ...formData, rackNumber: e.target.value })}
            />
            <p className="text-xs text-gray-500">Specific rack/bin for quick locating</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 mt-3">
          <div className="space-y-1.5">
            <Label>Barcode (EAN/UPC)</Label>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. 8961234567890"
                value={formData.barcode}
                onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                title="Scan barcode (USB scanner)"
                onClick={() => { setScanBuffer(''); setShowBarcodeScanDialog(true); setTimeout(() => scanInputRef.current?.focus(), 100); }}
              >
                <ScanLine className="w-4 h-4" />
              </Button>
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const result = await processUploadedFile(file);
                      // processUploadedFile returns { dataUrl, compressed, beforeBytes, afterBytes }
                      setFormData({ ...formData, barcodeImageUrl: result.dataUrl });
                      toast.success('Barcode image attached');
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : 'Failed to read image');
                    }
                    e.target.value = '';
                  }}
                />
                <Button asChild type="button" variant="outline" size="icon" title="Upload barcode image">
                  <span><ImagePlus className="w-4 h-4" /></span>
                </Button>
              </label>
            </div>
            {formData.barcodeImageUrl && (
              <div className="mt-1 flex items-center gap-2">
                <img src={formData.barcodeImageUrl} alt="barcode" className="h-12 border rounded" />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-red-600"
                  onClick={() => setFormData({ ...formData, barcodeImageUrl: undefined })}
                >
                  Remove
                </Button>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Storage Instructions</Label>
            <Input
              placeholder="e.g. Store below 25°C, away from light"
              value={formData.storageInstructions ?? ''}
              onChange={(e) => setFormData({ ...formData, storageInstructions: e.target.value })}
            />
          </div>
        </div>
      </div>

      {/* SECTION 4: Packaging hierarchy (form-aware) */}
      <SaleUnitsSection formData={formData} setFormData={setFormData} />

      {/* SECTION 5: Pricing (consolidated) */}
      <PricingSection formData={formData} setFormData={setFormData} level={pricingLevel} onLevelChange={setPricingLevel} />

      {/* SECTION 6: Stock Thresholds — units come from packaging */}
      <div>
        {(() => {
          const cat = categorize(formData.dosageForm);
          const v = getVocab(cat, formData.dosageForm);
          // Thresholds are STORED in base units (alerts/server compare in base),
          // but the owner can enter them in whatever unit they buy/think in
          // (box / strip / …). The unit defaults to the pricing "I price this per".
          const u = formData.units ?? [];
          const subU = v.sub ? u.find((x) => !x.isBaseUnit && x.name?.toLowerCase() === v.sub) : undefined;
          const masterU = v.master ? u.find((x) => !x.isBaseUnit && x.name?.toLowerCase() === v.master) : undefined;
          const opts: { key: 'base' | 'sub' | 'master'; name: string; mult: number }[] = [
            { key: 'base', name: v.base, mult: 1 },
            ...(subU && v.sub ? [{ key: 'sub' as const, name: v.sub, mult: subU.multiplier || 1 }] : []),
            ...(masterU && v.master ? [{ key: 'master' as const, name: v.master, mult: masterU.multiplier || 1 }] : []),
          ];
          const lvl = opts.some((o) => o.key === thresholdLevel) ? thresholdLevel : 'base';
          const cur = opts.find((o) => o.key === lvl)!;
          const thMult = cur.mult;
          const thName = cur.name;
          const toDisplay = (base?: number) => base == null ? '' : (thMult > 1 ? Math.round((base / thMult) * 100) / 100 : base);
          const toBase = (val: string) => Math.round((parseFloat(val) || 0) * thMult);
          return (
            <>
              <div className="border-b pb-2 mb-3 flex items-end justify-between gap-3 flex-wrap">
                <div>
                  <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Stock Thresholds</h4>
                  <p className="text-xs text-gray-500 mt-0.5">When to alert you. Values are in <strong>{thName}s</strong>.</p>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="m-0 text-xs text-gray-500">Unit</Label>
                  <Select value={lvl} onValueChange={(val) => { thresholdTouched.current = true; setThresholdLevel(val as 'base' | 'sub' | 'master'); }}>
                    <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {opts.map((o) => <SelectItem key={o.key} value={o.key}>{o.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label>Min Stock <span className="text-xs font-normal text-gray-500">({thName}s)</span></Label>
                  <Input
                    type="number"
                    placeholder="50"
                    value={toDisplay(formData.reorderLevel)}
                    onChange={(e) => setFormData({ ...formData, reorderLevel: toBase(e.target.value) })}
                  />
                  <p className="text-xs text-gray-500">Alert when stock drops below{thMult > 1 ? ` (= ${formData.reorderLevel ?? 0} ${v.base}s)` : ''}</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Max Stock <span className="text-xs font-normal text-gray-500">({thName}s)</span></Label>
                  <Input
                    type="number"
                    placeholder="500"
                    value={toDisplay(formData.maxStock ?? undefined)}
                    onChange={(e) => setFormData({ ...formData, maxStock: e.target.value ? toBase(e.target.value) : undefined })}
                  />
                  <p className="text-xs text-gray-500">Don't overstock above this</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Reorder Qty <span className="text-xs font-normal text-gray-500">({thName}s)</span></Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      placeholder="100"
                      value={toDisplay(formData.reorderQuantity)}
                      onChange={(e) => setFormData({ ...formData, reorderQuantity: toBase(e.target.value) })}
                      className="flex-1"
                    />
                    {selectedMedicine && (() => {
                      const suggested = suggestReorderQty(selectedMedicine.id, formData.maxStock);
                      return (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          title={suggested == null ? 'No recent sales to base a suggestion on' : `Last 30 days suggest ${suggested} ${v.base}s`}
                          disabled={suggested == null}
                          onClick={() => suggested != null && setFormData({ ...formData, reorderQuantity: suggested })}
                        >
                          <Sparkles className="w-3.5 h-3.5 mr-1" />
                          {suggested == null ? 'N/A' : `Suggest ${suggested}`}
                        </Button>
                      );
                    })()}
                  </div>
                  <p className="text-xs text-gray-500">Suggested order qty{thMult > 1 ? ` (= ${formData.reorderQuantity ?? 0} ${v.base}s)` : ''}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Checkbox
                  id="reorderActive"
                  checked={formData.reorderActive ?? true}
                  onCheckedChange={(checked) => setFormData({ ...formData, reorderActive: checked as boolean })}
                />
                <Label htmlFor="reorderActive" className="text-sm font-normal cursor-pointer">
                  Reorder alerts active
                  <span className="text-xs text-gray-500 ml-2">(uncheck to silence low-stock alerts for this medicine)</span>
                </Label>
              </div>
            </>
          );
        })()}
      </div>

      {/* SECTION 7: Opening Stock — only meaningful for new medicines */}
      {!selectedMedicine && (
        <OpeningStockSection
          formData={formData}
          opening={openingStock}
          setOpening={setOpeningStock}
          mappedSupplierName={suppliers.find((s) => s.id === selectedSupplierIds[0])?.name}
        />
      )}

      {/* SECTION: Suppliers / Distributors — map this medicine to the
          distributors you buy it from. Mapped here so there's no need to map
          again later; they pre-link in Purchase Orders. Map as many as needed. */}
      <div>
        <SectionHeader title="Suppliers / Distributors" desc="Map this medicine to the distributors you buy it from — map as many as you like. They'll be pre-linked when creating a Purchase Order." />
        {suppliers.filter((s) => s.isActive).length === 0 ? (
          <p className="text-sm text-gray-400">No suppliers yet — add them under Suppliers first.</p>
        ) : (
          <>
            {selectedSupplierIds.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {selectedSupplierIds.map((id) => {
                  const s = suppliers.find((x) => x.id === id);
                  if (!s) return null;
                  return (
                    <span key={id} className="inline-flex items-center gap-1 text-xs bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 px-2.5 py-1 rounded-md">
                      {s.name}
                      <button type="button" onClick={() => setSelectedSupplierIds((prev) => prev.filter((x) => x !== id))} className="hover:text-emerald-950 dark:hover:text-emerald-100">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            <Input
              placeholder="Search distributors to map…"
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="mb-2"
            />
            <div className="max-h-44 overflow-y-auto rounded-md border divide-y dark:divide-gray-700">
              {suppliers
                .filter((s) => s.isActive && (s.name.toLowerCase().includes(supplierFilter.toLowerCase()) || (s.city ?? '').toLowerCase().includes(supplierFilter.toLowerCase())))
                .map((s) => {
                  const on = selectedSupplierIds.includes(s.id);
                  return (
                    <button
                      type="button"
                      key={s.id}
                      onClick={() => setSelectedSupplierIds((prev) => (on ? prev.filter((x) => x !== s.id) : [...prev, s.id]))}
                      className={cn(
                        'w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-800',
                        on && 'bg-emerald-50/60 dark:bg-emerald-900/10',
                      )}
                    >
                      <span><span className="font-medium">{s.name}</span>{s.city && <span className="text-gray-400"> · {s.city}</span>}</span>
                      {on ? <Check className="w-4 h-4 text-emerald-600" /> : <Plus className="w-4 h-4 text-gray-300" />}
                    </button>
                  );
                })}
            </div>
          </>
        )}
      </div>

      {/* SECTION 6: Description */}
      <div>
        <SectionHeader title="Description / Notes" desc="Indications, warnings, side effects (optional)" />
        <Textarea
          placeholder="Indications, dosage instructions, warnings, side effects, contraindications..."
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows={3}
        />
      </div>

      {/* SECTION 7: FBR Digital Invoicing — v1.12 compliant */}
      <MedicineFbrSection formData={formData} setFormData={setFormData} />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className={cn(
            'text-2xl font-bold',
            settings.theme === 'dark' ? 'text-white' : 'text-gray-900'
          )}>
            {t('medicines.title')}
          </h1>
          <p className={cn(
            'text-sm',
            settings.theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
          )}>
            {t('medicines.subtitle')}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="flex items-center">
            <Button variant="outline" className="gap-2" onClick={handleImportMedicines}>
              <Upload className="w-4 h-4" />
              {t('common.import')}
            </Button>
            <ImportHelpPopover columns={csvColumns} templateFilename="medicines" entityName="Medicines" />
          </div>
          {/* Medicine export removed intentionally — inventory must not be
              downloadable. Import stays so onboarding/migration works. */}
          <Button 
            className="gap-2 bg-emerald-500 hover:bg-emerald-600"
            onClick={() => setShowAddDialog(true)}
          >
            <Plus className="w-4 h-4" />
            {t('medicines.addMedicine')}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder={t('medicines.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-48">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('medicines.allCategories')}</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'active' | 'inactive' | 'all')}>
              <SelectTrigger className="w-44">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active only</SelectItem>
                <SelectItem value="inactive">Inactive only</SelectItem>
                <SelectItem value="all">All (active + inactive)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Medicines Table */}
      <Card className={cn(
        settings.theme === 'dark' && 'bg-gray-800 border-gray-700'
      )}>
        <CardHeader>
          <CardTitle className={settings.theme === 'dark' ? 'text-white' : ''}>
            {t('medicines.medicineList')} ({filteredMedicines.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.name')}</TableHead>
                  <TableHead>{t('medicines.generic')}</TableHead>
                  <TableHead>{t('common.category')}</TableHead>
                  <TableHead>{t('medicines.strength')}</TableHead>
                  <TableHead>{t('common.type')}</TableHead>
                  <TableHead>{t('medicines.barcode')}</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMedicines.map((medicine) => (
                  <TableRow key={medicine.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Pill className="w-4 h-4 text-emerald-500" />
                        <span className={cn(
                          'font-medium',
                          settings.theme === 'dark' ? 'text-white' : 'text-gray-900'
                        )}>
                          {medicine.name}
                        </span>
                        {medicine.isPrescriptionRequired && (
                          <Badge variant="destructive" className="text-xs">Rx</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{medicine.genericName}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{medicine.category}</Badge>
                    </TableCell>
                    <TableCell>{medicine.strength}</TableCell>
                    <TableCell>{medicine.dosageForm}</TableCell>
                    <TableCell>
                      {medicine.barcode ? (
                        <div className="flex items-center gap-1 text-sm text-gray-500">
                          <Barcode className="w-3 h-3" />
                          {medicine.barcode}
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StockCell medicine={medicine} batches={batches} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2 items-center">
                        {!medicine.isActive && (
                          <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">
                            Inactive
                          </Badge>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(medicine)}
                          title="Edit"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={medicine.isActive ? 'text-amber-600' : 'text-emerald-600'}
                          title={medicine.isActive ? 'Deactivate (hide from POS)' : 'Activate (show in POS)'}
                          onClick={() => {
                            updateMedicine(medicine.id, { isActive: !medicine.isActive });
                            toast.success(medicine.isActive
                              ? `${medicine.name} deactivated`
                              : `${medicine.name} reactivated`);
                          }}
                        >
                          {medicine.isActive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </Button>
                        {medicine.isActive && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-red-500"
                            onClick={() => openDeleteDialog(medicine)}
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Add Medicine Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('medicines.addNew')}</DialogTitle>
            <DialogDescription>
              {t('medicines.addNewDesc')}
            </DialogDescription>
          </DialogHeader>
          
          {medicineFormContent}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button 
              className="bg-emerald-500 hover:bg-emerald-600"
              onClick={handleAdd}
              disabled={!formData.name || !formData.genericName}
            >
              <Save className="w-4 h-4 mr-2" />
              {t('medicines.saveMedicine')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Medicine Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('medicines.editTitle')}</DialogTitle>
            <DialogDescription>
              {t('medicines.editDesc')}
            </DialogDescription>
          </DialogHeader>
          
          {medicineFormContent}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button 
              className="bg-emerald-500 hover:bg-emerald-600"
              onClick={handleEdit}
            >
              <Save className="w-4 h-4 mr-2" />
              {t('medicines.updateMedicine')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              {t('medicines.deleteTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('medicines.deleteConfirm', selectedMedicine?.name ?? '')}
            </DialogDescription>
          </DialogHeader>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="w-4 h-4 mr-2" />
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Barcode scan dialog. USB scanners type characters then press Enter. */}
      <Dialog open={showBarcodeScanDialog} onOpenChange={setShowBarcodeScanDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanLine className="w-5 h-5" /> Scan barcode
            </DialogTitle>
            <DialogDescription>
              Point your USB barcode scanner at the pack and pull the trigger. The code populates automatically when the scanner sends Enter.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              ref={scanInputRef}
              autoFocus
              value={scanBuffer}
              onChange={(e) => setScanBuffer(e.target.value)}
              placeholder="…awaiting scan…"
              className="font-mono text-center text-lg"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const raw = scanBuffer;
                  if (!raw.trim()) return;
                  const parsed = parseScannedCode(raw);
                  // Store the GTIN (the constant product id) so future scans of
                  // any pack of this product match; fall back to the raw code.
                  const codeToStore = parsed.gtin ?? raw.trim();
                  setFormData({
                    ...formData,
                    barcode: codeToStore,
                    ...(parsed.mrp != null ? { mrp: parsed.mrp } : {}),
                  });
                  // Auto-fill opening-stock batch fields from the scanned pack.
                  if (parsed.batchNumber || parsed.expiryDate || parsed.manufactureDate) {
                    setOpeningStock({
                      ...openingStock,
                      enabled: true,
                      batchNumber: parsed.batchNumber ?? openingStock.batchNumber,
                      expiryDate: parsed.expiryDate ? toDateInputValue(parsed.expiryDate) : openingStock.expiryDate,
                      manufacturingDate: parsed.manufactureDate ? toDateInputValue(parsed.manufactureDate) : openingStock.manufacturingDate,
                    });
                  }
                  setShowBarcodeScanDialog(false);
                  setScanBuffer('');
                  toast.success(parsed.gtin ? `GTIN ${parsed.gtin} captured` : `Barcode captured: ${codeToStore}`);
                }
              }}
            />
            <p className="text-xs text-gray-500 text-center">
              Or type the code manually and press Enter.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBarcodeScanDialog(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate-detection dialog: warn (don't hard-block) when the same
          name + strength + dosage form already exists. Owner can still proceed
          (e.g. same drug from a different manufacturer). */}
      <Dialog open={duplicateWarn != null} onOpenChange={(open) => !open && setDuplicateWarn(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertCircle className="w-5 h-5" /> Possible duplicate
            </DialogTitle>
            <DialogDescription>
              A medicine with the same name, strength, and dosage form already exists.
              Adding another may cause confusion in POS search and reorder alerts.
            </DialogDescription>
          </DialogHeader>
          {duplicateWarn?.existing && (
            <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm space-y-1">
              <div><span className="text-gray-600">Existing:</span> <span className="font-medium">{duplicateWarn.existing.name}</span></div>
              <div><span className="text-gray-600">Generic:</span> {duplicateWarn.existing.genericName}</div>
              <div><span className="text-gray-600">Strength:</span> {duplicateWarn.existing.strength}</div>
              <div><span className="text-gray-600">Form:</span> {duplicateWarn.existing.dosageForm}</div>
              {duplicateWarn.existing.manufacturer && <div><span className="text-gray-600">Manufacturer:</span> {duplicateWarn.existing.manufacturer}</div>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicateWarn(null)}>
              Cancel
            </Button>
            <Button onClick={() => duplicateWarn?.proceed()} className="bg-amber-600 hover:bg-amber-700">
              Add anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
