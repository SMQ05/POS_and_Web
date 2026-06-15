import { useEffect, useState, useRef } from 'react';
import { fetchThreads, fetchThreadMessages, postThreadMessage, fetchPartners, createThread } from '@/lib/backend';
import type { InboxThread, InboxMessage, Partner } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, Send, RefreshCw, Plus, MessageSquare, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Props {
  onClose: () => void;
}

// M8 — Mobile inbox. Two screens: thread list and chat. Tap a row to drill in.
export function MobileInbox({ onClose }: Props) {
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [activeThread, setActiveThread] = useState<InboxThread | null>(null);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [showNewSheet, setShowNewSheet] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newPartnerId, setNewPartnerId] = useState('');
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      setThreads(await fetchThreads());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    fetchPartners().then(setPartners).catch(() => {/* tolerate */});
  }, []);

  const openThread = async (t: InboxThread) => {
    setActiveThread(t);
    try {
      const rows = await fetchThreadMessages(t.id);
      setMessages(rows);
      setThreads((prev) => prev.map((x) => (x.id === t.id ? { ...x, unreadCount: 0 } : x)));
      setTimeout(() => scrollerRef.current?.scrollTo({ top: scrollerRef.current!.scrollHeight }), 60);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to load messages');
    }
  };

  const sendReply = async () => {
    if (!activeThread || !reply.trim()) return;
    setSending(true);
    try {
      const msg = await postThreadMessage(activeThread.id, { body: reply.trim() });
      setMessages((prev) => [...prev, msg]);
      setReply('');
      setTimeout(() => scrollerRef.current?.scrollTo({ top: scrollerRef.current!.scrollHeight, behavior: 'smooth' }), 60);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSending(false);
    }
  };

  const handleCreate = async () => {
    if (!newSubject.trim() || !newBody.trim()) { toast.error('Subject + body required'); return; }
    try {
      const created = await createThread({
        partnerId: newPartnerId || undefined,
        subject: newSubject.trim(),
        body: newBody.trim(),
      });
      setShowNewSheet(false);
      setNewSubject(''); setNewBody(''); setNewPartnerId('');
      await refresh();
      await openThread(created.thread);
      toast.success('Sent');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-gray-950 flex flex-col">
      <div className="px-4 pt-4 pb-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={activeThread ? () => setActiveThread(null) : onClose}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-sm">{activeThread ? activeThread.subject : 'Inbox'}</h2>
          {activeThread ? (
            <p className="text-[10px] text-gray-500 truncate">
              {(() => {
                const p = partners.find((x) => x.id === activeThread.partnerId);
                return p ? `${p.name} · ${p.type}` : 'No partner attached';
              })()}
            </p>
          ) : (
            <p className="text-[10px] text-gray-500">{threads.length} threads</p>
          )}
        </div>
        {!activeThread && (
          <>
            <Button variant="ghost" size="icon" onClick={refresh} disabled={loading}>
              <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            </Button>
            <Button size="sm" onClick={() => setShowNewSheet(true)} className="bg-emerald-600 hover:bg-emerald-700 gap-1">
              <Plus className="w-3 h-3" /> New
            </Button>
          </>
        )}
      </div>

      {/* Thread list */}
      {!activeThread ? (
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {threads.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No conversations yet.</p>
            </div>
          ) : threads.map((t) => {
            const p = partners.find((x) => x.id === t.partnerId);
            return (
              <button
                key={t.id}
                onClick={() => openThread(t)}
                className="w-full text-left p-3 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 active:scale-98 transition-transform"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-gray-900 dark:text-white truncate">{t.subject}</span>
                  {t.unreadCount > 0 && <Badge className="bg-red-500 text-white text-[9px] px-1.5 h-4 min-w-[16px]">{t.unreadCount}</Badge>}
                </div>
                <p className="text-[11px] text-gray-500 truncate mt-0.5">{p ? `${p.name} · ${p.type}` : 'Untargeted'}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{new Date(t.lastMessageAt).toLocaleString()}</p>
              </button>
            );
          })}
        </div>
      ) : (
        <>
          <div ref={scrollerRef} className="flex-1 overflow-y-auto p-3 space-y-2">
            {messages.map((m) => {
              const isMe = m.senderType === 'tenant';
              return (
                <div
                  key={m.id}
                  className={cn(
                    'max-w-[85%] rounded-2xl p-3 text-sm',
                    isMe ? 'bg-emerald-100 dark:bg-emerald-900/30 ml-auto' : 'bg-gray-100 dark:bg-gray-800',
                  )}
                >
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  <p className="text-[10px] text-gray-500 mt-1">{m.senderName ?? m.senderType} · {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              );
            })}
          </div>
          <div className="border-t border-gray-100 dark:border-gray-800 p-3 flex gap-2">
            <Textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={2}
              placeholder="Reply…"
              disabled={sending}
              className="flex-1 text-sm"
            />
            <Button onClick={sendReply} disabled={sending || !reply.trim()} className="self-end bg-emerald-600 hover:bg-emerald-700 gap-1">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </>
      )}

      {/* New message sheet */}
      {showNewSheet && (
        <div className="fixed inset-0 z-50 flex flex-end bg-black/60 backdrop-blur-sm">
          <div className="w-full mt-auto bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 rounded-t-3xl shadow-2xl p-5 space-y-3 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-2">
              <h3 className="font-bold text-sm">New message</h3>
              <button onClick={() => setShowNewSheet(false)} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-500">Recipient</label>
              <select
                value={newPartnerId}
                onChange={(e) => setNewPartnerId(e.target.value)}
                className="h-10 rounded-xl bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 px-3 text-sm w-full"
              >
                <option value="">(no partner)</option>
                {partners.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.type}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-500">Subject</label>
              <Input value={newSubject} onChange={(e) => setNewSubject(e.target.value)} className="h-10 rounded-xl" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-gray-500">Body</label>
              <Textarea value={newBody} onChange={(e) => setNewBody(e.target.value)} rows={5} className="text-sm" />
            </div>
            <Button onClick={handleCreate} className="w-full bg-emerald-600 hover:bg-emerald-700">Send</Button>
          </div>
        </div>
      )}
    </div>
  );
}
