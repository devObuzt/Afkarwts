"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { colourForLabel, inkOnLabel } from "@/app/lib/labels/colours";
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
  // The rail is filtered by the search box. Without a copy of the thread,
  // typing a name would close the conversation that is open.
  const [openThread, setOpenThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [labels, setLabels] = useState<Array<{ id: number; name: string; colour: string; memberCount: number }>>([]);
  const [labelId, setLabelId] = useState<number | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const open = threads.find((thread) => thread.memberId === openId) ?? openThread;

  const loadThreads = useCallback(async () => {
    const response = await fetch(
      `/api/inbox/threads?q=${encodeURIComponent(query)}&limit=40${labelId ? `&label=${labelId}` : ""}`
    );
    if (!response.ok) {
      return;
    }
    const payload = (await response.json()) as { threads: Thread[]; unreadTotal: number };
    setThreads(payload.threads);
    setUnreadTotal(payload.unreadTotal);
  }, [query, labelId]);

  const loadMessages = useCallback(async (memberId: number) => {
    const response = await fetch(`/api/members/${memberId}/messages`);
    if (!response.ok) {
      return;
    }
    const payload = (await response.json()) as { messages: Message[] };
    setMessages(payload.messages ?? []);
  }, []);

  // The labels are the lists Afkar already works in — the دفعة, the مسار,
  // the حالة. They are read once: a label is not something that changes
  // while she reads a conversation.
  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/labels");
      if (response.ok) {
        setLabels(((await response.json()).labels ?? []).filter((label: { memberCount: number }) => label.memberCount));
      }
    })();
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

  /**
   * «Treat this as if we never opened it.»
   *
   * Opening a thread marks it read on the spot, and until now there was no
   * way back: a conversation you glanced at while busy was gone from the
   * unread list for good. This puts it back where it was — no flag of its
   * own, just the read mark moved behind her last message — and closes the
   * panel, because leaving it open is exactly the «we opened it» this
   * undoes.
   */
  async function markUnread() {
    if (!openId) {
      return;
    }
    const response = await fetch(`/api/members/${openId}/unread`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setError(payload.error ?? "ما قدرنا نعلّمها كغير مقروءة.");
      return;
    }
    setOpenId(null);
    setOpenThread(null);
    await loadThreads();
  }

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
    /* The conversation is not drawn until one is chosen, and the rail
       alone leaves the system 85% of the screen instead of 60%. */
    <aside className="waPane" data-open={open ? "yes" : "no"}>
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
                onClick={() => {
                  setOpenId(thread.memberId);
                  setOpenThread(thread);
                }}
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

      {/*
        With no conversation open, the column the conversation would have
        filled shows the labels instead of nothing: the دفعة, the مسار,
        the حالة — the lists Afkar already works in. Pressing one narrows
        the rail to it, so the space is a way of working rather than a
        decoration.
      */}
      {!open && labels.length ? (
        <div className="waLabels">
          <div className="waRailHead">
            <span className="waTitle">الملصقات</span>
            {labelId ? (
              <button className="crmBtn" onClick={() => setLabelId(null)} type="button">
                الكل
              </button>
            ) : null}
          </div>
          <div className="waLabelList">
            {labels.map((label) => {
              const background = colourForLabel(label);
              const chosen = labelId === label.id;
              return (
                <button
                  className={chosen ? "labelChip chosen" : "labelChip"}
                  key={label.id}
                  onClick={() => setLabelId(chosen ? null : label.id)}
                  style={{ background, color: inkOnLabel(background) }}
                  title={`${label.memberCount} منتسبة`}
                  type="button"
                >
                  {label.name}
                  <span className="labelCount">{label.memberCount}</span>
                </button>
              );
            })}
          </div>
          <Link className="waOld" href="/new/labels">
            إدارة الملصقات
          </Link>
        </div>
      ) : null}

      {/* The conversation, only once there is one. */}
      {open && (
        <div className="waChat">
          <header className="waChatHead">
            <Link className="waChatName" href={`/new/people/${open.memberId}`}>
              {open.name}
            </Link>
            <span className={open.windowOpen ? "crmPill live" : "crmPill open"}>
              {open.windowOpen ? "النافذة مفتوحة" : "النافذة مغلقة"}
            </span>
            <button
              className="waUnread"
              onClick={() => void markUnread()}
              title="بترجع المحادثة لغير المقروءة، كأننا ما فتحناها"
              type="button"
            >
              علّمها كغير مقروءة
            </button>
            <button
              aria-label="إغلاق المحادثة"
              className="waClose"
              onClick={() => {
                setOpenId(null);
                setOpenThread(null);
              }}
              title="إغلاق المحادثة"
              type="button"
            >
              ×
            </button>
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
        </div>
      )}
    </aside>
  );
}
