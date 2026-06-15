import { useEffect, useState, useCallback } from 'react';
import { useAuthStore, useSettingsStore } from '@/store';
import {
  fetchDayCloses,
  postDayClose,
  fetchShiftsByBusinessDay,
  openShift,
  closeShift,
  updateShiftSession,
} from '@/lib/backend';
import type { DayClose, ShiftSession } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ClipboardCheck, Printer, Save, AlertTriangle, Play, Lock, Pencil, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const MANAGER_ROLES = new Set(['owner', 'manager', 'superadmin']);
const time = (d: Date | string | undefined) =>
  d ? new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
const money = (n: number | null | undefined) =>
  n == null ? '—' : `Rs. ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// M6 — Day-end close. Shift-driven: a cashier starts a shift with an opening
// balance (it shows as "pending close"), then closes it with a counted closing
// balance. The day opens with the first shift and closes with the last; the
// owner/manager finalizes the day with a Z-report close, after which the shift
// figures lock.
export function DayClosePage() {
  const { settings } = useSettingsStore();
  const { branches, currentUser, activeBranchId } = useAuthStore();
  const dark = settings.theme === 'dark';
  const isManager = MANAGER_ROLES.has(currentUser?.role ?? '');

  const [closes, setCloses] = useState<DayClose[]>([]);
  const [shifts, setShifts] = useState<ShiftSession[]>([]);
  const [branchId, setBranchId] = useState(activeBranchId ?? branches[0]?.id ?? '');
  const [businessDate, setBusinessDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [openingCash, setOpeningCash] = useState('');
  const [closingCash, setClosingCash] = useState('');
  const [cashTouched, setCashTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState<DayClose | null>(null);

  // Dialogs
  const [startOpen, setStartOpen] = useState(false);
  const [startCash, setStartCash] = useState('');
  const [closeTarget, setCloseTarget] = useState<ShiftSession | null>(null);
  const [closeCash, setCloseCash] = useState('');
  const [editTarget, setEditTarget] = useState<ShiftSession | null>(null);
  const [editOpening, setEditOpening] = useState('');
  const [editClosing, setEditClosing] = useState('');
  const [busy, setBusy] = useState(false);

  const isToday = businessDate === new Date().toISOString().slice(0, 10);
  const dayStart = new Date(`${businessDate}T00:00:00`);

  // Shifts attributed to the selected branch + business date (server applies the
  // post-close rollover so a shift opened after a close shows under the next day).
  const loadShifts = useCallback(async () => {
    if (!branchId) { setShifts([]); return; }
    try {
      setShifts(await fetchShiftsByBusinessDay(branchId, businessDate));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to load shifts');
    }
  }, [branchId, businessDate]);

  const refreshCloses = useCallback(async () => {
    try {
      setCloses(await fetchDayCloses(branchId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to load day closes');
    }
  }, [branchId]);

  useEffect(() => { loadShifts(); }, [loadShifts]);
  useEffect(() => { refreshCloses(); }, [refreshCloses]);

  // Derived day figures: first shift opens the day, last closed shift ends it.
  const openShifts = shifts.filter((s) => s.status === 'open');
  const firstShift = shifts[0];
  const lastClosed = [...shifts.filter((s) => s.closedAt)].sort(
    (a, b) => new Date(a.closedAt!).getTime() - new Date(b.closedAt!).getTime(),
  ).pop();
  const derivedOpening = firstShift?.openingCash ?? null;
  const derivedClosing = lastClosed?.closingCash ?? null;

  const dayAlreadyClosed = closes.some(
    (c) => c.branchId === branchId && new Date(c.businessDate).toDateString() === dayStart.toDateString(),
  );

  // Keep the day-close inputs in sync with the shift-derived figures until the
  // owner edits them by hand.
  useEffect(() => {
    if (cashTouched) return;
    setOpeningCash(derivedOpening != null ? String(derivedOpening) : '');
    setClosingCash(derivedClosing != null ? String(derivedClosing) : '');
  }, [derivedOpening, derivedClosing, cashTouched]);

  // ── Shift actions ─────────────────────────────────────────────────────────
  const handleStartShift = async () => {
    setBusy(true);
    try {
      await openShift({ branchId, openingCash: startCash === '' ? 0 : parseFloat(startCash) });
      setStartOpen(false); setStartCash('');
      toast.success('Shift started');
      // If today was already closed, this shift rolls into the next business day —
      // jump there so the user sees it.
      if (dayAlreadyClosed) {
        const next = new Date(dayStart); next.setDate(next.getDate() + 1);
        setBusinessDate(next.toISOString().slice(0, 10));
        setCashTouched(false);
      } else {
        await loadShifts();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start shift');
    } finally { setBusy(false); }
  };

  const handleCloseShift = async () => {
    if (!closeTarget) return;
    if (closeCash === '') { toast.error('Enter the counted closing cash'); return; }
    setBusy(true);
    try {
      await closeShift(closeTarget.id, { closingCash: parseFloat(closeCash) });
      setCloseTarget(null); setCloseCash('');
      toast.success('Shift closed');
      await loadShifts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not close shift');
    } finally { setBusy(false); }
  };

  const handleEditShift = async () => {
    if (!editTarget) return;
    setBusy(true);
    try {
      await updateShiftSession(editTarget.id, {
        openingCash: editOpening === '' ? undefined : parseFloat(editOpening),
        closingCash: editClosing === '' ? undefined : parseFloat(editClosing),
      });
      setEditTarget(null);
      toast.success('Shift updated');
      await loadShifts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update shift');
    } finally { setBusy(false); }
  };

  // ── Day close ───────────────────────────────────────────────────────────
  const handlePost = async () => {
    if (!branchId) { toast.error('Pick a branch'); return; }
    if (openShifts.length > 0 && !confirm(`${openShifts.length} shift(s) are still open. Close the day anyway?`)) return;
    setSubmitting(true);
    try {
      const row = await postDayClose({
        branchId,
        businessDate,
        openingCash: openingCash === '' ? undefined : parseFloat(openingCash),
        closingCash: closingCash === '' ? undefined : parseFloat(closingCash),
        notes: notes || undefined,
      });
      setNotes(''); setCashTouched(false);
      setSelected(row);
      await Promise.all([refreshCloses(), loadShifts()]);
      toast.success('Day closed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to close the day');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrint = (close: DayClose) => {
    const branch = branches.find((b) => b.id === close.branchId);
    const cashDiff = (close.closingCash ?? 0) - (close.openingCash ?? 0) - close.salesTotal + close.returnsTotal + close.expensesTotal;
    const w = window.open('', '_blank', 'width=400,height=700');
    if (!w) { toast.error('Allow pop-ups to print'); return; }
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const methodsHtml = Object.entries(close.summary.byMethod ?? {})
      .map(([m, amt]) => `<div class="row"><span>${esc(m.replace('_', ' '))}</span><span>Rs. ${Number(amt).toFixed(2)}</span></div>`)
      .join('');
    w.document.write(`<html><head><title>Day Close ${new Date(close.businessDate).toLocaleDateString()}</title>
      <style>
        body { font-family: 'Courier New', monospace; font-size: 12px; width: 280px; margin: 0 auto; padding: 16px; }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .line { border-top: 1px dashed #000; margin: 6px 0; }
        .row { display: flex; justify-content: space-between; gap: 8px; }
        h2 { margin: 4px 0; font-size: 14px; text-transform: uppercase; }
        h3 { margin: 6px 0 2px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
        .meta { font-size: 10px; }
      </style></head><body>
      <div class="center">
        <h2>Z-Report — Day Close</h2>
        <p class="meta">${esc(branch?.name ?? '')}</p>
        <p class="meta">Business date: ${new Date(close.businessDate).toLocaleDateString()}</p>
        <p class="meta">Posted: ${new Date(close.closedAt).toLocaleString()}</p>
        ${close.closedByName ? `<p class="meta">By: ${esc(close.closedByName)}</p>` : ''}
      </div>
      <div class="line"></div>
      <h3>Sales</h3>
      <div class="row"><span>Invoices</span><span>${close.summary.salesCount ?? 0}</span></div>
      <div class="row"><span>Subtotal sales</span><span>Rs. ${close.salesTotal.toFixed(2)}</span></div>
      <div class="row"><span>Returns</span><span>-Rs. ${close.returnsTotal.toFixed(2)}</span></div>
      <div class="row"><span>Tax collected</span><span>Rs. ${(close.summary.taxTotal ?? 0).toFixed(2)}</span></div>
      <div class="row"><span>Discount given</span><span>Rs. ${(close.summary.discountTotal ?? 0).toFixed(2)}</span></div>
      <div class="line"></div>
      <h3>By payment method</h3>
      ${methodsHtml || '<p class="meta">No payments recorded.</p>'}
      <div class="line"></div>
      <h3>Cash drawer</h3>
      <div class="row"><span>Opening cash</span><span>Rs. ${(close.openingCash ?? 0).toFixed(2)}</span></div>
      <div class="row"><span>Closing cash</span><span>Rs. ${(close.closingCash ?? 0).toFixed(2)}</span></div>
      <div class="row"><span>Expenses paid</span><span>Rs. ${close.expensesTotal.toFixed(2)}</span></div>
      <div class="row bold"><span>Expected vs counted</span><span>Rs. ${cashDiff.toFixed(2)}</span></div>
      ${close.summary.fbrSubmitted != null ? `
        <div class="line"></div>
        <h3>FBR</h3>
        <div class="row"><span>Submitted</span><span>${close.summary.fbrSubmitted}</span></div>
        <div class="row"><span>Failed</span><span>${close.summary.fbrFailed ?? 0}</span></div>` : ''}
      ${close.notes ? `<div class="line"></div><p class="meta">${esc(close.notes)}</p>` : ''}
      <div class="line"></div>
      <p class="center meta">End of report</p>
      </body></html>`);
    w.document.close();
    w.print();
  };

  if (!settings.dayCloseEnabled) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Card className={cn(dark && 'bg-gray-800 border-gray-700')}>
          <CardContent className="py-10 text-center">
            <AlertTriangle className="w-10 h-10 mx-auto text-amber-500 mb-3" />
            <p className="font-medium">Day-end close is disabled.</p>
            <p className="text-sm text-gray-500 mt-1">Turn it on under Settings → Shift &amp; day-end close.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <ClipboardCheck className="w-6 h-6 text-purple-600" />
        <div>
          <h1 className="text-2xl font-bold">Day-end close</h1>
          <p className="text-xs text-gray-500">Start and close shifts; finalize the day's Z-report.</p>
        </div>
      </div>

      {/* Branch + date selector */}
      <Card className={cn(dark && 'bg-gray-800 border-gray-700')}>
        <CardContent className="py-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Branch</Label>
              <Select value={branchId} onValueChange={(v) => { setBranchId(v); setCashTouched(false); }}>
                <SelectTrigger><SelectValue placeholder="Pick a branch" /></SelectTrigger>
                <SelectContent>
                  {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Business date</Label>
              <Input type="date" value={businessDate} onChange={(e) => { setBusinessDate(e.target.value); setCashTouched(false); }} />
            </div>
            <div className="flex items-end">
              {isToday && openShifts.length === 0 && (
                <Button onClick={() => setStartOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 gap-2 w-full">
                  <Play className="w-4 h-4" /> Start shift
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pending close banner */}
      {openShifts.map((s) => (
        <Card key={s.id} className="border-amber-300 bg-amber-50/60 dark:bg-amber-900/10 dark:border-amber-700">
          <CardContent className="py-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-amber-600" />
              <div>
                <p className="font-medium text-sm">
                  Pending close <Badge variant="outline" className="ml-1 text-[10px] border-amber-400 text-amber-700">OPEN</Badge>
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-300">
                  {s.userName ? `${s.userName} · ` : ''}open since {time(s.openedAt)} · opening {money(s.openingCash)}
                </p>
              </div>
            </div>
            <Button onClick={() => { setCloseTarget(s); setCloseCash(''); }} className="bg-amber-600 hover:bg-amber-700 gap-2">
              <Lock className="w-4 h-4" /> Close shift
            </Button>
          </CardContent>
        </Card>
      ))}

      {/* Shifts table */}
      <Card className={cn(dark && 'bg-gray-800 border-gray-700')}>
        <CardHeader>
          <CardTitle className="text-base">Shifts — {dayStart.toLocaleDateString()}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cashier</TableHead>
                <TableHead>Opened</TableHead>
                <TableHead className="text-right">Opening</TableHead>
                <TableHead>Closed</TableHead>
                <TableHead className="text-right">Closing</TableHead>
                <TableHead className="text-right">Sales</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shifts.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-gray-500 py-8">No shifts for this day.</TableCell></TableRow>
              ) : shifts.map((s, i) => (
                <TableRow key={s.id}>
                  <TableCell className="text-xs">
                    {s.userName ?? '—'}
                    {i === 0 && <Badge variant="outline" className="ml-1 text-[9px]">day open</Badge>}
                    {s.id === lastClosed?.id && <Badge variant="outline" className="ml-1 text-[9px]">day close</Badge>}
                  </TableCell>
                  <TableCell className="text-xs">{time(s.openedAt)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{money(s.openingCash)}</TableCell>
                  <TableCell className="text-xs">{time(s.closedAt)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{money(s.closingCash)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{money(s.salesTotal)}</TableCell>
                  <TableCell>
                    {s.status === 'open'
                      ? <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-[10px]">Pending close</Badge>
                      : <Badge variant="outline" className="text-[10px]">Closed</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {s.status === 'open' && (
                        <Button variant="ghost" size="sm" className="gap-1 text-amber-700"
                          onClick={() => { setCloseTarget(s); setCloseCash(''); }}>
                          <Lock className="w-3 h-3" /> Close
                        </Button>
                      )}
                      {isManager && !dayAlreadyClosed && (
                        <Button variant="ghost" size="sm" className="gap-1"
                          onClick={() => {
                            setEditTarget(s);
                            setEditOpening(String(s.openingCash));
                            setEditClosing(s.closingCash != null ? String(s.closingCash) : '');
                          }}>
                          <Pencil className="w-3 h-3" /> Edit
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Day-end close */}
      <Card className={cn(dark && 'bg-gray-800 border-gray-700')}>
        <CardHeader>
          <CardTitle className="text-base">Finalize the day</CardTitle>
        </CardHeader>
        <CardContent>
          {dayAlreadyClosed ? (
            <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 dark:bg-emerald-900/10 rounded p-3">
              <Lock className="w-4 h-4" /> This day is already closed — figures are locked. See it in Recent closes below.
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-500 mb-3">
                Opening = first shift of the day{firstShift ? ` (${money(derivedOpening)} at ${time(firstShift.openedAt)})` : ''};
                closing = last shift closed{lastClosed ? ` (${money(derivedClosing)} at ${time(lastClosed.closedAt)})` : ''}.
                Edit below to override before finalizing.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Opening cash (Rs.)</Label>
                  <Input type="number" step="0.01" value={openingCash}
                    onChange={(e) => { setCashTouched(true); setOpeningCash(e.target.value); }} />
                </div>
                <div>
                  <Label className="text-xs">Closing cash (Rs.)</Label>
                  <Input type="number" step="0.01" value={closingCash}
                    onChange={(e) => { setCashTouched(true); setClosingCash(e.target.value); }} />
                </div>
                <div>
                  <Label className="text-xs">Notes</Label>
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional context" />
                </div>
              </div>
              {openShifts.length > 0 && (
                <p className="mt-2 text-xs text-amber-600">
                  {openShifts.length} shift(s) still open — close them for an accurate end-of-day count.
                </p>
              )}
              <div className="mt-3 flex justify-end">
                <Button onClick={handlePost} disabled={submitting || !branchId || !isManager}
                  className="bg-purple-600 hover:bg-purple-700 gap-2">
                  <Save className="w-4 h-4" /> Close the day
                </Button>
              </div>
              {!isManager && <p className="mt-2 text-xs text-gray-400 text-right">Only an owner or manager can finalize the day.</p>}
            </>
          )}
        </CardContent>
      </Card>

      {/* Recent closes */}
      <Card className={cn(dark && 'bg-gray-800 border-gray-700')}>
        <CardHeader>
          <CardTitle className="text-base">Recent closes ({closes.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[calc(100vh-40rem)] min-h-48">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Business date</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead className="text-right">Sales</TableHead>
                  <TableHead className="text-right">Returns</TableHead>
                  <TableHead className="text-right">Closing cash</TableHead>
                  <TableHead>Closed by</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {closes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-gray-500 py-10">No day closes yet.</TableCell>
                  </TableRow>
                ) : closes.map((c) => (
                  <TableRow key={c.id} className={cn(selected?.id === c.id && 'bg-emerald-50/40 dark:bg-emerald-900/10')}>
                    <TableCell className="text-xs">
                      {new Date(c.businessDate).toLocaleDateString()}
                      <Badge variant="outline" className="ml-2 text-[10px]">{c.summary.salesCount ?? 0} inv</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{branches.find((b) => b.id === c.branchId)?.name ?? c.branchId}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">Rs. {c.salesTotal.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums text-red-600">Rs. {c.returnsTotal.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{c.closingCash != null ? `Rs. ${c.closingCash.toFixed(2)}` : '—'}</TableCell>
                    <TableCell className="text-xs">{c.closedByName ?? c.closedBy}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => handlePrint(c)} className="gap-1">
                        <Printer className="w-3 h-3" /> Print
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Start shift dialog */}
      <Dialog open={startOpen} onOpenChange={setStartOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start shift</DialogTitle>
            <DialogDescription>Enter the cash float in the drawer to begin the shift.</DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-xs">Opening cash (Rs.)</Label>
            <Input type="number" step="0.01" autoFocus value={startCash}
              onChange={(e) => setStartCash(e.target.value)} placeholder="0.00" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStartOpen(false)}>Cancel</Button>
            <Button onClick={handleStartShift} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700">
              {busy ? 'Starting…' : 'Start shift'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close shift dialog */}
      <Dialog open={!!closeTarget} onOpenChange={(o) => { if (!o) setCloseTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close shift</DialogTitle>
            <DialogDescription>
              Opened {time(closeTarget?.openedAt)} · opening {money(closeTarget?.openingCash)}. Count the drawer and enter the closing cash.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-xs">Closing cash (Rs.)</Label>
            <Input type="number" step="0.01" autoFocus value={closeCash}
              onChange={(e) => setCloseCash(e.target.value)} placeholder="0.00" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseTarget(null)}>Cancel</Button>
            <Button onClick={handleCloseShift} disabled={busy} className="bg-amber-600 hover:bg-amber-700">
              {busy ? 'Closing…' : 'Close shift'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit shift dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit shift cash</DialogTitle>
            <DialogDescription>Correct a miscounted drawer. Allowed until the day is closed.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Opening cash (Rs.)</Label>
              <Input type="number" step="0.01" value={editOpening} onChange={(e) => setEditOpening(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Closing cash (Rs.)</Label>
              <Input type="number" step="0.01" value={editClosing} onChange={(e) => setEditClosing(e.target.value)}
                disabled={editTarget?.status === 'open'} />
            </div>
          </div>
          {editTarget?.status === 'open' && (
            <p className="text-xs text-gray-500">Closing cash is set when the shift is closed.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={handleEditShift} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700">
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
