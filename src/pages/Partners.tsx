import { useEffect, useState } from 'react';
import { fetchPartners, createPartner, updatePartner, deletePartner, fetchOutbox, processOutbox, type PartnerCreatePayload } from '@/lib/backend';
import type { Partner, OutboxEvent } from '@/types';
import { useSettingsStore } from '@/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { Plus, Pencil, Trash2, Send, Server, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// M7 — Partners + Outbox management. The HTTP delivery worker is currently
// stubbed; this page exposes the configuration + outbox state so it's easy to
// wire real delivery in later.
export function Partners() {
  const { settings } = useSettingsStore();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [outbox, setOutbox] = useState<OutboxEvent[]>([]);
  const [outboxFilter, setOutboxFilter] = useState<string>('all');
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<Partner | null>(null);
  const [form, setForm] = useState<PartnerCreatePayload>({
    type: 'wholesale',
    name: '',
    baseUrl: '',
    apiKey: '',
    inboundSecret: '',
    isActive: true,
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const refresh = async () => {
    try {
      const [p, o] = await Promise.all([
        fetchPartners(),
        fetchOutbox(outboxFilter === 'all' ? undefined : outboxFilter),
      ]);
      setPartners(p);
      setOutbox(o);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to load partners');
    }
  };
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [outboxFilter]);

  const startCreate = () => {
    setEditing(null);
    setForm({ type: 'wholesale', name: '', baseUrl: '', apiKey: '', inboundSecret: '', isActive: true, notes: '' });
    setShowDialog(true);
  };

  const startEdit = (p: Partner) => {
    setEditing(p);
    setForm({
      type: p.type,
      name: p.name,
      baseUrl: p.baseUrl ?? '',
      apiKey: '', // never echo back; leaving empty keeps current
      inboundSecret: '',
      isActive: p.isActive,
      notes: p.notes ?? '',
    });
    setShowDialog(true);
  };

  const submit = async () => {
    if (!form.name.trim()) { toast.error('Name required'); return; }
    setSubmitting(true);
    try {
      // Strip empty optional fields so the server doesn't clear them on edit
      const payload: PartnerCreatePayload = {
        type: form.type,
        name: form.name.trim(),
        isActive: form.isActive,
      };
      if (form.baseUrl?.trim()) payload.baseUrl = form.baseUrl.trim();
      if (form.apiKey?.trim()) payload.apiKey = form.apiKey.trim();
      if (form.inboundSecret?.trim()) payload.inboundSecret = form.inboundSecret.trim();
      if (form.notes?.trim()) payload.notes = form.notes.trim();
      if (editing) {
        await updatePartner(editing.id, payload);
        toast.success('Partner updated');
      } else {
        await createPartner(payload);
        toast.success('Partner added');
      }
      setShowDialog(false);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (p: Partner) => {
    if (!confirm(`Delete partner "${p.name}"? Outbox events for this partner stay in history but won't be retried.`)) return;
    try {
      await deletePartner(p.id);
      toast.success('Partner removed');
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const handleProcessOutbox = async () => {
    try {
      const r = await processOutbox();
      toast.info(`Worker pass: ${r.processed} attempted (real HTTP delivery is stubbed for now).`);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  };

  const dark = settings.theme === 'dark';

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Server className="w-6 h-6 text-indigo-600" />
          <div>
            <h1 className="text-2xl font-bold">External partners</h1>
            <p className="text-xs text-gray-500">Wholesale ERP, hospital and clinic integrations.</p>
          </div>
        </div>
        <Button onClick={startCreate} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
          <Plus className="w-4 h-4" /> Add partner
        </Button>
      </div>

      <Card className={cn(dark && 'bg-gray-800 border-gray-700')}>
        <CardHeader>
          <CardTitle className="text-base">Configured partners ({partners.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {partners.length === 0 ? (
            <div className="text-center py-10 text-gray-500">
              <p>No partners yet.</p>
              <p className="text-xs mt-1">Add one to enable outbound webhooks for PO + return events.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Base URL</TableHead>
                  <TableHead>Configured</TableHead>
                  <TableHead>Last sync</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {partners.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm font-medium">{p.name}{p.notes && <div className="text-[10px] text-gray-500 truncate max-w-xs">{p.notes}</div>}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{p.type}</Badge></TableCell>
                    <TableCell className="text-xs text-gray-500 truncate max-w-xs">{p.baseUrl || '—'}</TableCell>
                    <TableCell className="text-xs">
                      <span className={cn('text-[10px] mr-1 px-1.5 py-0.5 rounded', p.apiKeySet ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500')}>
                        api key {p.apiKeySet ? '✓' : '—'}
                      </span>
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded', p.inboundSecretSet ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500')}>
                        signature {p.inboundSecretSet ? '✓' : '—'}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">{p.lastSyncAt ? new Date(p.lastSyncAt).toLocaleString() : '—'}</TableCell>
                    <TableCell><Badge variant={p.isActive ? 'success' : 'secondary'}>{p.isActive ? 'active' : 'paused'}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => startEdit(p)}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="text-red-600" onClick={() => handleDelete(p)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className={cn(dark && 'bg-gray-800 border-gray-700')}>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base">Outbox ({outbox.length})</CardTitle>
            <div className="flex items-center gap-2">
              <Select value={outboxFilter} onValueChange={setOutboxFilter}>
                <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleProcessOutbox} variant="outline" size="sm" className="gap-1">
                <Send className="w-3 h-3" /> Process pending
              </Button>
            </div>
          </div>
          <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Real HTTP delivery is stubbed — pending rows are marked failed by the worker. Wire the real fetch + signature to switch on delivery.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-64">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Retries</TableHead>
                  <TableHead>Last error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outbox.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-6 text-gray-500">No outbox rows.</TableCell></TableRow>
                ) : outbox.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="text-xs whitespace-nowrap">{new Date(o.createdAt).toLocaleString()}</TableCell>
                    <TableCell className="text-xs font-mono">{o.event}</TableCell>
                    <TableCell className="text-xs">{partners.find((p) => p.id === o.partnerId)?.name ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={o.status === 'sent' ? 'success' : o.status === 'failed' ? 'destructive' : 'secondary'}>
                        {o.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{o.retries}</TableCell>
                    <TableCell className="text-xs text-gray-500 truncate max-w-xs" title={o.lastError ?? ''}>{o.lastError ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit partner' : 'Add partner'}</DialogTitle>
            <DialogDescription className="text-xs">
              The API key is encrypted using <code>FBR_TOKEN_KEY</code>. Leave blank on edit to keep the current key.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as PartnerCreatePayload['type'] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="wholesale">Wholesale ERP</SelectItem>
                  <SelectItem value="hospital">Hospital</SelectItem>
                  <SelectItem value="clinic">Clinic</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Kynex Wholesale Hub" />
            </div>
            <div>
              <Label className="text-xs">Base URL</Label>
              <Input value={form.baseUrl ?? ''} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://wholesale.example.com" />
            </div>
            <div>
              <Label className="text-xs">API key {editing && <span className="text-gray-400">(leave blank to keep current)</span>}</Label>
              <Input type="password" value={form.apiKey ?? ''} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder="bearer or API key" />
            </div>
            <div>
              <Label className="text-xs">Inbound webhook secret</Label>
              <Input type="password" value={form.inboundSecret ?? ''} onChange={(e) => setForm({ ...form, inboundSecret: e.target.value })} placeholder="HMAC shared secret" />
            </div>
            <div className="flex items-center justify-between border-t pt-2">
              <Label className="text-sm">Active</Label>
              <input type="checkbox" checked={form.isActive ?? true} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="w-4 h-4" />
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Input value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={submit} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700">{submitting ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
