import { useEffect, useState, useRef } from 'react';
import { fetchThreads, createThread, fetchThreadMessages, postThreadMessage, fetchPartners, fetchNetworkDirectory, requestConnection, type DirectoryBusiness } from '@/lib/backend';
import type { InboxThread, InboxMessage, Partner } from '@/types';
import { useSettingsStore } from '@/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquare, Send, Plus, RefreshCw, Inbox as InboxIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// M7 — Two-pane inbox for partner conversations. Reads from /api/threads.
// Sending a tenant message emits an outbox row (currently stubbed). Inbound
// messages arrive via /api/webhooks/wholesale/inbound (also stubbed signature).
export function Inbox() {
  const { settings } = useSettingsStore();
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [active, setActive] = useState<InboxThread | null>(null);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newPartnerId, setNewPartnerId] = useState<string>('');
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  // Item 3 — directory of all businesses on the platform, for "add request".
  const [directory, setDirectory] = useState<DirectoryBusiness[]>([]);
  const [dirSearch, setDirSearch] = useState('');
  const [connecting, setConnecting] = useState<string | null>(null);

  const loadDirectory = async () => {
    try { setDirectory(await fetchNetworkDirectory()); } catch { /* tolerate */ }
  };

  const connect = async (biz: DirectoryBusiness) => {
    if (!biz.handle) return;
    setConnecting(biz.id);
    try {
      await requestConnection(biz.handle);
      setDirectory((prev) => prev.map((b) => (b.id === biz.id ? { ...b, connectionStatus: 'pending' } : b)));
      toast.success(`Request sent to ${biz.name}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send request');
    } finally {
      setConnecting(null);
    }
  };

  const refreshThreads = async () => {
    setLoading(true);
    try {
      setThreads(await fetchThreads());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to load inbox');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshThreads();
    fetchPartners().then(setPartners).catch(() => {/* tolerate */});
    loadDirectory();
  }, []);

  const dirFiltered = directory.filter((b) => {
    if (!dirSearch.trim()) return true;
    const q = dirSearch.toLowerCase();
    return b.name.toLowerCase().includes(q) || (b.handle ?? '').toLowerCase().includes(q) || (b.businessType ?? '').toLowerCase().includes(q);
  });

  const openThread = async (t: InboxThread) => {
    setActive(t);
    try {
      const rows = await fetchThreadMessages(t.id);
      setMessages(rows);
      // Server already marks them read; reflect locally too
      setThreads((prev) => prev.map((x) => (x.id === t.id ? { ...x, unreadCount: 0 } : x)));
      setTimeout(() => scrollerRef.current?.scrollTo({ top: scrollerRef.current!.scrollHeight }), 50);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to load messages');
    }
  };

  const sendReply = async () => {
    if (!active || !reply.trim()) return;
    setSending(true);
    try {
      const msg = await postThreadMessage(active.id, { body: reply.trim() });
      setMessages((prev) => [...prev, msg]);
      setReply('');
      setTimeout(() => scrollerRef.current?.scrollTo({ top: scrollerRef.current!.scrollHeight, behavior: 'smooth' }), 50);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  const handleNewThread = async () => {
    if (!newSubject.trim() || !newBody.trim()) { toast.error('Subject and body required'); return; }
    try {
      const created = await createThread({
        partnerId: newPartnerId || undefined,
        subject: newSubject.trim(),
        body: newBody.trim(),
      });
      setShowNewDialog(false);
      setNewSubject(''); setNewBody(''); setNewPartnerId('');
      await refreshThreads();
      await openThread(created.thread);
      toast.success('Message sent');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  };

  const dark = settings.theme === 'dark';

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <InboxIcon className="w-6 h-6 text-emerald-600" />
          <div>
            <h1 className="text-2xl font-bold">Inbox</h1>
            <p className="text-xs text-gray-500">Conversations with wholesale partners, hospitals, clinics.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refreshThreads} disabled={loading} className="gap-2">
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} /> Refresh
          </Button>
          <Button onClick={() => setShowNewDialog(true)} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
            <Plus className="w-4 h-4" /> New message
          </Button>
        </div>
      </div>

      {/* Item 3 — discoverable directory of businesses on Kynex */}
      <Card className={cn(dark && 'bg-gray-800 border-gray-700')}>
        <CardHeader className="pb-2 flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Businesses on Kynex ({directory.length})</CardTitle>
          <Input
            value={dirSearch}
            onChange={(e) => setDirSearch(e.target.value)}
            placeholder="Search hospitals, distributors, wholesalers…"
            className="h-8 w-72 text-xs"
          />
        </CardHeader>
        <CardContent>
          {directory.length === 0 ? (
            <p className="text-xs text-gray-500 py-3">No other businesses on the platform yet.</p>
          ) : (
            <ScrollArea className="max-h-56">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {dirFiltered.map((b) => (
                  <div key={b.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{b.name}</p>
                      <p className="text-[11px] text-gray-500 truncate">@{b.handle} · <span className="capitalize">{b.businessType || 'business'}</span></p>
                    </div>
                    {b.connectionStatus === 'accepted' ? (
                      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 text-[10px]">Connected</Badge>
                    ) : b.connectionStatus === 'pending' ? (
                      <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">Requested</Badge>
                    ) : b.connectionStatus === 'blocked' ? (
                      <Badge variant="outline" className="text-[10px] text-gray-400">Blocked</Badge>
                    ) : (
                      <Button size="sm" variant="outline" className="h-7 gap-1 text-xs text-emerald-700" disabled={connecting === b.id} onClick={() => connect(b)}>
                        <Plus className="w-3 h-3" /> Add request
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[320px,1fr] gap-4 min-h-[calc(100vh-16rem)]">
        <Card className={cn(dark && 'bg-gray-800 border-gray-700')}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Threads ({threads.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[calc(100vh-22rem)]">
              {threads.length === 0 ? (
                <p className="text-xs text-gray-500 p-4">No conversations yet.</p>
              ) : (
                <div className="space-y-1 p-2">
                  {threads.map((t) => {
                    const partner = partners.find((p) => p.id === t.partnerId);
                    return (
                      <button
                        key={t.id}
                        onClick={() => openThread(t)}
                        className={cn(
                          'w-full text-left p-2 rounded-md text-sm',
                          active?.id === t.id ? 'bg-emerald-100 dark:bg-emerald-900/20' : 'hover:bg-gray-100 dark:hover:bg-gray-700',
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium truncate">{t.subject}</span>
                          {t.unreadCount > 0 && (
                            <Badge className="bg-red-500 text-white text-[9px] px-1.5 h-4 min-w-[16px]">{t.unreadCount}</Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-500 truncate">
                          {partner ? `${partner.name} · ${partner.type}` : 'Untargeted'}
                        </p>
                        <p className="text-[10px] text-gray-400">{new Date(t.lastMessageAt).toLocaleString()}</p>
                      </button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className={cn(dark && 'bg-gray-800 border-gray-700', 'flex flex-col')}>
          {!active ? (
            <CardContent className="py-16 text-center text-gray-500">
              <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Pick a thread to read or start a new message.</p>
            </CardContent>
          ) : (
            <>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{active.subject}</CardTitle>
                <p className="text-[11px] text-gray-500">
                  {(() => {
                    const partner = partners.find((p) => p.id === active.partnerId);
                    return partner ? `${partner.name} · ${partner.type}` : 'No partner attached';
                  })()}
                </p>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col gap-3 p-3 min-h-[300px]">
                <div ref={scrollerRef} className="flex-1 overflow-y-auto space-y-3">
                  {messages.map((m) => {
                    const isMe = m.senderType === 'tenant';
                    return (
                      <div key={m.id} className={cn('max-w-[80%] rounded-2xl p-3 text-sm', isMe ? 'bg-emerald-100 dark:bg-emerald-900/30 ml-auto' : 'bg-gray-100 dark:bg-gray-800')}>
                        <p className="whitespace-pre-wrap">{m.body}</p>
                        <p className="text-[10px] text-gray-500 mt-1">
                          {m.senderName ?? m.senderType} · {new Date(m.createdAt).toLocaleString()}
                        </p>
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-2 border-t pt-3">
                  <Textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Type a reply…"
                    rows={2}
                    className="flex-1"
                    disabled={sending}
                  />
                  <Button onClick={sendReply} disabled={sending || !reply.trim()} className="self-end bg-emerald-600 hover:bg-emerald-700 gap-1">
                    <Send className="w-4 h-4" /> Send
                  </Button>
                </div>
              </CardContent>
            </>
          )}
        </Card>
      </div>

      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New message</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div>
              <Label className="text-xs">Recipient</Label>
              <Select value={newPartnerId} onValueChange={setNewPartnerId}>
                <SelectTrigger><SelectValue placeholder="Pick a partner (optional)" /></SelectTrigger>
                <SelectContent>
                  {partners.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} · {p.type}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Subject</Label>
              <Input value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder="e.g. Restock order" />
            </div>
            <div>
              <Label className="text-xs">Body</Label>
              <Textarea value={newBody} onChange={(e) => setNewBody(e.target.value)} rows={5} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewDialog(false)}>Cancel</Button>
            <Button onClick={handleNewThread} className="bg-emerald-600 hover:bg-emerald-700">Send</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
