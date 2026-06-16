import { useEffect, useMemo, useState } from 'react';
import { useInventoryStore, useSupplierStore, useSettingsStore, useAuthStore } from '@/store';
import {
  fetchReconcileRuns,
  createReconcileRun,
  fetchReconcileEntries,
  upsertReconcileEntry,
  postReconcileRun,
  cancelReconcileRun,
  type ReconcileRunDTO,
  type ReconcileEntryDTO,
} from '@/lib/backend';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ClipboardCheck, Plus, Save, Send, Trash2, Search, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const SCOPE_OPTIONS: { value: ReconcileRunDTO['scope']; label: string; needsValue: boolean }[] = [
  { value: 'all', label: 'Whole inventory', needsValue: false },
  { value: 'category', label: 'One category', needsValue: true },
  { value: 'shelf', label: 'One shelf / rack', needsValue: true },
  { value: 'medicine', label: 'Single medicine', needsValue: true },
  { value: 'supplier', label: 'One distributor', needsValue: true },
];

export function Reconcile() {
  const { settings } = useSettingsStore();
  const { medicines, batches } = useInventoryStore();
  const { suppliers, medicineSuppliers } = useSupplierStore();
  const { activeBranchId } = useAuthStore();

  const [runs, setRuns] = useState<ReconcileRunDTO[]>([]);
  const [activeRun, setActiveRun] = useState<ReconcileRunDTO | null>(null);
  const [entries, setEntries] = useState<ReconcileEntryDTO[]>([]);

  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newScope, setNewScope] = useState<ReconcileRunDTO['scope']>('all');
  const [newScopeValue, setNewScopeValue] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');

  const refreshRuns = async () => {
    try {
      setRuns(await fetchReconcileRuns());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to load runs');
    }
  };

  useEffect(() => { refreshRuns(); }, []);

  const openRun = async (run: ReconcileRunDTO) => {
    setActiveRun(run);
    try {
      setEntries(await fetchReconcileEntries(run.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to load entries');
    }
  };

  // M4 — figure out which batches fall inside the run's scope. Drives the
  // counted-qty editor: "everything you should count for this run".
  const scopedBatches = useMemo(() => {
    if (!activeRun) return [];
    return batches.filter((b) => {
      const med = medicines.find((m) => m.id === b.medicineId);
      if (!med || !med.isActive) return false;
      // Only the active branch's live (non-disposed) batches are countable.
      if (activeBranchId && b.branchId && b.branchId !== activeBranchId) return false;
      if (b.isActive === false) return false;
      if (b.disposition && b.disposition !== 'active') return false;
      switch (activeRun.scope) {
        case 'all': return true;
        case 'category': return activeRun.scopeValue ? med.category === activeRun.scopeValue : true;
        case 'shelf':
          if (!activeRun.scopeValue) return true;
          const needle = activeRun.scopeValue.toLowerCase();
          return (med.shelfLocation ?? '').toLowerCase().includes(needle) || (med.rackNumber ?? '').toLowerCase().includes(needle);
        case 'medicine': return med.id === activeRun.scopeValue;
        case 'supplier':
          if (!activeRun.scopeValue) return true;
          if (b.supplierId === activeRun.scopeValue) return true;
          return medicineSuppliers.some((m) => m.medicineId === med.id && m.supplierId === activeRun.scopeValue);
        default: return true;
      }
    });
  }, [activeRun, batches, medicines, medicineSuppliers, activeBranchId]);

  const filteredBatches = useMemo(() => {
    if (!search) return scopedBatches;
    const needle = search.toLowerCase();
    return scopedBatches.filter((b) => {
      const m = medicines.find((x) => x.id === b.medicineId);
      return (m?.name ?? '').toLowerCase().includes(needle)
        || (m?.genericName ?? '').toLowerCase().includes(needle)
        || (m?.barcode ?? '').includes(needle)
        || b.batchNumber.toLowerCase().includes(needle);
    });
  }, [scopedBatches, search, medicines]);

  const entryFor = (batchId: string): ReconcileEntryDTO | undefined =>
    entries.find((e) => e.batchId === batchId);

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
      toast.error(err instanceof Error ? err.message : 'Failed to save count');
    }
  };

  const handlePost = async () => {
    if (!activeRun) return;
    if (!confirm('Post this run? Batch quantities will be adjusted and a ledger entry written. This cannot be undone.')) return;
    try {
      const updated = await postReconcileRun(activeRun.id);
      // Bug fix — reflect the posted adjustments in the local inventory cache so
      // the UI (and every other screen) shows the new quantities immediately
      // instead of stale ones until a reload. Mirrors the server: each counted
      // batch becomes its counted qty. setState only — the server already wrote.
      const counted = new Map(entries.filter((e) => e.batchId && e.variance !== 0).map((e) => [e.batchId as string, Math.max(0, e.countedQty)]));
      if (counted.size > 0) {
        useInventoryStore.setState((s) => ({
          batches: s.batches.map((b) => (counted.has(b.id) ? { ...b, quantity: counted.get(b.id)! } : b)),
        }));
      }
      setActiveRun(updated);
      await refreshRuns();
      toast.success('Reconcile run posted — stock adjusted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to post run');
    }
  };

  const handleCancel = async () => {
    if (!activeRun) return;
    if (!confirm('Cancel this run? Entered counts are discarded.')) return;
    try {
      await cancelReconcileRun(activeRun.id);
      setActiveRun(null);
      setEntries([]);
      await refreshRuns();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel run');
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const run = await createReconcileRun({
        scope: newScope,
        scopeValue: newScopeValue || undefined,
        notes: newNotes || undefined,
      });
      setShowNewDialog(false);
      setNewScope('all'); setNewScopeValue(''); setNewNotes('');
      await refreshRuns();
      await openRun(run);
      toast.success('Reconcile run started');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start run');
    } finally {
      setCreating(false);
    }
  };

  const totals = useMemo(() => {
    const positive = entries.reduce((s, e) => s + Math.max(0, e.variance), 0);
    const negative = entries.reduce((s, e) => s + Math.min(0, e.variance), 0);
    return { entered: entries.length, positive, negative };
  }, [entries]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    medicines.forEach((m) => m.category && set.add(m.category));
    return [...set].sort();
  }, [medicines]);

  const dark = settings.theme === 'dark';

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="w-6 h-6 text-emerald-600" />
          <div>
            <h1 className="text-2xl font-bold">Reconcile stock</h1>
            <p className="text-xs text-gray-500">Physical count → variance → post to adjust on-shelf stock.</p>
          </div>
        </div>
        <Button onClick={() => setShowNewDialog(true)} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
          <Plus className="w-4 h-4" /> Start new run
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[300px,1fr] gap-4">
        <Card className={cn(dark && 'bg-gray-800 border-gray-700')}>
          <CardHeader>
            <CardTitle className="text-base">Runs ({runs.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[calc(100vh-22rem)]">
              {runs.length === 0 ? (
                <p className="text-xs text-gray-500 p-4">No runs yet. Start your first one with the button above.</p>
              ) : (
                <div className="space-y-1 p-2">
                  {runs.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => openRun(r)}
                      className={cn(
                        'w-full text-left p-2 rounded-md text-sm',
                        activeRun?.id === r.id ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'hover:bg-gray-100 dark:hover:bg-gray-700',
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium capitalize">{r.scope.replace('_', ' ')}</span>
                        <Badge variant={r.status === 'posted' ? 'success' : r.status === 'open' ? 'secondary' : 'destructive'} className="text-[10px] capitalize">{r.status}</Badge>
                      </div>
                      <p className="text-[11px] text-gray-500">{new Date(r.startedAt).toLocaleString()}</p>
                      {r.scopeValue && <p className="text-[11px] text-gray-600 truncate">{r.scopeValue}</p>}
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className={cn(dark && 'bg-gray-800 border-gray-700')}>
          {!activeRun ? (
            <CardContent className="py-16 text-center text-gray-500">
              <ClipboardCheck className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>Pick a run on the left or start a new one.</p>
            </CardContent>
          ) : (
            <>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <CardTitle className="text-base capitalize">
                      {activeRun.scope.replace('_', ' ')}
                      {activeRun.scopeValue && <span className="text-sm text-gray-500 font-normal"> — {activeRun.scopeValue}</span>}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Started {new Date(activeRun.startedAt).toLocaleString()} ·
                      {activeRun.status === 'open' ? ' Open' : activeRun.status === 'posted' ? ' Posted ' + new Date(activeRun.completedAt!).toLocaleDateString() : ' Cancelled'}
                    </CardDescription>
                  </div>
                  {activeRun.status === 'open' && (
                    <div className="flex gap-2">
                      <Button onClick={handleCancel} variant="outline" size="sm" className="text-red-600 border-red-300 gap-1">
                        <Trash2 className="w-3 h-3" /> Cancel
                      </Button>
                      <Button onClick={handlePost} size="sm" className="bg-emerald-600 hover:bg-emerald-700 gap-1" disabled={entries.length === 0}>
                        <Send className="w-3 h-3" /> Post adjustments
                      </Button>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                  <div className="rounded border p-2">
                    <p className="text-gray-500">Entered</p>
                    <p className="font-bold">{totals.entered}</p>
                  </div>
                  <div className="rounded border p-2 bg-emerald-50/50">
                    <p className="text-emerald-700">Overage</p>
                    <p className="font-bold text-emerald-700">+{totals.positive}</p>
                  </div>
                  <div className="rounded border p-2 bg-red-50/50">
                    <p className="text-red-700">Shortage</p>
                    <p className="font-bold text-red-700">{totals.negative}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="p-3 border-t">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      placeholder="Filter medicines / batches…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <ScrollArea className="h-[calc(100vh-30rem)]">
                  {filteredBatches.length === 0 ? (
                    <p className="text-xs text-gray-500 p-6 text-center">
                      No batches match this run's scope.
                      {activeRun.scope !== 'all' && ' Try widening the scope or check the scope value.'}
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Medicine / Batch</TableHead>
                          <TableHead className="text-right">System qty</TableHead>
                          <TableHead className="text-right">Counted</TableHead>
                          <TableHead className="text-right">Variance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredBatches.map((b) => {
                          const m = medicines.find((x) => x.id === b.medicineId);
                          const e = entryFor(b.id);
                          const variance = e ? e.countedQty - b.quantity : undefined;
                          return (
                            <TableRow key={b.id}>
                              <TableCell>
                                <div className="text-sm font-medium">{m?.name ?? b.medicineId}</div>
                                <div className="text-[11px] text-gray-500">Batch {b.batchNumber} · exp {new Date(b.expiryDate).toLocaleDateString()}</div>
                              </TableCell>
                              <TableCell className="text-right text-sm tabular-nums">{b.quantity}</TableCell>
                              <TableCell className="text-right">
                                <Input
                                  type="number"
                                  min={0}
                                  defaultValue={e?.countedQty ?? ''}
                                  onBlur={(ev) => { if (ev.target.value !== '') handleCount(b.id, ev.target.value); }}
                                  onKeyDown={(ev) => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur(); }}
                                  disabled={activeRun.status !== 'open'}
                                  className="h-8 w-24 text-right text-sm tabular-nums ml-auto"
                                />
                              </TableCell>
                              <TableCell className={cn(
                                'text-right text-sm tabular-nums font-medium',
                                variance == null ? 'text-gray-400'
                                  : variance > 0 ? 'text-emerald-700'
                                    : variance < 0 ? 'text-red-700'
                                      : 'text-gray-500',
                              )}>
                                {variance == null ? '—' : (variance > 0 ? `+${variance}` : variance)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </ScrollArea>
                {activeRun.status === 'posted' && entries.some((e) => e.variance !== 0) && (
                  <div className="m-3 p-3 bg-amber-50 border border-amber-200 rounded text-xs flex gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <p>This run has been posted. Batch quantities and the ledger have already been updated; the entry editor is read-only.</p>
                  </div>
                )}
              </CardContent>
            </>
          )}
        </Card>
      </div>

      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start a reconcile run</DialogTitle>
            <DialogDescription>Pick the scope of stock you want to count.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Scope</Label>
              <Select value={newScope} onValueChange={(v) => { setNewScope(v as ReconcileRunDTO['scope']); setNewScopeValue(''); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SCOPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {newScope === 'category' && (
              <div>
                <Label className="text-xs">Category</Label>
                <Select value={newScopeValue} onValueChange={setNewScopeValue}>
                  <SelectTrigger><SelectValue placeholder="Pick a category" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {newScope === 'shelf' && (
              <div>
                <Label className="text-xs">Shelf or rack (substring match)</Label>
                <Input placeholder="e.g. R-12" value={newScopeValue} onChange={(e) => setNewScopeValue(e.target.value)} />
              </div>
            )}
            {newScope === 'medicine' && (
              <div>
                <Label className="text-xs">Medicine</Label>
                <Select value={newScopeValue} onValueChange={setNewScopeValue}>
                  <SelectTrigger><SelectValue placeholder="Pick a medicine" /></SelectTrigger>
                  <SelectContent>
                    {medicines.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {newScope === 'supplier' && (
              <div>
                <Label className="text-xs">Distributor</Label>
                <Select value={newScopeValue} onValueChange={setNewScopeValue}>
                  <SelectTrigger><SelectValue placeholder="Pick a supplier" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-xs">Notes (optional)</Label>
              <Input value={newNotes} onChange={(e) => setNewNotes(e.target.value)} placeholder="Optional context" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewDialog(false)} disabled={creating}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
              <Save className="w-4 h-4" /> Start run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
