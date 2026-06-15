import { useEffect, useRef, useState } from 'react';
import { useInventoryStore, useAuthStore } from '@/store';
import { fetchStockByBranch, type StockByBranch } from '@/lib/backend';
import type { Medicine } from '@/types';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, Store, Loader2, PackageCheck, PackageX } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Optionally preselect a medicine (e.g. the out-of-stock item at the till). */
  initialMedicine?: Medicine | null;
}

// Cross-branch availability: search a medicine and see how much each branch
// holds. Answers "out of stock here — which branch has it?".
export function BranchStockDialog({ open, onOpenChange, initialMedicine }: Props) {
  const { searchMedicines } = useInventoryStore();
  const { activeBranchId, setActiveBranch } = useAuthStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Medicine[]>([]);
  const [picked, setPicked] = useState<Medicine | null>(null);
  const [stock, setStock] = useState<StockByBranch | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset / preselect each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setQuery(''); setResults([]); setStock(null);
    setPicked(initialMedicine ?? null);
    if (initialMedicine) void load(initialMedicine);
    else setTimeout(() => inputRef.current?.focus(), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialMedicine?.id]);

  const load = async (m: Medicine) => {
    setPicked(m); setResults([]); setQuery(m.name); setLoading(true);
    try {
      setStock(await fetchStockByBranch(m.id));
    } catch {
      setStock(null);
    } finally {
      setLoading(false);
    }
  };

  const onSearch = (q: string) => {
    setQuery(q);
    setPicked(null); setStock(null);
    setResults(q.trim().length >= 2 ? searchMedicines(q).slice(0, 8) : []);
  };

  const totalElsewhere = stock
    ? stock.branches.filter((b) => b.branchId !== activeBranchId).reduce((s, b) => s + b.quantity, 0)
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-[95vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Store className="w-4 h-4" /> Branch availability</DialogTitle>
          <DialogDescription>Search a medicine to see which branch has it in stock.</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Type a medicine name…"
            className="pl-9"
          />
          {results.length > 0 && (
            <div className="mt-1 w-full rounded-md border bg-white dark:bg-gray-800 shadow max-h-60 overflow-y-auto">
              {results.map((m) => (
                <button
                  key={m.id}
                  onClick={() => load(m)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <span className="font-medium">{m.name}</span>
                  {m.genericName && <span className="text-gray-400"> · {m.genericName}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-8 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        )}

        {picked && stock && !loading && (
          <div className="space-y-2">
            <p className="text-sm font-medium">{picked.name}</p>
            {stock.branches.map((b) => {
              const here = b.branchId === activeBranchId;
              const has = b.quantity > 0;
              return (
                <div
                  key={b.branchId}
                  className={cn(
                    'flex items-center justify-between rounded-lg border p-3',
                    here && 'border-emerald-300 bg-emerald-50/40 dark:bg-emerald-900/10',
                  )}
                >
                  <div className="flex items-center gap-2">
                    {has ? <PackageCheck className="w-4 h-4 text-emerald-600" /> : <PackageX className="w-4 h-4 text-gray-300" />}
                    <div>
                      <p className="text-sm font-medium flex items-center gap-2">
                        {b.branchName}
                        {here && <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 text-[10px]">You're here</Badge>}
                      </p>
                      {b.city && <p className="text-[11px] text-gray-400">{b.city}</p>}
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-3">
                    <div>
                      <p className={cn('font-bold tabular-nums', has ? 'text-emerald-600' : 'text-gray-300')}>{b.quantity}</p>
                      <p className="text-[10px] text-gray-400">{b.batches} batch{b.batches === 1 ? '' : 'es'}</p>
                    </div>
                    {!here && has && (
                      <Button size="sm" variant="outline" onClick={() => { setActiveBranch(b.branchId); onOpenChange(false); }}>
                        Switch
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
            {stock.branches.every((b) => b.quantity === 0) && (
              <p className="text-sm text-amber-600 text-center py-2">Out of stock in every branch.</p>
            )}
            {totalElsewhere > 0 && stock.branches.find((b) => b.branchId === activeBranchId)?.quantity === 0 && (
              <p className="text-xs text-gray-500 text-center">
                Out of stock here, but {totalElsewhere} available in other branches.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
