// POS unit options for a medicine. When loose sale is OFF, the smallest unit
// (e.g. a single tablet) is dropped so staff can only sell whole packs
// (strip/box). Returns active units sorted ascending by multiplier; always
// returns at least one unit so a medicine can never become unsellable.
import type { Medicine, MedicineUnit } from '@/types';

export function sellableUnits(medicine: Pick<Medicine, 'id' | 'unit' | 'units' | 'allowLooseSale'>): MedicineUnit[] {
  const active = (medicine.units ?? []).filter((u) => u.isActive).sort((a, b) => a.multiplier - b.multiplier);
  if (active.length === 0) {
    // No explicit unit ladder — synthesize a base unit from medicine.unit.
    return [{
      id: `${medicine.id}-base`,
      name: medicine.unit || 'unit',
      abbreviation: medicine.unit || 'unit',
      multiplier: 1,
      isBaseUnit: true,
      isActive: true,
    }];
  }
  if (medicine.allowLooseSale === false && active.length > 1) {
    // Drop the smallest tier (the loose unit); keep the higher pack units.
    const minMult = active[0].multiplier;
    const higher = active.filter((u) => u.multiplier > minMult);
    if (higher.length > 0) return higher;
  }
  return active;
}

/** The default unit to add with — smallest *sellable* unit (honours loose-off). */
export function defaultSellableUnit(
  medicine: Pick<Medicine, 'id' | 'unit' | 'units' | 'allowLooseSale'>,
): MedicineUnit {
  return sellableUnits(medicine)[0];
}
