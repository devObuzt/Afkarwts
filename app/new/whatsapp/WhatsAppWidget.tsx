"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ago, hueOf, initials } from "../format";

type Thread = {
  memberId: number;
  name: string;
  phone: string;
  unread: number;
  lastAt: string;
  lastBody: string;
  lastDirection: "incoming" | "outgoing";
  windowOpen: boolean;
};

type Message = {
  id: number;
  direction: "incoming" | "outgoing";
  body: string;
  status: string;
  createdAt: string;
  mediaUrl?: string | null;
};

/**
 * WhatsApp beside the work rather than instead of it.
 *
 * The old inbox was the whole screen, so it could load every member and
 * give the conversation all the room there was. Here it is a column: a
 * narrow rail of threads and search, and one conversation open next to it.
 * It is a new component rather than the old page squeezed — a 2,400-line
 * screen built for full width does not become a sidebar by resizing.
 */
export function WhatsAppWidget({ canSend }: { canSend: boolean }) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  const open = threads.find((thread) => thread.memberId === openId) ?? null;

  const loadThreads = useCallback(async () => {
    const response = await fetch(`/api/inbox/threads?q=${encodeURIComponent(query)}&limit=40`);
    if (!response.ok) {
      return;
    }
    const payload = (await response.json()) as { threads: Thread[]; unreadTotal: number };
    setThreads(payload.threads);
    setUnreadTotal(payload.unreadTotal);
  }, [query]);

  const loadMessages = useCallback(async (memberId: number) => {
    const response = await fetch(`/api/members/${memberId}/messages`);
    if (!response.ok) {
      return;
    }
    const payload = (await response.json()) as { messages: Message[] };
    setMessages(payload.messages ?? []);
  }, []);

  // The rail refreshes on its own; a reply that lands while Afkar is in the
  // CRM should show up without her going looking for it.
  useEffect(() => {
    void loadThreads();
    const timer = setInterval(() => void loadThreads(), 30_000);
    return () => clearInterval(timer);
  }, [loadThreads]);

  useEffect(() => {
    if (openId === null) {
      setMessages([]);
      return;
    }
    void loadMessages(openId);
    void fetch(`/api/members/${openId}/read`, { method: "POST" }).then(() => loadThreads());
    const timer = setInterval(() => void loadMessages(openId), 20_000);
    return () => clearInterval(timer);
  }, [openId, loadMessages, loadThreads]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function send() {
    if (!openId || !draft.trim()) {
      return;
    }

    setSending(true);
    setError("");

    const response = await fetch("/api/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: openId, text: draft })
    });
    const payload = await response.json().catch(() => ({}));
    setSending(false);

    if (!response.ok) {
      setError(payload.error ?? "فشل الإرسال.");
      return;
    }

    setDraft("");
    await loadMessages(openId);
    await loadThreads();
  }

  return (
    <aside className="waPane">
      {/* The rail: search, threads, and the way out to the old screen. */}
      <div className="waRail">
        <div className="waRailHead">
          <span className="waTitle">واتساب</span>
          {unreadTotal > 0 && <span className="crmPill alert">{unreadTotal}</span>}
        </div>

        <input
          className="waSearch"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="بحث"
          type="search"
          value={query}
        />

        <div className="waThreads">
          {threads.length === 0 ? (
            <p className="crmEmpty" style={{ padding: "18px 10px", fontSize: 13 }}>
              لا محادثات.
            </p>
          ) : (
            threads.map((thread) => (
              <button
                className={thread.memberId === openId ? "waThread current" : "waThread"}
                key={thread.memberId}
                onClick={() => setOpenId(thread.memberId)}
                type="button"
              >
                <span className="crmAvatar" data-hue={hueOf(thread.name)}>
                  {initials(thread.name)}
                </span>
                <span className="waThreadText">
                  <span className="waThreadName">
                    {thread.name}
                    {thread.unread > 0 && <span className="waDot">{thread.unread}</span>}
                  </span>
                  <span className="waThreadLast">
                    {thread.lastDirection === "outgoing" ? "↩ " : ""}
                    {thread.lastBody.slice(0, 40) || "—"}
                  </span>
                  <span className="waThreadWhen">{ago(thread.lastAt)}</span>
                </span>
              </button>
            ))
          )}
        </div>

        <a className="waOld" href="/">
          الواجهة الكاملة
        </a>
      </div>

      {/* The conversation. */}
      <div className="waChat">
        {!open ? (
          <p className="crmEmpty">اختر محادثة من القائمة.</p>
        ) : (
          <>
            <header className="waChatHead">
              <Link className="waChatName" href={`/new/people/${open.memberId}`}>
                {open.name}
              </Link>
              <span className={open.windowOpen ? "crmPill live" : "crmPill open"}>
                {open.windowOpen ? "النافذة مفتوحة" : "النافذة مغلقة"}
              </span>
            </header>

            <div className="waMessages">
              {messages.map((message) => (
                <div className={`waBubble ${message.direction}`} key={message.id}>
                  {message.body}
                  <span className="waWhen">{ago(message.createdAt)}</span>
                </div>
              ))}
              <div ref={bottom} />
            </div>

            {error && <p className="crmError" style={{ margin: "0 12px 8px" }}>{error}</p>}

            {canSend && open.windowOpen ? (
              <div className="waCompose">
                <textarea
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                      void send();
                    }
                  }}
                  placeholder="اكتب الرد…"
                  value={draft}
                />
                <button className="crmBtn primary" disabled={sending || !draft.trim()} onClick={send} type="button">
                  {sending ? "…" : "إرسال"}
                </button>
              </div>
            ) : (
              <p className="crmNote waClosed">
                {canSend
                  ? "مضى أكثر من 24 ساعة على آخر رسالة منه. الإرسال الآن يحتاج قالباً معتمداً."
                  : "لا تملك صلاحية الإرسال."}
              </p>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
