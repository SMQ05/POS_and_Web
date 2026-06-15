import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchAuditLogs, type AuditLogRow } from '@/lib/backend';
import { exportToCSV } from '@/lib/csv';
import { useSupplierStore, useInventoryStore, useSettingsStore } from '@/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { ClipboardList, Download, Filter, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const MODULES = [
  { value: 'all', label: 'All modules' },
  { value: 'pos', label: 'POS' },
  { value: 'sales', label: 'Sales' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'medicines', label: 'Medicines' },
  { value: 'suppliers', label: 'Suppliers' },
  { value: 'purchases', label: 'Purchases' },
  { value: 'customers', label: 'Customers' },
  { value: 'expenses', label: 'Expenses' },
  { value: 'users', label: 'Users' },
  { value: 'reconcile', label: 'Reconcile' },
];

const PRESET_RANGES = [
  { id: 'today', label: 'Today' },
  { id: 'this_week', label: 'This week' },
  { id: 'this_month', label: 'This month' },
  { id: 'ytd', label: 'Year to date' },
  { id: 'custom', label: 'Custom' },
] as const;
type Preset = (typeof PRESET_RANGES)[number]['id'];

function startOfDay(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d: Date): Date { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }

export function Audit() {
  const { settings } = useSettingsStore();
  const { suppliers } = useSupplierStore();
  const { medicines } = useInventoryStore();
  const [searchParams, setSearchParams] = useSearchParams();

  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [preset, setPreset] = useState<Preset>('this_month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [q, setQ] = useState('');
  // M4 — scoped audit shortcuts. ?medicineId=X or ?supplierId=Y deep-links
  // narrow the search down to entries mentioning that entity.
  const [scope, setScope] = useState<{ kind: 'none' | 'medicine' | 'supplier'; id?: string }>(() => {
    const m = searchParams.get('medicineId');
    if (m) return { kind: 'medicine', id: m };
    const s = searchParams.get('supplierId');
    if (s) return { kind: 'supplier', id: s };
    return { kind: 'none' };
  });

  const range = useMemo(() => {
    const now = new Date();
    if (preset === 'today') return { from: startOfDay(now), to: endOfDay(now) };
    if (preset === 'this_week') {
      const d = new Date(now); d.setDate(d.getDate() - d.getDay());
      return { from: startOfDay(d), to: endOfDay(now) };
    }
    if (preset === 'this_month') return { from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: endOfDay(now) };
    if (preset === 'ytd') return { from: startOfDay(new Date(now.getFullYear(), 0, 1)), to: endOfDay(now) };
    return {
      from: from ? startOfDay(new Date(from)) : new Date(0),
      to: to ? endOfDay(new Date(to)) : endOfDay(now),
    };
  }, [preset, from, to]);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await fetchAuditLogs({
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        module: moduleFilter === 'all' ? undefined : moduleFilter,
        q: q || undefined,
        limit: 1000,
      });
      setLogs(rows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to load audit log');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [preset, from, to, moduleFilter]);

  // M4 — scoped audit filter (client-side). When a medicine/supplier deep-link
  // is active, narrow the loaded rows further by simple substring match.
  const scopedLogs = useMemo(() => {
    if (scope.kind === 'none' || !scope.id) return logs;
    const needles: string[] = [];
    if (scope.kind === 'medicine') {
      const m = medicines.find((x) => x.id === scope.id);
      if (m) needles.push(m.name, m.id);
    } else {
      const s = suppliers.find((x) => x.id === scope.id);
      if (s) needles.push(s.name, s.id);
    }
    if (needles.length === 0) return logs;
    return logs.filter((row) => needles.some((n) => row.details.toLowerCase().includes(n.toLowerCase())));
  }, [logs, scope, medicines, suppliers]);

  const handleExport = () => {
    if (scopedLogs.length === 0) return;
    exportToCSV(
      scopedLogs.map((l) => ({
        at: new Date(l.createdAt).toLocaleString(),
        user: l.userName || l.userId,
        module: l.module,
        action: l.action,
        details: l.details,
        ip: l.ipAddress ?? '',
      })),
      [
        { key: 'at', label: 'When' },
        { key: 'user', label: 'User' },
        { key: 'module', label: 'Module' },
        { key: 'action', label: 'Action' },
        { key: 'details', label: 'Details' },
        { key: 'ip', label: 'IP' },
      ],
      'audit-log',
    );
  };

  const dark = settings.theme === 'dark';

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <ClipboardList className="w-6 h-6 text-purple-600" />
          <div>
            <h1 className="text-2xl font-bold">Audit log</h1>
            <p className="text-xs text-gray-500">Every privileged action recorded across this tenant.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={load} variant="outline" disabled={loading} className="gap-2">
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} /> Refresh
          </Button>
          <Button onClick={handleExport} variant="outline" disabled={scopedLogs.length === 0} className="gap-2">
            <Download className="w-4 h-4" /> CSV
          </Button>
        </div>
      </div>

      {scope.kind !== 'none' && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-purple-50 border border-purple-200">
          <Filter className="w-4 h-4 text-purple-700" />
          <span className="text-sm">
            Filtering by {scope.kind}: <span className="font-medium">
              {scope.kind === 'medicine'
                ? medicines.find((m) => m.id === scope.id)?.name || scope.id
                : suppliers.find((s) => s.id === scope.id)?.name || scope.id}
            </span>
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setScope({ kind: 'none' }); setSearchParams({}); }}
          >
            Clear
          </Button>
        </div>
      )}

      <Card className={cn(dark && 'bg-gray-800 border-gray-700')}>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <Label className="text-xs">Date range</Label>
              <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRESET_RANGES.map((r) => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {preset === 'custom' && (
              <>
                <div>
                  <Label className="text-xs">From</Label>
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">To</Label>
                  <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
              </>
            )}
            <div>
              <Label className="text-xs">Module</Label>
              <Select value={moduleFilter} onValueChange={setModuleFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MODULES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Search details</Label>
              <Input
                placeholder="invoice number, reason…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') load(); }}
              />
            </div>
          </div>
          <div className="mt-3 flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => { setScope({ kind: 'medicine', id: '' }); }}>
              Audit a medicine…
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setScope({ kind: 'supplier', id: '' }); }}>
              Audit a supplier…
            </Button>
          </div>
          {scope.kind === 'medicine' && !scope.id && (
            <div className="mt-2">
              <Label className="text-xs">Medicine</Label>
              <Select value={scope.id ?? ''} onValueChange={(id) => setScope({ kind: 'medicine', id })}>
                <SelectTrigger><SelectValue placeholder="Pick a medicine" /></SelectTrigger>
                <SelectContent>
                  {medicines.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {scope.kind === 'supplier' && !scope.id && (
            <div className="mt-2">
              <Label className="text-xs">Supplier</Label>
              <Select value={scope.id ?? ''} onValueChange={(id) => setScope({ kind: 'supplier', id })}>
                <SelectTrigger><SelectValue placeholder="Pick a supplier" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className={cn(dark && 'bg-gray-800 border-gray-700')}>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>Entries ({scopedLogs.length})</span>
            <span className="text-xs text-gray-500 font-normal">
              {range.from.toLocaleDateString()} – {range.to.toLocaleDateString()}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[calc(100vh-30rem)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scopedLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10 text-gray-500">
                      No log entries match these filters.
                    </TableCell>
                  </TableRow>
                ) : scopedLogs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs whitespace-nowrap tabular-nums">
                      {new Date(l.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs">{l.userName || l.userId}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize text-[10px]">{l.module}</Badge></TableCell>
                    <TableCell className="text-[11px] font-mono">{l.action}</TableCell>
                    <TableCell className="text-xs max-w-xl truncate" title={l.details}>{l.details}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
