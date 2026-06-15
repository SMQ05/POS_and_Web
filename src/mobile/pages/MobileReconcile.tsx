import { useEffect, useRef, useState } from 'react';
import { useInventoryStore } from '@/store';
import {
  fetchReconcileRuns,
  createReconcileRun,
  fetchReconcileEntries,
  upsertReconcileEntry,
  postReconcileRun,
  type ReconcileRunDTO,
  type ReconcileEntryDTO,
} from '@/lib/backend';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ScanLine, Send, Plus, Check } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  onClose: () => void;
}

// M4 — Mobile-first stock-take. Cashier scans a barcode (USB or camera typing
// via on-screen keyboard), the matching medicine + its batches show up; they
// type a counted qty per batch; variance is computed live; "Post" finalises
// the run. Optimised for one-handed phone use during shelf counts.
export function MobileReconcile({ onClose }: Props) {
  const { medicines, batches } = useInventoryStore();

  const [runs, setRuns] = useState<ReconcileRunDTO[]>([]);
  const [activeRun, setActiveRun] = useState<ReconcileRunDTO | null>(null);
  const [entries, setEntries] = useState<ReconcileEntryDTO[]>([]);
  const [scanText, setScanText] = useState('');
  const [selectedMedId, setSelectedMedId] = useState<string | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const list = await fetchReconcileRuns();
        setRuns(list);
        // Auto-resume any open run, or create a new "all" scope one so the
        // user can just start counting.
        const open = list.find((r) => r.status === 'open');
        if (open) {
          setActiveRun(open);
          setEntries(await fetchReconcileEntries(open.id));
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Unable to load runs');
      }
    })();
  }, []);

  const startNewAll = async () => {
    try {
      const run = await createReconcileRun({ scope: 'all', notes: 'Mobile stock-take' });
      setActiveRun(run);
      setEntries([]);
      setRuns((prev) => [run, ...prev]);
      toast.success('Run started');
      setTimeout(() => scanRef.current?.focus(), 50);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start run');
    }
  };

  // M4 — barcode resolves to a medicine, then we surface its batches below.
  // Falls back to name-substring lookup so typing "panadol" works too.
  const handleScanSubmit = () => {
    const code = scanText.trim();
    if (!code) return;
    let match = medicines.find((m) => m.barcode && m.barcode.trim() === code);
    if (!match) {
      const lower = code.toLowerCase();
      match = medicines.find((m) => m.name.toLowerCase().includes(lower));
    }
    if (!match) {
      toast.error(`No medicine matches "${code}"`);
      return;
    }
    setSelectedMedId(match.id);
    setScanText('');
  };

  const handleCount = async (batchId: string, value: string) => {
    if (!activeRun) return;
    const v = parseInt(value, 10);
    if (!Number.isFinite(v) || v < 0) return;
    const batch = batches.find((b) => b.id === batchId);
    if (!batch) return;
    try {
      const row = await upsertReconcileEntry(activeRun.id, {
        medicineId: batch.medicineId,
        batchId: batch.id,
        systemQty: batch.quantity,
        countedQty: v,
      });
      setEntries((prev) => {
        const idx = prev.findIndex((e) => e.id === row.id);
        if (idx >= 0) { const next = [...prev]; next[idx] = row; return next; }
        return [...prev, row];
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const handlePost = async () => {
    if (!activeRun) return;
    if (!confirm('Post this run? Stock will be adjusted.')) return;
    try {
      const updated = await postReconcileRun(activeRun.id);
      setActiveRun(updated);
      toast.success('Reconcile posted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Post failed');
    }
  };

  const selectedMed = selectedMedId ? medicines.find((m) => m.id === selectedMedId) : null;
  const selectedBatches = selectedMed
    ? batches.filter((b) => b.medicineId === selectedMed.id && b.isActive)
    : [];

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-gray-950 flex flex-col">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onClose}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-sm">Stock-take</h2>
          {activeRun ? (
            <p className="text-[10px] text-gray-500">
              {activeRun.scope.toUpperCase()} · {activeRun.status} · {entries.length} entered
            </p>
          ) : (
            <p className="text-[10px] text-gray-500">No active run</p>
          )}
        </div>
        {activeRun?.status === 'open' && (
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 gap-1" onClick={handlePost} disabled={entries.length === 0}>
            <Send className="w-3 h-3" /> Post
          </Button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {!activeRun ? (
          <div className="text-center py-16 space-y-3">
            <p className="text-sm text-gray-500">Start a new run to begin counting.</p>
            <Button onClick={startNewAll} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
              <Plus className="w-4 h-4" /> Start "whole inventory" run
            </Button>
          </div>
        ) : (
          <>
            <form
              onSubmit={(e) => { e.preventDefault(); handleScanSubmit(); }}
              className="flex gap-2"
            >
              <div className="relative flex-1">
                <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  ref={scanRef}
                  value={scanText}
                  onChange={(e) => setScanText(e.target.value)}
                  placeholder="Scan or type barcode / name"
                  className="pl-9 h-10 text-sm"
                  autoFocus
                  disabled={activeRun.status !== 'open'}
                />
              </div>
              <Button type="submit" size="sm" disabled={activeRun.status !== 'open' || !scanText.trim()}>Find</Button>
            </form>

            {selectedMed && (
              <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate">{selectedMed.name}</p>
                    <p className="text-[11px] text-gray-500 truncate">{selectedMed.genericName} · {selectedMed.strength}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedMedId(null)}>
                    Done
                  </Button>
                </div>
                {selectedBatches.length === 0 ? (
                  <p className="text-xs text-gray-500 py-2">No active batches.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedBatches.map((b) => {
                      const e = entries.find((x) => x.batchId === b.id);
                      const variance = e ? e.countedQty - b.quantity : undefined;
                      return (
                        <div key={b.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-900">
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-medium truncate">Batch {b.batchNumber}</p>
                            <p className="text-[10px] text-gray-500">System: {b.quantity} · Exp {new Date(b.expiryDate).toLocaleDateString()}</p>
                          </div>
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            defaultValue={e?.countedQty ?? ''}
                            onBlur={(ev) => { if (ev.target.value !== '') handleCount(b.id, ev.target.value); }}
                            disabled={activeRun.status !== 'open'}
                            placeholder="Count"
                            className="h-8 w-20 text-right text-sm tabular-nums"
                          />
                          {variance != null && (
                            <Badge
                              className={
                                variance > 0 ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                  : variance < 0 ? 'bg-red-100 text-red-700 border-red-200'
                                    : 'bg-gray-100 text-gray-600 border-gray-200'
                              }
                            >
                              {variance > 0 ? `+${variance}` : variance}
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {entries.length > 0 && (
              <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-3 space-y-2">
                <p className="text-[11px] uppercase text-gray-500 tracking-wider">Counted so far ({entries.length})</p>
                {entries.slice(-6).reverse().map((e) => {
                  const m = medicines.find((x) => x.id === e.medicineId);
                  return (
                    <div key={e.id} className="flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0 flex items-center gap-2">
                        <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                        <span className="truncate">{m?.name ?? e.medicineId}</span>
                      </div>
                      <Badge
                        className={
                          e.variance > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : e.variance < 0 ? 'bg-red-50 text-red-700 border-red-200'
                              : 'bg-gray-50 text-gray-600 border-gray-200'
                        }
                      >
                        {e.countedQty} / {e.systemQty}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}

            {runs.length > 1 && (
              <p className="text-[10px] text-gray-400 text-center pt-4">
                Previous runs are viewable on the desktop &quot;Reconcile&quot; page.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
