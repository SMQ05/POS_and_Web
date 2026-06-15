import { useState, useMemo } from 'react';
import { useInventoryStore, useSettingsStore } from '@/store';
import { useTranslation } from '@/hooks/useTranslation';
import { cn, formatCurrency } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Search,
  Package,
  AlertTriangle,
  Flame,
  Calendar,
  X,
  MapPin,
  Pill,
  TrendingDown,
  Activity,
  DollarSign,
  Plus,
} from 'lucide-react';
import type { Medicine, MedicineCategory, DosageForm } from '@/types';

interface MedicineSearchItem {
  id: string;
  name: string;
  genericName?: string;
  brandName?: string;
  category?: string;
  reorderLevel: number;
  isActive: boolean;
  unit: string;
  totalStock: number;
}

export function MobileInventory() {
  const { medicines, batches, searchMedicines, getMedicineStock, getFEFOBatchesByMedicine, addMedicine } = useInventoryStore();
  // M8 — mobile quick-add medicine. Essentials only (name + dosage form +
  // strength + sale price + min stock). Full FBR/unit editing stays on desktop.
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [newName, setNewName] = useState('');
  const [newGeneric, setNewGeneric] = useState('');
  const [newCategory, setNewCategory] = useState<MedicineCategory>('tablets');
  const [newDosage, setNewDosage] = useState<DosageForm>('tablet');
  const [newStrength, setNewStrength] = useState('');
  const [newMrp, setNewMrp] = useState('');
  const [newReorder, setNewReorder] = useState('50');
  const { settings } = useSettingsStore();
  const { t } = useTranslation();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'low_stock' | 'near_expiry'>('all');
  const [selectedMedicine, setSelectedMedicine] = useState<MedicineSearchItem | null>(null);

  // Compute live list
  const medicineList = useMemo(() => {
    const list = medicines.filter(m => m.isActive).map(m => ({
      id: m.id,
      name: m.name,
      genericName: m.genericName,
      brandName: m.brandName,
      category: m.category,
      reorderLevel: m.reorderLevel,
      isActive: m.isActive,
      unit: m.unit,
      totalStock: getMedicineStock(m.id)
    }));

    // Filter by query
    let filtered = list;
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase();
      filtered = list.filter(
        m =>
          m.name.toLowerCase().includes(q) ||
          (m.genericName && m.genericName.toLowerCase().includes(q)) ||
          (m.brandName && m.brandName.toLowerCase().includes(q))
      );
    }

    // Filter by quick actions
    if (activeFilter === 'low_stock') {
      filtered = filtered.filter(m => m.totalStock <= m.reorderLevel && m.reorderLevel > 0);
    } else if (activeFilter === 'near_expiry') {
      const today = new Date();
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + 90); // 90 days
      const expiringMeds = new Set(
        batches
          .filter(b => b.isActive && b.quantity > 0 && new Date(b.expiryDate) <= cutoff)
          .map(b => b.medicineId)
      );
      filtered = filtered.filter(m => expiringMeds.has(m.id));
    }

    return filtered;
  }, [medicines, batches, searchQuery, activeFilter, getMedicineStock]);

  const activeBatchesForSelected = useMemo(() => {
    if (!selectedMedicine) return [];
    return getFEFOBatchesByMedicine(selectedMedicine.id);
  }, [selectedMedicine, getFEFOBatchesByMedicine]);

  const getDaysLeft = (expiry: Date) => {
    return Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000);
  };

  const getExpiryBadgeClass = (days: number) => {
    if (days <= 30) return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20';
    if (days <= 60) return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
    return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
  };

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Inventory Control
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Real-time branch stock level monitor
          </p>
        </div>
        <button
          onClick={() => setShowAddSheet(true)}
          className="h-10 px-3 rounded-2xl bg-emerald-500 text-white text-xs font-bold flex items-center gap-1 active:scale-95"
        >
          <Plus className="w-4 h-4" /> Quick add
        </button>
      </div>

      {/* Sticky Search bar */}
      <div className="relative">
        <Search className="absolute left-3.5 top-3 w-4 h-4 text-gray-400" />
        <Input
          type="text"
          placeholder="Search brand, formula, generic name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 h-11 bg-white dark:bg-gray-900 border-gray-150 dark:border-gray-800 rounded-2xl shadow-sm text-sm"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-3 w-5 h-5 flex items-center justify-center text-gray-400 active:text-gray-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Horizontal filter capsules */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setActiveFilter('all')}
          className={cn(
            'px-4 py-2 rounded-full text-xs font-semibold border transition-all whitespace-nowrap active:scale-95',
            activeFilter === 'all'
              ? 'bg-emerald-500 text-white border-emerald-500 shadow-md shadow-emerald-500/20'
              : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-100 dark:border-gray-800'
          )}
        >
          All Items ({medicines.filter(m => m.isActive).length})
        </button>

        <button
          onClick={() => setActiveFilter('low_stock')}
          className={cn(
            'px-4 py-2 rounded-full text-xs font-semibold border transition-all whitespace-nowrap flex items-center gap-1.5 active:scale-95',
            activeFilter === 'low_stock'
              ? 'bg-red-500 text-white border-red-500 shadow-md shadow-red-500/20'
              : 'bg-white dark:bg-gray-900 text-red-600 dark:text-red-400 border-red-100 dark:border-gray-800'
          )}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          Low Stock
        </button>

        <button
          onClick={() => setActiveFilter('near_expiry')}
          className={cn(
            'px-4 py-2 rounded-full text-xs font-semibold border transition-all whitespace-nowrap flex items-center gap-1.5 active:scale-95',
            activeFilter === 'near_expiry'
              ? 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/20'
              : 'bg-white dark:bg-gray-900 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-gray-800'
          )}
        >
          <Flame className="w-3.5 h-3.5" />
          Near Expiry
        </button>
      </div>

      {/* Stock Cards Listing */}
      <div className="space-y-3">
        {medicineList.map((med) => {
          const isLow = med.totalStock <= med.reorderLevel && med.reorderLevel > 0;
          return (
            <Card
              key={med.id}
              onClick={() => setSelectedMedicine(med)}
              className={cn(
                'border bg-white dark:bg-gray-900 rounded-2xl active:bg-gray-50 dark:active:bg-gray-800 transition-colors shadow-sm cursor-pointer',
                isLow ? 'border-red-200/50 dark:border-red-500/20' : 'border-gray-100 dark:border-gray-800'
              )}
            >
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <div className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-white shadow-md',
                    isLow ? 'bg-red-500 shadow-red-500/10' : 'bg-emerald-500 shadow-emerald-500/10'
                  )}>
                    <Pill className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white truncate">
                      {med.name}
                    </h4>
                    {med.brandName && (
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate -mt-0.5">
                        Brand: {med.brandName}
                      </p>
                    )}
                    {med.genericName && (
                      <p className="text-[10px] text-gray-400 truncate italic">
                        {med.genericName}
                      </p>
                    )}
                  </div>
                </div>

                <div className="text-right flex-shrink-0">
                  <p className={cn(
                    'text-base font-extrabold',
                    med.totalStock === 0 ? 'text-gray-400' : isLow ? 'text-red-500' : 'text-gray-900 dark:text-white'
                  )}>
                    {med.totalStock}
                  </p>
                  <p className="text-[9px] text-gray-400 font-medium">
                    {med.unit} left
                  </p>
                  {isLow && (
                    <Badge variant="destructive" className="text-[8px] py-0 px-1.5 h-4 mt-1 font-bold">
                      LOW
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}

        {medicineList.length === 0 && (
          <div className="text-center py-10 space-y-2">
            <Package className="w-10 h-10 text-gray-300 mx-auto" />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              No matching medicines found in this filter.
            </p>
          </div>
        )}
      </div>

      {/* Touch Batch Details bottom sheet overlay */}
      {selectedMedicine && (
        <div className="fixed inset-0 z-50 flex flex-end bg-black/60 backdrop-blur-sm transition-opacity">
          <div className="w-full mt-auto bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 rounded-t-3xl shadow-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto">
            {/* Sheet Title */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                  <Pill className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">
                    {selectedMedicine.name}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Category: {selectedMedicine.category ?? 'General'} • Reorder min: {selectedMedicine.reorderLevel}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedMedicine(null)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 active:scale-90"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Overall Info Bar */}
            <div className="grid grid-cols-2 gap-3 p-3 rounded-2xl bg-gray-50 dark:bg-gray-800/50">
              <div>
                <p className="text-[10px] text-gray-400 font-medium">Total Quantity</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {selectedMedicine.totalStock} <span className="text-xs font-semibold text-gray-400">{selectedMedicine.unit}</span>
                </p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 font-medium">Status</p>
                <p className={cn(
                  'text-xs font-bold mt-1',
                  selectedMedicine.totalStock === 0 ? 'text-gray-500' :
                  selectedMedicine.totalStock <= selectedMedicine.reorderLevel ? 'text-red-500' : 'text-emerald-500'
                )}>
                  {selectedMedicine.totalStock === 0 ? 'Out of Stock' :
                   selectedMedicine.totalStock <= selectedMedicine.reorderLevel ? 'Restock Needed' : 'In Stock'}
                </p>
              </div>
            </div>

            {/* Batches Header */}
            <div>
              <h4 className="text-xs font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider mb-2">
                Available Batches (FEFO Sorted)
              </h4>

              <div className="space-y-2">
                {activeBatchesForSelected.map((batch) => {
                  const daysLeft = getDaysLeft(batch.expiryDate);
                  return (
                    <div
                      key={batch.id}
                      className="p-3 rounded-xl border border-gray-100 dark:border-gray-800 flex flex-col gap-2 bg-white dark:bg-gray-950"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs font-bold text-gray-900 dark:text-white">
                            Batch {batch.batchNumber}
                          </span>
                          <span className="text-[9px] text-gray-400 ml-2">
                            Qty: {batch.quantity}
                          </span>
                        </div>

                        <Badge
                          variant="outline"
                          className={cn('text-[9px] py-0 px-2 h-4 font-bold border', getExpiryBadgeClass(daysLeft))}
                        >
                          {daysLeft <= 0 ? 'Expired' : `${daysLeft}d left`}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-gray-400" />
                          <span>Exp: {new Date(batch.expiryDate).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center gap-1 font-semibold">
                          <DollarSign className="w-3.5 h-3.5 text-gray-400" />
                          <span>Sell: Rs. {batch.salePrice}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {activeBatchesForSelected.length === 0 && (
                  <p className="text-center text-xs text-gray-400 dark:text-gray-500 py-4">
                    No active batches found. Needs inventory batch entry.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* M8 — Quick-add medicine sheet. Essentials only — full FBR/units/pricing
          tabs stay on desktop where the keyboard is friendlier. */}
      {showAddSheet && (
        <div className="fixed inset-0 z-50 flex flex-end bg-black/60 backdrop-blur-sm">
          <div className="w-full mt-auto bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 rounded-t-3xl shadow-2xl p-5 space-y-4 max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">Quick add medicine</h3>
              <button onClick={() => setShowAddSheet(false)} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 active:scale-90">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[10px] text-gray-500 -mt-2">Use desktop for full FBR fields, pricing tiers and units.</p>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500">Brand name</label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} className="h-10 rounded-xl" autoFocus />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500">Generic name</label>
                <Input value={newGeneric} onChange={(e) => setNewGeneric(e.target.value)} className="h-10 rounded-xl" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-gray-500">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as MedicineCategory)}
                    className="h-10 rounded-xl bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 px-3 text-sm w-full"
                  >
                    {['tablets','capsules','caplets','syrups','injections','ampoules','infusions','drops','creams','ointments','inhalers','powders','granules','surgical','medical_instruments','shampoo','soap','otc'].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-gray-500">Dosage form</label>
                  <select
                    value={newDosage}
                    onChange={(e) => setNewDosage(e.target.value as DosageForm)}
                    className="h-10 rounded-xl bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 px-3 text-sm w-full"
                  >
                    {['tablet','caplet','capsule','syrup','injection','ampoule','infusion','drop','cream','ointment','inhaler','powder','granules','solution','shampoo','soap'].map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-gray-500">Strength</label>
                  <Input value={newStrength} onChange={(e) => setNewStrength(e.target.value)} placeholder="e.g. 500mg" className="h-10 rounded-xl" />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-gray-500">MRP (Rs.)</label>
                  <Input value={newMrp} onChange={(e) => setNewMrp(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" className="h-10 rounded-xl" />
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500">Min stock alert (base units)</label>
                <Input value={newReorder} onChange={(e) => setNewReorder(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className="h-10 rounded-xl" />
              </div>
            </div>
            <button
              onClick={() => {
                const name = newName.trim();
                if (!name) { toast.error('Brand name required'); return; }
                const id = `m-${Date.now()}`;
                addMedicine({
                  id,
                  name,
                  genericName: newGeneric.trim() || name,
                  category: newCategory,
                  dosageForm: newDosage,
                  strength: newStrength.trim() || '—',
                  unit: newDosage,
                  units: [{ id: `${id}-base`, name: newDosage, abbreviation: newDosage, multiplier: 1, isBaseUnit: true, isActive: true }],
                  isPrescriptionRequired: false,
                  classification: 'otc',
                  isActive: true,
                  webLive: false,
                  reorderLevel: parseInt(newReorder, 10) || 0,
                  reorderQuantity: parseInt(newReorder, 10) || 0,
                  reorderActive: true,
                  mrp: newMrp ? parseFloat(newMrp) : undefined,
                  allowLooseSale: true,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                });
                toast.success(`${name} added`);
                setShowAddSheet(false);
                setNewName(''); setNewGeneric(''); setNewStrength(''); setNewMrp(''); setNewReorder('50');
              }}
              className="w-full h-12 rounded-2xl bg-emerald-500 text-white font-bold active:scale-95"
            >
              Add medicine
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
