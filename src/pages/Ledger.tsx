import { useMemo, useState } from 'react';
import { useLedgerStore, useSettingsStore } from '@/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BookOpen, Download, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { exportToCSV } from '@/lib/csv';
import { cn } from '@/lib/utils';

type DateRange = 'today' | 'this_week' | 'this_month' | 'this_quarter' | 'ytd' | 'custom';

// Income flows: a sale or a customer payment received increases cash on hand.
// Expense flows: an expense or a supplier payment out reduces cash.
// Receivables/payables don't move cash but go into the same trail for context.
const isInflow = (entry: { type: string; referenceType?: string }): boolean =>
  entry.type === 'income' || entry.referenceType === 'sale';
const isOutflow = (entry: { type: string; referenceType?: string }): boolean =>
  entry.type === 'expense' || entry.referenceType === 'expense' || entry.referenceType === 'payment';

const TYPE_LABEL: Record<string, string> = {
  income: 'Income',
  expense: 'Expense',
  payable: 'Payable',
  receivable: 'Receivable',
};

const REF_LABEL: Record<string, string> = {
  sale: 'Sale',
  purchase: 'Purchase',
  expense: 'Expense',
  payment: 'Payment',
};

export function Ledger() {
  const { entries } = useLedgerStore();
  const { settings } = useSettingsStore();

  const [range, setRange] = useState<DateRange>('this_month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [refFilter, setRefFilter] = useState<string>('all');

  const { fromDate, toDate } = useMemo(() => {
    const now = new Date();
    const start = (d: Date) => { d.setHours(0, 0, 0, 0); return d; };
    const end = (d: Date) => { d.setHours(23, 59, 59, 999); return d; };
    switch (range) {
      case 'today':
        return { fromDate: start(new Date(now)), toDate: end(new Date(now)) };
      case 'this_week': {
        const d = new Date(now);
        d.setDate(d.getDate() - d.getDay());
        return { fromDate: start(d), toDate: end(new Date(now)) };
      }
      case 'this_month':
        return { fromDate: start(new Date(now.getFullYear(), now.getMonth(), 1)), toDate: end(new Date(now)) };
      case 'this_quarter': {
        const qStart = Math.floor(now.getMonth() / 3) * 3;
        return { fromDate: start(new Date(now.getFullYear(), qStart, 1)), toDate: end(new Date(now)) };
      }
      case 'ytd':
        return { fromDate: start(new Date(now.getFullYear(), 0, 1)), toDate: end(new Date(now)) };
      case 'custom':
        return {
          fromDate: customFrom ? start(new Date(customFrom)) : new Date(0),
          toDate: customTo ? end(new Date(customTo)) : end(new Date(now)),
        };
    }
  }, [range, customFrom, customTo]);

  // Filter then sort ascending so the running balance accumulates correctly.
  const filtered = useMemo(() => {
    return entries
      .filter((e) => {
        const t = new Date(e.createdAt).getTime();
        return t >= fromDate.getTime() && t <= toDate.getTime();
      })
      .filter((e) => typeFilter === 'all' || e.type === typeFilter)
      .filter((e) => refFilter === 'all' || e.referenceType === refFilter)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [entries, fromDate, toDate, typeFilter, refFilter]);

  const totals = useMemo(() => {
    let inflow = 0;
    let outflow = 0;
    const withBalance = filtered.map((e) => {
      const amt = Number(e.amount) || 0;
      if (isInflow(e)) inflow += amt;
      else if (isOutflow(e)) outflow += amt;
      return { ...e, runningBalance: inflow - outflow };
    });
    return { inflow, outflow, net: inflow - outflow, withBalance };
  }, [filtered]);

  const handleExport = () => {
    const rows = totals.withBalance.map((e) => ({
      date: new Date(e.createdAt).toLocaleString(),
      type: TYPE_LABEL[e.type] ?? e.type,
      reference: REF_LABEL[e.referenceType ?? ''] ?? e.referenceType ?? '',
      description: e.description,
      inflow: isInflow(e) ? Number(e.amount).toFixed(2) : '',
      outflow: isOutflow(e) ? Number(e.amount).toFixed(2) : '',
      balance: e.runningBalance.toFixed(2),
    }));
    exportToCSV(
      rows,
      [
        { key: 'date', label: 'Date' },
        { key: 'type', label: 'Type' },
        { key: 'reference', label: 'Reference' },
        { key: 'description', label: 'Description' },
        { key: 'inflow', label: 'Inflow' },
        { key: 'outflow', label: 'Outflow' },
        { key: 'balance', label: 'Running Balance' },
      ],
      'ledger',
    );
  };

  const dark = settings.theme === 'dark';

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOpen className="w-6 h-6 text-emerald-600" />
          <h1 className="text-2xl font-bold">General Ledger</h1>
        </div>
        <Button onClick={handleExport} disabled={totals.withBalance.length === 0} variant="outline" className="gap-2">
          <Download className="w-4 h-4" /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className={cn(dark && 'bg-gray-800 border-gray-700')}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Inflow</p>
              <p className="text-xl font-bold text-emerald-600">Rs. {totals.inflow.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={cn(dark && 'bg-gray-800 border-gray-700')}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Outflow</p>
              <p className="text-xl font-bold text-red-600">Rs. {totals.outflow.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={cn(dark && 'bg-gray-800 border-gray-700')}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Net</p>
              <p className={cn('text-xl font-bold', totals.net >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                Rs. {totals.net.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className={cn(dark && 'bg-gray-800 border-gray-700')}>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Date range</Label>
              <Select value={range} onValueChange={(v) => setRange(v as DateRange)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="this_week">This Week</SelectItem>
                  <SelectItem value="this_month">This Month</SelectItem>
                  <SelectItem value="this_quarter">This Quarter</SelectItem>
                  <SelectItem value="ytd">Year to Date</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {range === 'custom' && (
              <>
                <div>
                  <Label className="text-xs">From</Label>
                  <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">To</Label>
                  <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
                </div>
              </>
            )}
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="income">Income</SelectItem>
                  <SelectItem value="expense">Expense</SelectItem>
                  <SelectItem value="receivable">Receivable</SelectItem>
                  <SelectItem value="payable">Payable</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Reference</Label>
              <Select value={refFilter} onValueChange={setRefFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All references</SelectItem>
                  <SelectItem value="sale">Sale</SelectItem>
                  <SelectItem value="purchase">Purchase</SelectItem>
                  <SelectItem value="expense">Expense</SelectItem>
                  <SelectItem value="payment">Payment</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className={cn(dark && 'bg-gray-800 border-gray-700')}>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>Entries ({totals.withBalance.length})</span>
            <span className="text-xs text-gray-500 font-normal">
              {fromDate.toLocaleDateString()} – {toDate.toLocaleDateString()}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[calc(100vh-30rem)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Inflow</TableHead>
                  <TableHead className="text-right">Outflow</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {totals.withBalance.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-gray-500">
                      No ledger entries in this range.
                    </TableCell>
                  </TableRow>
                ) : totals.withBalance.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {new Date(e.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{TYPE_LABEL[e.type] ?? e.type}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{REF_LABEL[e.referenceType ?? ''] ?? e.referenceType ?? '—'}</TableCell>
                    <TableCell className="max-w-md truncate">{e.description}</TableCell>
                    <TableCell className="text-right text-emerald-600 tabular-nums">
                      {isInflow(e) ? `Rs. ${Number(e.amount).toFixed(2)}` : ''}
                    </TableCell>
                    <TableCell className="text-right text-red-600 tabular-nums">
                      {isOutflow(e) ? `Rs. ${Number(e.amount).toFixed(2)}` : ''}
                    </TableCell>
                    <TableCell className={cn('text-right font-medium tabular-nums', e.runningBalance >= 0 ? 'text-gray-900 dark:text-white' : 'text-red-600')}>
                      Rs. {e.runningBalance.toFixed(2)}
                    </TableCell>
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
