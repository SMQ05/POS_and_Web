// Feature 5 — "Find alternatives" for a medicine we may not stock. Resolves the
// salt/generic (from our catalog if the query matches a product, else uses the
// query itself), then lists same-generic brands: the ones we stock (with live
// stock) plus other brands from the shared DRAP catalog we could order.
import { useState, useEffect, useCallback } from 'react';
import { useInventoryStore } from '@/store';
import { searchCatalog } from '@/lib/backend';
import { mergeAlternatives, type Alternative } from '@/lib/alternatives';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Pill, PlusCircle } from 'lucide-react';
import { toast } from 'sonner';

export function FindAlternativesDialog({
  open, onOpenChange, initialQuery, onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialQuery?: string;
  onPick?: (medicineId: string) => void; // called when an in-stock alternative is chosen
}) {
  const { medicines, getMedicineStock } = useInventoryStore();
  const [query, setQuery] = useState(initialQuery ?? '');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Alternative[]>([]);
  const [searchedGeneric, setSearchedGeneric] = useState('');

  useEffect(() => { if (open) setQuery(initialQuery ?? ''); }, [open, initialQuery]);

  const run = useCallback(async (raw: string) => {
    const q = raw.trim();
    if (q.length < 3) { setResults([]); setSearchedGeneric(''); return; }
    // Resolve the generic: if the query matches one of our products, use its
    // generic (so "Panadol" finds all paracetamol brands); else treat the query
    // itself as the salt.
    const matchMed = medicines.find((m) =>
      m.name.toLowerCase().includes(q.toLowerCase()) || (m.brandName ?? '').toLowerCase().includes(q.toLowerCase()));
    const generic = matchMed?.genericName?.trim() || q;
    setSearchedGeneric(generic);
    setLoading(true);
    try {
      const catalog = await searchCatalog({ generic }).catch(() => []);
      setResults(mergeAlternatives({
        generic,
        ourMedicines: medicines,
        stockOf: getMedicineStock,
        catalog,
        excludeMedicineId: matchMed?.id,
      }));
    } finally {
      setLoading(false);
    }
  }, [medicines, getMedicineStock]);

  // Auto-search when opened with a prefilled query.
  useEffect(() => { if (open && initialQuery && initialQuery.trim().length >= 3) run(initialQuery); }, [open, initialQuery, run]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Find alternatives</DialogTitle>
          <DialogDescription>
            Same-salt substitutes — brands you stock plus others from the shared catalog you can order.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') run(query); }}
            placeholder="Medicine name or salt (e.g. Panadol or Paracetamol)"
          />
          <Button onClick={() => run(query)} disabled={query.trim().length < 3} className="gap-2">
            <Search className="w-4 h-4" /> Search
          </Button>
        </div>

        {searchedGeneric && (
          <p className="text-xs text-gray-500">Salt / generic: <span className="font-medium">{searchedGeneric}</span></p>
        )}

        <ScrollArea className="max-h-[50vh]">
          {loading ? (
            <p className="text-sm text-gray-500 py-8 text-center">Searching…</p>
          ) : results.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">{searchedGeneric ? 'No alternatives found.' : 'Enter a medicine or salt to search.'}</p>
          ) : (
            <div className="space-y-1.5">
              {results.map((a) => (
                <div key={a.key} className="flex items-center justify-between gap-3 rounded-md border p-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Pill className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="font-medium text-sm truncate">{a.brand}</span>
                      {a.strength && <span className="text-xs text-gray-500">{a.strength}</span>}
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      {a.genericName}{a.dosageForm ? ` · ${a.dosageForm}` : ''}{a.manufacturer ? ` · ${a.manufacturer}` : ''}
                    </p>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    {a.inStock ? (
                      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 text-[10px]">In stock: {a.stockQty}</Badge>
                    ) : a.source === 'stock' ? (
                      <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">Out of stock</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-gray-500">Can order</Badge>
                    )}
                    {a.inStock && a.medicineId && onPick && (
                      <Button size="sm" variant="ghost" className="h-7 gap-1 text-emerald-700"
                        onClick={() => { onPick(a.medicineId!); onOpenChange(false); }}>
                        <PlusCircle className="w-3.5 h-3.5" /> Add
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
