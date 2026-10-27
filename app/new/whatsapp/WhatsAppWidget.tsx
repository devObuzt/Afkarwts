"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { colourForLabel, inkOnLabel } from "@/app/lib/labels/colours";
import { ago, hueOf, initials, preview } from "../format";

type Thread = {
  memberId: number;
  name: string;
  phone: string;
  unread: number;
  lastAt: string;
  lastBody: string;
  lastType: string;
  lastFilename: string;
  lastDirection: "incoming" | "outgoing";
  windowOpen: boolean;
  labels: Array<{ id: number; name: string; colour: string }>;
};

type Message = {
  id: number;
  direction: "incoming" | "outgoing";
  body: string;
  status: string;
  createdAt: string;
  messageType?: string;
  mediaUrl?: string | null;
  mediaMimeType?: string | null;
  mediaFilename?: string | null;
};

type Template = { name: string; language: string; status: string; bodyText: string; paramCount: number };

/**
 * Dragging the edge of a pane, the way a column is widened in Excel.
 *
 * Three regions share the row — the dashboard, the open conversation, and
 * the rail of threads — and which one needs the room changes with the
 * hour: reading a long reply is not the same work as scanning the list.
 * The proportions Wisam set are the starting point, not a verdict.
 *
 * Widths are kept as percentages, not pixels, so a resized window keeps
 * the proportion rather than the number, and they are remembered in this
 * browser. Double-click a grip to put it back where it started.
 */
const GRIPS = {
  /** The boundary between WhatsApp and the dashboard, while a chat is open. */
  pane: { key: "afkar:wa:pane", fallback: 40, min: 20, max: 72, prop: "--wa-pane" },
  /** The same boundary with no chat open: the rail alone is narrower. */
  paneClosed: { key: "afkar:wa:paneClosed", fallback: 22, min: 12, max: 60, prop: "--wa-pane-closed" },
  /** Inside the pane: the rail against the conversation. */
  rail: { key: "afkar:wa:rail", fallback: 37.5, min: 18, max: 78, prop: "--wa-rail" }
} as const;

type GripName = keyof typeof GRIPS;

function readWidth(name: GripName) {
  const grip = GRIPS[name];
  const live = parseFloat(
    document.querySelector<HTMLElement>(".crmWork")?.style.getPropertyValue(grip.prop) ?? ""
  );
  if (live >= grip.min && live <= grip.max) {
    return live;
  }
  try {
    const stored = Number(localStorage.getItem(grip.key));
    if (stored >= grip.min && stored <= grip.max) {
      return stored;
    }
  } catch {
    // Storage blocked: the defaults are perfectly usable.
  }
  return grip.fallback;
}

function applyWidth(name: GripName, percent: number) {
  const grip = GRIPS[name];
  const clamped = Math.min(grip.max, Math.max(grip.min, percent));
  document.querySelector<HTMLElement>(".crmWork")?.style.setProperty(grip.prop, `${clamped}%`);
  try {
    localStorage.setItem(grip.key, String(Math.round(clamped * 10) / 10));
  } catch {
    // Not being able to remember it is not a reason to refuse the drag.
  }
  return clamped;
}

function PaneGrip({ name, label }: { name: GripName; label: string }) {
  function drag(event: React.PointerEvent<HTMLDivElement>) {
    const handle = event.currentTarget;
    // The pane sits flush against the right edge in RTL, so a width is
    // measured from that edge inwards — and the rail from the pane's own
    // right edge, not the screen's.
    const edge =
      name === "rail"
        ? handle.closest<HTMLElement>(".waPane")?.getBoundingClientRect()
        : document.querySelector<HTMLElement>(".crmWork")?.getBoundingClientRect();
    if (!edge || edge.width <= 0) {
      return;
    }

    handle.setPointerCapture(event.pointerId);
    document.body.classList.add("isResizing");

    const move = (moved: PointerEvent) => {
      applyWidth(name, ((edge.right - moved.clientX) / edge.width) * 100);
    };
    const done = () => {
      document.body.classList.remove("isResizing");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", done);
      window.removeEventListener("pointercancel", done);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", done);
    window.addEventListener("pointercancel", done);
  }

  return (
    <div
      aria-label={label}
      aria-orientation="vertical"
      className="waGrip"
      onDoubleClick={() => applyWidth(name, GRIPS[name].fallback)}
      onKeyDown={(event) => {
        // The keyboard moves it too: a pointer is not the only way to
        // say «this needs more room».
        const step = event.key === "ArrowLeft" ? 2 : event.key === "ArrowRight" ? -2 : 0;
        if (!step) {
          return;
        }
        event.preventDefault();
        applyWidth(name, readWidth(name) + step);
      }}
      onPointerDown={drag}
      role="separator"
      tabIndex={0}
    />
  );
}

/**
 * What a message actually is, rather than the id of the file behind it.
 *
 * Without this a voice note read as «wamid.HBgMOTcy…jpg» — the raw
 * identifier, in the bubble, where the message should have been.
 */
function MessageBody({ message }: { message: Message }) {
  const kind = message.messageType ?? "text";
  const mime = message.mediaMimeType ?? "";

  if (message.mediaUrl && (kind === "image" || mime.startsWith("image/"))) {
    return (
      <>
        <img alt={message.mediaFilename ?? ""} className="waMedia" src={message.mediaUrl} />
        {message.body ? <p dir="auto">{message.body}</p> : null}
      </>
    );
  }

  if (message.mediaUrl && (kind === "video" || mime.startsWith("video/"))) {
    return (
      <>
        <video className="waMedia" controls playsInline preload="metadata" src={message.mediaUrl} />
        {message.body ? <p dir="auto">{message.body}</p> : null}
      </>
    );
  }

  if (message.mediaUrl && (kind === "audio" || mime.startsWith("audio/"))) {
    return <audio className="waAudio" controls preload="metadata" src={message.mediaUrl} />;
  }

  if (message.mediaUrl) {
    return (
      <a className="waFile" href={message.mediaUrl} rel="noreferrer" target="_blank">
        📎 {message.mediaFilename || message.body || "افتحي الملف"}
      </a>
    );
  }

  return <p dir="auto" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{message.body}</p>;
}

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
  const [limit, setLimit] = useState(40);

  // The remembered widths, put back before the first paint of the pane.
  useEffect(() => {
    for (const name of ["pane", "paneClosed", "rail"] as const) {
      applyWidth(name, readWidth(name));
    }
  }, []);
  const [file, setFile] = useState<File | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [picking, setPicking] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  const open = threads.find((thread) => thread.memberId === openId) ?? openThread;

  const loadThreads = useCallback(async () => {
    const response = await fetch(`/api/inbox/threads?q=${encodeURIComponent(query)}&limit=${limit}`);
    if (!response.ok) {
      return;
    }
    const payload = (await response.json()) as { threads: Thread[]; unreadTotal: number; hasMore?: boolean };
    setThreads(payload.threads);
    setUnreadTotal(payload.unreadTotal);
    setHasMore(Boolean(payload.hasMore));
  }, [query, limit]);

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

  /**
   * A file goes up as raw bytes with its own type, not as a form field:
   * the route reads the body as the file and takes the name and caption
   * from the query, which is what keeps a 60 MB video off the heap.
   */
  async function sendFile() {
    if (!openId || !file) {
      return;
    }
    setSending(true);
    setError("");
    const mimeType = file.type.split(";")[0].trim() || "application/octet-stream";
    const query = new URLSearchParams({
      memberId: String(openId),
      caption: draft,
      filename: file.name,
      mimeType
    });
    const response = await fetch(`/api/messages/send-media?${query}`, {
      method: "POST",
      headers: { "Content-Type": mimeType },
      body: file
    });
    const payload = await response.json().catch(() => ({}));
    setSending(false);
    if (!response.ok) {
      setError(payload.error ?? "ما زبط إرسال الملف.");
      return;
    }
    setFile(null);
    setDraft("");
    await loadMessages(openId);
    await loadThreads();
  }

  /**
   * Outside the 24-hour window only an approved template reaches her —
   * free text is accepted by Meta and then dropped, with no error.
   */
  async function sendTemplate(template: Template) {
    if (!openId) {
      return;
    }
    setSending(true);
    setError("");
    const response = await fetch("/api/messages/send-template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memberId: openId,
        templateName: template.name,
        templateLanguage: template.language,
        bodyParams: Array.from({ length: template.paramCount }, (_, at) => (at === 0 ? "{{name}}" : "")),
        bodyPreview: template.bodyText
      })
    });
    const payload = await response.json().catch(() => ({}));
    setSending(false);
    setPicking(false);
    if (!response.ok) {
      setError(payload.error ?? "ما زبط إرسال القالب.");
      return;
    }
    await loadMessages(openId);
    await loadThreads();
  }

  async function openTemplates() {
    setPicking(true);
    if (templates.length) {
      return;
    }
    const response = await fetch("/api/templates");
    if (response.ok) {
      const payload = await response.json();
      setTemplates((payload.templates ?? []).filter((item: Template) => item.status === "APPROVED"));
    }
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
      {/* The edge against the dashboard. Which of the two boundaries it
          moves depends on whether a conversation is open, because the two
          states are deliberately different widths. */}
      <PaneGrip label="عرض الواتساب" name={open ? "pane" : "paneClosed"} />

      {/* The rail: search, threads, and the way out to the old screen. */}
      <div className="waRail">
        {open ? <PaneGrip label="عرض قائمة المحادثات" name="rail" /> : null}
        <div className="waRailHead">
          <span className="waTitle">واتساب</span>
          {unreadTotal > 0 && <span className="crmPill alert">{unreadTotal}</span>}
        </div>

        <input
          className="waSearch"
          onChange={(event) => {
            setQuery(event.target.value);
            setLimit(40);
          }}
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
                <span className="crmAvatar" data-hue={hueOf(thread.name || thread.phone)}>
                  {initials(thread.name || thread.phone)}
                </span>
                <span className="waThreadText">
                  <span className="waThreadName">
                    {thread.name.trim() || thread.phone}
                    {thread.unread > 0 && <span className="waDot">{thread.unread}</span>}
                  </span>
                  <span className="waThreadLast">
                    {thread.lastDirection === "outgoing" ? "↩ " : ""}
                    {preview({ type: thread.lastType, body: thread.lastBody, filename: thread.lastFilename }).slice(0, 40) || "—"}
                  </span>
                  {/*
                    The lists she is on, on her own row: the دفعة, the
                    مسار, the حالة. Nothing at all when she is on none —
                    an empty row says «no label» more clearly than a
                    placeholder that has to be read first.
                  */}
                  {thread.labels.length ? (
                    <span className="waThreadLabels">
                      {thread.labels.map((label) => {
                        const background = colourForLabel(label);
                        return (
                          <span
                            className="labelChip tiny"
                            key={label.id}
                            style={{ background, color: inkOnLabel(background) }}
                          >
                            {label.name}
                          </span>
                        );
                      })}
                    </span>
                  ) : null}
                  <span className="waThreadWhen">{ago(thread.lastAt)}</span>
                </span>
              </button>
            ))
          )}
        </div>

        {/*
          The rail holds the newest forty; the rest are a press away. A
          button rather than an endless scroll: the list is something you
          work down, and knowing where the end is matters.
        */}
        {hasMore ? (
          <button className="waMore" onClick={() => setLimit((current) => current + 40)} type="button">
            حمّلي محادثات أكثر
          </button>
        ) : null}

        <a className="waOld" href="/">
          الواجهة الكاملة
        </a>
      </div>

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
                <MessageBody message={message} />
                <span className="waWhen">{ago(message.createdAt)}</span>
              </div>
            ))}
            <div ref={bottom} />
          </div>

          {error && <p className="crmError" style={{ margin: "0 12px 8px" }}>{error}</p>}

          {/*
            A template reaches her whether the window is open or shut, so
            the picker is offered in both states — it is simply the only
            thing that works in one of them.
          */}
          {canSend && picking ? (
            <div className="waTemplates">
              <div className="waRailHead">
                <span className="waTitle">قالب معتمد</span>
                <button className="crmBtn" onClick={() => setPicking(false)} type="button">
                  إلغاء
                </button>
              </div>
              {templates.length ? (
                templates.map((template) => (
                  <button
                    className="waTemplate"
                    disabled={sending}
                    key={`${template.name}:${template.language}`}
                    onClick={() => void sendTemplate(template)}
                    type="button"
                  >
                    <strong>{template.name}</strong>
                    <span>{template.bodyText.slice(0, 90)}</span>
                  </button>
                ))
              ) : (
                <p className="crmEmpty">بنحمّل القوالب…</p>
              )}
            </div>
          ) : null}

          {canSend ? (
            <div className="waCompose">
              {file ? (
                <div className="waFilePicked">
                  📎 {file.name}
                  <button className="crmBtn" onClick={() => setFile(null)} type="button">
                    شيلي
                  </button>
                </div>
              ) : null}

              {open.windowOpen ? (
                <textarea
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                      void (file ? sendFile() : send());
                    }
                  }}
                  placeholder={file ? "تعليق على الملف (اختياري)…" : "اكتبي الرد…"}
                  value={draft}
                />
              ) : (
                <p className="crmNote waClosed">
                  مرّ أكتر من 24 ساعة على آخر رسالة منها — الوصول هلق بدّه قالب معتمد.
                </p>
              )}

              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {open.windowOpen ? (
                  <label className="crmBtn" style={{ cursor: "pointer" }} title="أرفقي ملف">
                    📎
                    <input
                      hidden
                      onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                      type="file"
                    />
                  </label>
                ) : null}

                <button className="crmBtn" disabled={sending} onClick={() => void openTemplates()} type="button">
                  قالب
                </button>

                {open.windowOpen ? (
                  <button
                    className="crmBtn primary"
                    disabled={sending || (!draft.trim() && !file)}
                    onClick={() => void (file ? sendFile() : send())}
                    type="button"
                  >
                    {sending ? "…" : "إرسال"}
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="crmNote waClosed">ما عندك صلاحية إرسال.</p>
          )}
        </div>
      )}
    </aside>
  );
}
