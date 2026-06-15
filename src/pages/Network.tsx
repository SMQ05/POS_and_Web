import { useEffect, useRef, useState } from 'react';
import { useNetworkStore, useAuthStore } from '@/store';
import {
  lookupHandle, requestConnection, connectionAction,
  fetchConnectionMessages, sendConnectionMessage,
  createNetworkOrder, networkOrderAction,
} from '@/lib/backend';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Users, Search, Check, X, MessageCircle, Send, ShoppingCart, Plus, Trash2, Clock, Store } from 'lucide-react';
import type { NetworkConnection, NetworkMessage, NetworkPeer } from '@/types';

const TYPE_LABEL: Record<string, string> = { pharmacy: 'Pharmacy', distributor: 'Distributor', wholesaler: 'Wholesaler' };
const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    placed: 'bg-blue-100 text-blue-700', accepted: 'bg-emerald-100 text-emerald-700',
    shipped: 'bg-indigo-100 text-indigo-700', received: 'bg-green-100 text-green-700',
    declined: 'bg-red-100 text-red-700', cancelled: 'bg-gray-100 text-gray-600',
  };
  return map[s] ?? 'bg-gray-100 text-gray-600';
};

export function Network() {
  const { connections, incomingOrders, outgoingOrders, refresh } = useNetworkStore();
  const { tenant } = useAuthStore();

  useEffect(() => { refresh(); }, [refresh]);

  const accepted = connections.filter((c) => c.status === 'accepted');
  const incomingReq = connections.filter((c) => c.status === 'pending' && c.direction === 'incoming');
  const outgoingReq = connections.filter((c) => c.status === 'pending' && c.direction === 'outgoing');

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="w-6 h-6 text-emerald-600" /> Network</h1>
          <p className="text-gray-500 text-sm">Connect with pharmacies, distributors & wholesalers on Kynex — chat and order directly.</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">Your username</p>
          <p className="font-mono font-semibold text-emerald-700">@{tenant?.handle ?? '—'}</p>
          <p className="text-[11px] text-gray-400">{TYPE_LABEL[tenant?.businessType ?? 'pharmacy']} · share this to connect</p>
        </div>
      </div>

      <Tabs defaultValue="connections" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 max-w-lg">
          <TabsTrigger value="connections">Connections{incomingReq.length > 0 && <Badge className="ml-1.5 bg-red-500 text-white border-0">{incomingReq.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
        </TabsList>

        <TabsContent value="connections" className="space-y-5">
          <ConnectTab onChanged={refresh} />
          {incomingReq.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Incoming requests</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {incomingReq.map((c) => (
                  <div key={c.id} className="flex items-center justify-between border rounded-lg p-3">
                    <PeerLine peer={c.peer} />
                    <div className="flex gap-2">
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 gap-1" onClick={() => connectionAction(c.id, 'accept').then(() => { toast.success('Connected'); refresh(); })}><Check className="w-4 h-4" /> Accept</Button>
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => connectionAction(c.id, 'decline').then(() => refresh())}><X className="w-4 h-4" /> Decline</Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Connected ({accepted.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {accepted.length === 0 && <p className="text-sm text-gray-400 py-4 text-center">No connections yet. Add one by username above.</p>}
              {accepted.map((c) => (
                <div key={c.id} className="flex items-center justify-between border rounded-lg p-3">
                  <PeerLine peer={c.peer} />
                  <div className="flex gap-2">
                    {(c.peer?.businessType === 'distributor' || c.peer?.businessType === 'wholesaler') && (
                      <PlaceOrderButton connection={c} onPlaced={refresh} />
                    )}
                    <Button size="sm" variant="ghost" className="text-red-500" title="Disconnect" onClick={() => { if (confirm('Disconnect from this business?')) connectionAction(c.id, 'disconnect').then(() => refresh()); }}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
              ))}
              {outgoingReq.length > 0 && (
                <div className="pt-2 border-t mt-2">
                  <p className="text-xs text-gray-500 mb-1">Pending (sent)</p>
                  {outgoingReq.map((c) => (
                    <div key={c.id} className="flex items-center justify-between py-1.5">
                      <PeerLine peer={c.peer} />
                      <Badge variant="outline" className="text-amber-600 border-amber-300 gap-1"><Clock className="w-3 h-3" /> Awaiting</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="messages"><MessagesTab connections={accepted} onRead={refresh} /></TabsContent>

        <TabsContent value="orders" className="space-y-5">
          <OrdersPanel title="Incoming orders (to fulfil)" orders={incomingOrders} role="seller" onChanged={refresh} />
          <OrdersPanel title="My orders (placed)" orders={outgoingOrders} role="buyer" onChanged={refresh} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PeerLine({ peer }: { peer?: NetworkPeer }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0"><Store className="w-4 h-4" /></div>
      <div className="min-w-0">
        <p className="font-medium truncate">{peer?.name ?? 'Unknown'}</p>
        <p className="text-xs text-gray-400 truncate">@{peer?.handle} · {TYPE_LABEL[peer?.businessType ?? 'pharmacy']}</p>
      </div>
    </div>
  );
}

function ConnectTab({ onChanged }: { onChanged: () => void }) {
  const [handle, setHandle] = useState('');
  const [result, setResult] = useState<(NetworkPeer & { connectionStatus: string | null }) | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const doLookup = async () => {
    const h = handle.trim().toLowerCase();
    if (!h) return;
    setLoading(true); setError(''); setResult(null);
    try { setResult(await lookupHandle(h)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Not found'); }
    finally { setLoading(false); }
  };
  const connect = async () => {
    try { await requestConnection(handle.trim().toLowerCase()); toast.success('Request sent'); setResult(null); setHandle(''); onChanged(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Add a connection</CardTitle>
        <CardDescription>Enter the exact username the other business shared with you.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input className="pl-9" placeholder="e.g. abc-distributors" value={handle}
              onChange={(e) => setHandle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') doLookup(); }} />
          </div>
          <Button onClick={doLookup} disabled={loading}>{loading ? 'Searching…' : 'Look up'}</Button>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        {result && (
          <div className="flex items-center justify-between border rounded-lg p-3 bg-gray-50">
            <PeerLine peer={result} />
            {result.connectionStatus === 'accepted' ? <Badge className="bg-emerald-100 text-emerald-700 border-0">Connected</Badge>
              : result.connectionStatus === 'pending' ? <Badge variant="outline" className="text-amber-600 border-amber-300">Pending</Badge>
              : <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={connect}>Connect</Button>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MessagesTab({ connections, onRead }: { connections: NetworkConnection[]; onRead: () => void }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<NetworkMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const active = connections.find((c) => c.id === activeId);

  const load = async (id: string) => {
    setLoading(true);
    try { setMessages(await fetchConnectionMessages(id)); onRead(); }
    finally { setLoading(false); setTimeout(() => endRef.current?.scrollIntoView(), 50); }
  };
  useEffect(() => { if (activeId) load(activeId); /* eslint-disable-next-line */ }, [activeId]);

  const send = async () => {
    const body = draft.trim();
    if (!body || !activeId) return;
    setDraft('');
    const msg = await sendConnectionMessage(activeId, body).catch(() => null);
    if (msg) { setMessages((m) => [...m, msg]); setTimeout(() => endRef.current?.scrollIntoView(), 50); }
  };

  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-3 min-h-[480px]">
        <div className="border-r divide-y max-h-[480px] overflow-y-auto">
          {connections.length === 0 && <p className="text-sm text-gray-400 p-4 text-center">Connect with a business to chat.</p>}
          {connections.map((c) => (
            <button key={c.id} onClick={() => setActiveId(c.id)}
              className={cn('w-full text-left p-3 hover:bg-gray-50 flex items-center justify-between gap-2', activeId === c.id && 'bg-emerald-50')}>
              <PeerLine peer={c.peer} />
              {c.unreadCount > 0 && <Badge className="bg-red-500 text-white border-0">{c.unreadCount}</Badge>}
            </button>
          ))}
        </div>
        <div className="md:col-span-2 flex flex-col max-h-[480px]">
          {!active ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm"><MessageCircle className="w-5 h-5 mr-2" /> Select a conversation</div>
          ) : (
            <>
              <div className="p-3 border-b"><PeerLine peer={active.peer} /></div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50/50">
                {loading && <p className="text-xs text-gray-400 text-center">Loading…</p>}
                {messages.map((m) => (
                  <div key={m.id} className={cn('max-w-[75%] rounded-lg px-3 py-2 text-sm', m.mine ? 'ml-auto bg-emerald-600 text-white' : 'bg-white border')}>
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p className={cn('text-[10px] mt-0.5', m.mine ? 'text-emerald-100' : 'text-gray-400')}>{new Date(m.createdAt).toLocaleString()}</p>
                  </div>
                ))}
                <div ref={endRef} />
              </div>
              <div className="p-3 border-t flex gap-2">
                <Input placeholder="Type a message…" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send(); }} />
                <Button onClick={send} disabled={!draft.trim()}><Send className="w-4 h-4" /></Button>
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

function PlaceOrderButton({ connection, onPlaced }: { connection: NetworkConnection; onPlaced: () => void }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<{ productName: string; quantity: string }[]>([{ productName: '', quantity: '1' }]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const clean = items.filter((i) => i.productName.trim()).map((i) => ({ productName: i.productName.trim(), quantity: Math.max(1, parseInt(i.quantity) || 1) }));
    if (clean.length === 0) { toast.error('Add at least one item'); return; }
    setSaving(true);
    try {
      await createNetworkOrder({ connectionId: connection.id, items: clean, notes: notes.trim() || undefined });
      toast.success(`Order sent to ${connection.peer?.name}`);
      setOpen(false); setItems([{ productName: '', quantity: '1' }]); setNotes(''); onPlaced();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setSaving(false); }
  };

  if (!open) return <Button size="sm" variant="outline" className="gap-1 text-emerald-700 border-emerald-300" onClick={() => setOpen(true)}><ShoppingCart className="w-4 h-4" /> Order</Button>;
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
      <div className="bg-white rounded-xl p-5 max-w-md w-full max-h-[90vh] overflow-y-auto space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold">Order from {connection.peer?.name}</h3>
        <div className="space-y-2">
          {items.map((it, i) => (
            <div key={i} className="flex gap-2">
              <Input placeholder="Medicine / product" value={it.productName} onChange={(e) => setItems((a) => a.map((x, j) => j === i ? { ...x, productName: e.target.value } : x))} className="flex-1" />
              <Input type="number" min={1} value={it.quantity} onChange={(e) => setItems((a) => a.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))} className="w-20" />
              {items.length > 1 && <Button size="icon" variant="ghost" className="text-red-500" onClick={() => setItems((a) => a.filter((_, j) => j !== i))}><X className="w-4 h-4" /></Button>}
            </div>
          ))}
          <Button size="sm" variant="outline" className="gap-1" onClick={() => setItems((a) => [...a, { productName: '', quantity: '1' }])}><Plus className="w-4 h-4" /> Add item</Button>
        </div>
        <Input placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={saving} onClick={submit}>{saving ? 'Sending…' : 'Send order'}</Button>
        </div>
      </div>
    </div>
  );
}

function OrdersPanel({ title, orders, role, onChanged }: { title: string; orders: import('@/types').NetworkOrder[]; role: 'buyer' | 'seller'; onChanged: () => void }) {
  const act = (id: string, action: 'accept' | 'decline' | 'ship' | 'cancel' | 'receive') =>
    networkOrderAction(id, action).then(() => { toast.success(`Order ${action}ed`); onChanged(); }).catch((e) => toast.error(e instanceof Error ? e.message : 'Failed'));
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">{title} ({orders.length})</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {orders.length === 0 && <p className="text-sm text-gray-400 py-3 text-center">None.</p>}
        {orders.map((o) => (
          <div key={o.id} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <p className="font-medium">{o.orderNumber} <span className="text-gray-400 font-normal">· {o.peer?.name}</span></p>
                <p className="text-xs text-gray-500">{o.totalQty} unit(s) · {o.items.length} item(s){o.notes ? ` · ${o.notes}` : ''}</p>
              </div>
              <Badge className={cn('border-0 capitalize', statusBadge(o.status))}>{o.status}</Badge>
            </div>
            <div className="text-xs text-gray-600">{o.items.map((it) => `${it.productName} ×${it.quantity}`).join(', ')}</div>
            <div className="flex gap-2 justify-end">
              {role === 'seller' && o.status === 'placed' && <>
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => act(o.id, 'accept')}>Accept</Button>
                <Button size="sm" variant="outline" onClick={() => act(o.id, 'decline')}>Decline</Button>
              </>}
              {role === 'seller' && o.status === 'accepted' && <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={() => act(o.id, 'ship')}>Mark shipped</Button>}
              {role === 'buyer' && (o.status === 'placed' || o.status === 'accepted') && <Button size="sm" variant="ghost" className="text-red-500" onClick={() => act(o.id, 'cancel')}>Cancel</Button>}
              {role === 'buyer' && (o.status === 'shipped' || o.status === 'accepted') && <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => act(o.id, 'receive')}>Receive → draft PO</Button>}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
