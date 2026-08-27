"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Mp3Encoder } from "@breezystack/lamejs";
import { setupNativePush } from "./lib/native-push";

// WhatsApp rejects browser MediaRecorder containers (fragmented MP4/WebM),
// so recordings are transcoded to plain MP3 before sending.
async function transcodeToMp3(blob: Blob): Promise<File> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioContextCtor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioContext = new AudioContextCtor();
  const decoded = await audioContext.decodeAudioData(arrayBuffer);
  void audioContext.close();

  const first = decoded.getChannelData(0);
  let mono = first;
  if (decoded.numberOfChannels > 1) {
    const second = decoded.getChannelData(1);
    mono = new Float32Array(first.length);
    for (let i = 0; i < first.length; i += 1) {
      mono[i] = (first[i] + second[i]) / 2;
    }
  }

  const samples = new Int16Array(mono.length);
  for (let i = 0; i < mono.length; i += 1) {
    const s = Math.max(-1, Math.min(1, mono[i]));
    samples[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  const encoder = new Mp3Encoder(1, decoded.sampleRate, 96);
  const chunks: Uint8Array[] = [];
  const blockSize = 1152;
  for (let i = 0; i < samples.length; i += blockSize) {
    const encoded = encoder.encodeBuffer(samples.subarray(i, i + blockSize));
    if (encoded.length) chunks.push(new Uint8Array(encoded));
  }
  const tail = encoder.flush();
  if (tail.length) chunks.push(new Uint8Array(tail));

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return new File(chunks as BlobPart[], `voice-${stamp}.mp3`, { type: "audio/mpeg" });
}

const maxMediaBytes = 64 * 1024 * 1024;
const maxMediaLabel = "64 MB";
const whatsappImageBytes = 5 * 1024 * 1024;
const whatsappVideoBytes = 16 * 1024 * 1024;
const whatsappAudioBytes = 16 * 1024 * 1024;
const whatsappAudioMimeTypes = new Set(["audio/aac", "audio/mp4", "audio/mpeg", "audio/amr", "audio/ogg"]);
const whatsappDocumentMimeTypes = new Set([
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
]);

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round((bytes / 1024) * 10) / 10} KB`;
  }
  return `${bytes} B`;
}

type Member = {
  id: number;
  name: string;
  phone: string;
  notes: string;
  city: string;
  joined: string;
  service: string;
  unreadCount: number;
  groupIds: number[];
  createdAt: string;
};

type Group = {
  id: number;
  name: string;
  memberCount: number;
  createdAt: string;
};

type Message = {
  id: number;
  memberId: number;
  direction: "incoming" | "outgoing";
  messageType: "text" | "image" | "video" | "document" | "audio";
  body: string;
  whatsappMessageId: string | null;
  status: "received" | "pending" | "accepted" | "sent" | "delivered" | "read" | "failed";
  error: string | null;
  mediaUrl: string | null;
  mediaMimeType: string | null;
  mediaFilename: string | null;
  createdAt: string;
};

type BulkResult = {
  memberId: number;
  name: string;
  phone: string;
  ok: boolean;
  error: string | null;
};

type ImportRow = { name: string; phone: string; notes: string; city?: string; joined?: string; service?: string };

type Template = {
  name: string;
  language: string;
  category: string;
  bodyText: string;
  headerText: string | null;
  paramCount: number;
  hasMediaHeader: boolean;
};

type TemplateSelection = {
  name: string;
  language: string;
  bodyParams: string[];
  preview: string;
};

type CampaignInfo = {
  id: number;
  label: string;
  groupName: string;
  mode: "template" | "text";
  dailyLimit: number;
  status: "active" | "paused" | "done";
  lastRunAt: string | null;
  progress: { total: number; delivered: number; remaining: number; daysLeft: number };
};

type ModalKind = "addMember" | "import" | "groups" | "bulk" | "template" | "campaigns" | null;

/** Value the picker writes to mean "fill in this contact's first name at send time". */
const NAME_TOKEN = "{{name}}";

/** Contacts are stored full-name; greetings read better with the first name only. */
function firstName(name: string) {
  const trimmed = (name ?? "").trim();
  return trimmed ? trimmed.split(/\s+/)[0] : "";
}

/** Resolves the name token for display — the message log should read as it was sent. */
function withContactName(text: string, name: string) {
  if (!text.includes(NAME_TOKEN)) return text;
  return text.split(NAME_TOKEN).join(firstName(name) || "الاسم");
}

function renderTemplatePreview(template: Template, params: string[]) {
  let text = template.bodyText;
  for (let index = 1; index <= template.paramCount; index += 1) {
    const value = params[index - 1]?.trim();
    text = text.split(`{{${index}}}`).join(value || `{{${index}}}`);
  }
  return (template.headerText ? `${template.headerText}\n` : "") + text;
}

const avatarPalette = ["#0f5c44", "#7c5c2e", "#2e5a7c", "#6b4d7c", "#7c3e3e", "#3e6b52", "#8a6a2f", "#42636f"];

function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return avatarPalette[hash % avatarPalette.length];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => [...part][0] ?? "").join("").toUpperCase() || "?";
}

function isVideoMessage(message: Message) {
  return message.messageType === "video" || Boolean(message.mediaMimeType?.startsWith("video/"));
}

function validateSelectedFile(file: File) {
  if (file.size > maxMediaBytes) {
    return `This file is ${formatFileSize(file.size)}. The maximum supported size is ${maxMediaLabel}.`;
  }
  if (file.type === "video/quicktime") {
    return "MOV is not supported by WhatsApp. Convert it to MP4 and keep it under 16 MB.";
  }
  if (file.type === "video/mp4" || file.type === "video/3gpp") {
    if (file.size > whatsappVideoBytes) {
      return `This video is ${formatFileSize(file.size)}. WhatsApp supports videos up to 16 MB.`;
    }
    return "";
  }
  if (file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp") {
    if (file.size > whatsappImageBytes) {
      return `This image is ${formatFileSize(file.size)}. WhatsApp supports images up to 5 MB.`;
    }
    return "";
  }
  if (file.type.startsWith("audio/")) {
    const baseType = file.type.split(";")[0].trim();
    if (!whatsappAudioMimeTypes.has(baseType)) {
      return "This audio format is not supported by WhatsApp. Use MP3, M4A/AAC, OGG, or AMR.";
    }
    if (file.size > whatsappAudioBytes) {
      return `This audio file is ${formatFileSize(file.size)}. WhatsApp supports audio up to 16 MB.`;
    }
    return "";
  }
  if (whatsappDocumentMimeTypes.has(file.type)) {
    return "";
  }
  return "This file type is not supported by WhatsApp.";
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dayLabel(date: Date) {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, now)) {
    return "Today";
  }
  if (sameDay(date, yesterday)) {
    return "Yesterday";
  }
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function parseCsv(raw: string): ImportRow[] {
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) {
    return [];
  }

  const splitLine = (line: string) => {
    const delimiter = line.includes("\t") ? "\t" : line.includes(";") ? ";" : ",";
    return line.split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, ""));
  };

  const header = splitLine(lines[0]).map((cell) => cell.toLowerCase());
  const isHeaderRow = header.some((cell) => /phone|name|اسم|رقم/.test(cell));

  let rows: ImportRow[] = [];

  if (isHeaderRow && header.some((cell) => cell.includes("phone"))) {
    // Header-mapped format, e.g. Phone Number, First Name, Last Name, City, CT, Service
    const col = (matcher: (cell: string) => boolean) => header.findIndex(matcher);
    const phoneIdx = col((cell) => cell.includes("phone") || cell.includes("رقم"));
    const firstIdx = col((cell) => cell.includes("first") || cell === "name" || cell.includes("الاسم الاول"));
    const lastIdx = col((cell) => cell.includes("last") || cell.includes("الاسم الاخير"));
    const cityIdx = col((cell) => cell.includes("city") || cell.includes("مدينة"));
    const joinedIdx = col((cell) => cell === "ct" || cell.includes("join") || cell.includes("تاريخ"));
    const serviceIdx = col((cell) => cell.includes("service") || cell.includes("خدمة"));
    const notesIdx = col((cell) => cell.includes("note") || cell.includes("ملاحظ"));

    rows = lines.slice(1).map((line) => {
      const cells = splitLine(line);
      const first = firstIdx >= 0 ? cells[firstIdx] ?? "" : "";
      const last = lastIdx >= 0 ? cells[lastIdx] ?? "" : "";
      return {
        name: [first, last].filter(Boolean).join(" "),
        phone: phoneIdx >= 0 ? cells[phoneIdx] ?? "" : "",
        notes: notesIdx >= 0 ? cells[notesIdx] ?? "" : "",
        city: cityIdx >= 0 ? cells[cityIdx] ?? "" : "",
        joined: joinedIdx >= 0 ? cells[joinedIdx] ?? "" : "",
        service: serviceIdx >= 0 ? cells[serviceIdx] ?? "" : ""
      };
    });
  } else {
    // Simple positional format: Name, Phone, Notes (or phone-only lines)
    rows = lines.map((line) => {
      const cells = splitLine(line);
      return { name: cells[0] ?? "", phone: cells[1] ?? "", notes: cells[2] ?? "" };
    });
    if (rows.length && /name|phone|اسم|رقم/i.test(`${rows[0].name} ${rows[0].phone}`)) {
      rows.shift();
    }
    rows = rows.map((row) => {
      if (!row.phone && /^[+\d][\d\s()-]{6,}$/.test(row.name)) {
        return { ...row, name: "", phone: row.name };
      }
      return row;
    });
  }

  // De-duplicate inside the file by phone digits.
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = row.phone.replace(/[^\d]/g, "").replace(/^0+/, "").replace(/^97[02]/, "");
    if (!key) {
      return Boolean(row.name);
    }
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/* ---------- icons ---------- */

function Icon({ path, size = 18 }: { path: string; size?: number }) {
  return (
    <svg
      aria-hidden
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width={size}
    >
      <path d={path} />
    </svg>
  );
}

const icons = {
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35",
  plus: "M12 5v14M5 12h14",
  upload: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",
  megaphone: "m3 11 18-5v12L3 13v-2ZM11.6 16.8a3 3 0 1 1-5.8-1.6",
  users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  paperclip: "m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48",
  send: "m22 2-7 20-4-9-9-4Zm0 0L11 13",
  zap: "M13 2 3 14h9l-1 8 10-12h-9l1-8Z",
  x: "M18 6 6 18M6 6l12 12",
  back: "m15 18-6-6 6-6",
  tag: "M12 2H2v10l9.29 9.29a1 1 0 0 0 1.42 0l8.58-8.58a1 1 0 0 0 0-1.42L12 2ZM7 7h.01",
  calendar: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z",
  play: "m6 3 14 9-14 9V3Z",
  pause: "M6 4h4v16H6zM14 4h4v16h-4z",
  trash: "M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6",
  check: "M20 6 9 17l-5-5",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-16v6l4 2",
  alert: "M12 8v4m0 4h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z",
  mic: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3ZM19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8"
};

function StatusTicks({ status }: { status: Message["status"] }) {
  if (status === "pending") {
    return <span className="ticks" title="Sending"><Icon path={icons.clock} size={13} /></span>;
  }
  if (status === "failed") {
    return <span className="ticks failed" title="Failed"><Icon path={icons.alert} size={13} /></span>;
  }
  if (status === "accepted" || status === "sent") {
    return <span className="ticks" title={status === "sent" ? "Sent" : "Accepted"}>✓</span>;
  }
  if (status === "delivered") {
    return <span className="ticks" title="Delivered">✓✓</span>;
  }
  if (status === "read") {
    return <span className="ticks read" title="Read">✓✓</span>;
  }
  return null;
}

/* ---------- page ---------- */

export default function Home() {
  const [members, setMembers] = useState<Member[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [search, setSearch] = useState("");
  const [activeGroupId, setActiveGroupId] = useState<number | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  const [notice, setNotice] = useState("");
  const [mobileChatOpen, setMobileChatOpen] = useState(false);

  const [messageText, setMessageText] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaError, setMediaError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isSendingTemplate, setIsSendingTemplate] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const recordCancelledRef = useRef(false);
  const recordMemberIdRef = useRef<number | null>(null);

  const mediaPreviewUrl = useMemo(
    () => (mediaFile && mediaFile.type.startsWith("audio/") ? URL.createObjectURL(mediaFile) : null),
    [mediaFile]
  );

  useEffect(() => {
    return () => {
      if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
    };
  }, [mediaPreviewUrl]);

  const selectedMember = useMemo(
    () => members.find((member) => member.id === selectedMemberId) ?? null,
    [members, selectedMemberId]
  );

  const filteredMembers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return members.filter((member) => {
      if (activeGroupId && !member.groupIds.includes(activeGroupId)) {
        return false;
      }
      if (!query) {
        return true;
      }
      return member.name.toLowerCase().includes(query) || member.phone.includes(query);
    });
  }, [members, search, activeGroupId]);

  async function loadMembers() {
    const response = await fetch("/api/members");
    if (!response.ok) return;
    const payload = (await response.json()) as { members: Member[] };
    setMembers(payload.members);
  }

  async function loadGroups() {
    const response = await fetch("/api/groups");
    if (!response.ok) return;
    const payload = (await response.json()) as { groups: Group[] };
    setGroups(payload.groups);
  }

  async function loadMessages(memberId: number, markRead = true) {
    const response = await fetch(`/api/members/${memberId}/messages`);
    if (!response.ok) {
      setMessages([]);
      return;
    }
    const payload = (await response.json()) as { messages: Message[] };
    setMessages(payload.messages);

    if (markRead) {
      const readResponse = await fetch(`/api/members/${memberId}/read`, { method: "POST" });
      if (readResponse.ok) {
        setMembers((current) =>
          current.map((member) => (member.id === memberId ? { ...member, unreadCount: 0 } : member))
        );
      }
    }
  }

  useEffect(() => {
    void loadMembers();
    void loadGroups();
    // Members refresh independently of the open chat so unread badges appear
    // even when nothing is selected.
    const interval = window.setInterval(() => void loadMembers(), 4000);
    return () => window.clearInterval(interval);
  }, []);

  const totalUnread = useMemo(
    () => members.reduce((sum, member) => sum + member.unreadCount, 0),
    [members]
  );

  useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread}) Afkar WhatsApp` : "Afkar WhatsApp";
  }, [totalUnread]);

  useEffect(() => {
    void setupNativePush((memberId) => {
      setSelectedMemberId(memberId);
      setMobileChatOpen(true);
    });
  }, []);

  useEffect(() => {
    if (!selectedMemberId) {
      setMessages([]);
      return;
    }
    void loadMessages(selectedMemberId);
    const interval = window.setInterval(() => {
      void loadMessages(selectedMemberId);
    }, 3000);
    return () => window.clearInterval(interval);
  }, [selectedMemberId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, selectedMemberId]);

  function flash(text: string) {
    setNotice(text);
    window.setTimeout(() => setNotice(""), 6000);
  }

  function openMember(memberId: number) {
    setSelectedMemberId(memberId);
    setMobileChatOpen(true);
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedMemberId || !messageText.trim() || mediaFile) {
      return;
    }
    setIsSending(true);
    const response = await fetch("/api/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: selectedMemberId, text: messageText })
    });
    const payload = await response.json();
    if (!response.ok) {
      flash(payload.error ?? "Message failed to send.");
    } else {
      setMessageText("");
    }
    await loadMessages(selectedMemberId);
    setIsSending(false);
  }

  async function sendTemplate(selection: TemplateSelection | null) {
    if (!selectedMemberId) return;
    setIsSendingTemplate(true);
    setModal(null);
    const response = await fetch("/api/messages/send-template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memberId: selectedMemberId,
        templateName: selection?.name,
        templateLanguage: selection?.language,
        bodyParams: selection?.bodyParams ?? [],
        bodyPreview: selection?.preview
      })
    });
    const payload = await response.json();
    if (!response.ok) {
      flash(payload.error ?? "Template send failed.");
    }
    await loadMessages(selectedMemberId);
    setIsSendingTemplate(false);
  }

  async function sendMediaFile(file: File, memberId: number, caption: string) {
    setIsSending(true);
    const mimeType = file.type.split(";")[0].trim() || "application/octet-stream";
    const params = new URLSearchParams({
      memberId: String(memberId),
      caption,
      filename: file.name,
      mimeType
    });
    const response = await fetch(`/api/messages/send-media?${params.toString()}`, {
      method: "POST",
      headers: { "Content-Type": mimeType },
      body: file
    });
    const payload = await response.json();
    const ok = response.ok;
    if (!ok) {
      flash(payload.error ?? "Media send failed.");
    }
    await loadMessages(memberId);
    setIsSending(false);
    return ok;
  }

  async function sendMedia() {
    if (!selectedMemberId || !mediaFile || mediaError) return;
    const ok = await sendMediaFile(mediaFile, selectedMemberId, messageText);
    if (ok) {
      setMessageText("");
      setMediaFile(null);
      setMediaError("");
    }
  }

  function selectMediaFile(file: File | null) {
    setMediaError(file ? validateSelectedFile(file) : "");
    setMediaFile(file);
  }

  function recordingFormat() {
    if (typeof MediaRecorder === "undefined") return null;
    // Any container works — the recording is transcoded to MP3 before sending.
    for (const mime of ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"]) {
      if (MediaRecorder.isTypeSupported(mime)) {
        return { recorderMime: mime };
      }
    }
    return { recorderMime: undefined };
  }

  async function startRecording() {
    const format = recordingFormat();
    if (!format) {
      flash("Voice recording is not supported in this browser — attach an audio file instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(
        stream,
        format.recorderMime ? { mimeType: format.recorderMime } : undefined
      );
      recordChunksRef.current = [];
      recordCancelledRef.current = false;
      recorder.ondataavailable = (event) => {
        if (event.data.size) recordChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setIsRecording(false);
        if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
        if (recordCancelledRef.current) return;
        const blob = new Blob(recordChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const memberId = recordMemberIdRef.current;
        if (!memberId) return;
        // Voice notes transcode to MP3 and send immediately on ✓ — like WhatsApp.
        void (async () => {
          try {
            const file = await transcodeToMp3(blob);
            const validationError = validateSelectedFile(file);
            if (validationError) {
              flash(validationError);
              return;
            }
            await sendMediaFile(file, memberId, "");
          } catch {
            flash("Could not process the recording — try again.");
          }
        })();
      };
      recorderRef.current = recorder;
      recordMemberIdRef.current = selectedMemberId;
      recorder.start();
      setRecordSeconds(0);
      setIsRecording(true);
      recordTimerRef.current = window.setInterval(() => setRecordSeconds((seconds) => seconds + 1), 1000);
    } catch {
      flash("Microphone access was blocked — allow it in the browser and try again.");
    }
  }

  function stopRecording(cancel: boolean) {
    recordCancelledRef.current = cancel;
    recorderRef.current?.stop();
  }

  async function toggleMemberGroup(member: Member, groupId: number) {
    const inGroup = member.groupIds.includes(groupId);
    await fetch(`/api/groups/${groupId}/members`, {
      method: inGroup ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(inGroup ? { memberId: member.id } : { memberIds: [member.id] })
    });
    await Promise.all([loadMembers(), loadGroups()]);
  }

  function renderMessageContent(message: Message) {
    if (message.messageType === "image" && message.mediaUrl) {
      return (
        <>
          <img alt={message.mediaFilename ?? message.body} className="mediaPreview" src={message.mediaUrl} />
          {message.body ? <p dir="auto">{message.body}</p> : null}
        </>
      );
    }
    if (isVideoMessage(message) && message.mediaUrl) {
      return (
        <>
          <video className="mediaPreview" controls playsInline preload="metadata" src={message.mediaUrl} />
          {message.body ? <p dir="auto">{message.body}</p> : null}
        </>
      );
    }
    if (message.messageType === "audio" && message.mediaUrl) {
      return (
        <>
          <span className="audioLabel">
            <Icon path={icons.mic} size={13} /> {message.body || "Voice message"}
          </span>
          <audio className="audioPlayer" controls preload="metadata" src={message.mediaUrl} />
        </>
      );
    }
    if (message.messageType === "document" && message.mediaUrl) {
      return (
        <>
          <a className="documentLink" href={message.mediaUrl} rel="noreferrer" target="_blank">
            <Icon path={icons.paperclip} size={14} />
            {message.mediaFilename || message.body || "Open file"}
          </a>
          {message.body && message.body !== message.mediaFilename ? <p dir="auto">{message.body}</p> : null}
        </>
      );
    }
    return <p dir="auto">{withContactName(message.body, selectedMember?.name ?? "")}</p>;
  }

  let lastDate: Date | null = null;

  return (
    <main className={mobileChatOpen ? "shell chatOpen" : "shell"}>
      <aside className="sidebar">
        <header className="sidebarTop">
          <div className="brand">
            <img alt="Afkar" className="brandMark" src="/afkar-logo.png" />
            <div>
              <h1>Afkar</h1>
              <p>Eat · Love · Fit</p>
            </div>
          </div>
          <button className="iconButton" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; }} title="Logout" type="button">
            <Icon path={icons.logout} />
          </button>
        </header>

        <div className="searchBox">
          <Icon path={icons.search} size={16} />
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name or number"
            value={search}
          />
        </div>

        <div className="groupChips">
          <button
            className={activeGroupId === null ? "chip active" : "chip"}
            onClick={() => setActiveGroupId(null)}
            type="button"
          >
            All <em>{members.length}</em>
          </button>
          {groups.map((group) => (
            <button
              className={activeGroupId === group.id ? "chip active" : "chip"}
              key={group.id}
              onClick={() => setActiveGroupId(activeGroupId === group.id ? null : group.id)}
              type="button"
            >
              {group.name} <em>{group.memberCount}</em>
            </button>
          ))}
          <button className="chip ghost" onClick={() => setModal("groups")} title="Manage groups" type="button">
            <Icon path={icons.tag} size={13} /> Groups
          </button>
        </div>

        <div className="sidebarActions">
          <button onClick={() => setModal("addMember")} type="button">
            <Icon path={icons.plus} size={15} /> Add
          </button>
          <button onClick={() => setModal("import")} type="button">
            <Icon path={icons.upload} size={15} /> Import
          </button>
          <button onClick={() => setModal("bulk")} type="button">
            <Icon path={icons.megaphone} size={15} /> Bulk send
          </button>
          <button onClick={() => setModal("campaigns")} type="button">
            <Icon path={icons.calendar} size={15} /> Campaigns
          </button>
        </div>

        <section className="memberList" aria-label="Members">
          {filteredMembers.map((member) => (
            <button
              className={member.id === selectedMemberId ? "member active" : "member"}
              key={member.id}
              onClick={() => openMember(member.id)}
              type="button"
            >
              <span className="avatar" style={{ background: avatarColor(member.name) }}>
                {initials(member.name)}
              </span>
              <span className="memberMeta">
                <strong dir="auto">{member.name}</strong>
                <span className="memberPhone">{member.phone}</span>
              </span>
              {member.unreadCount > 0 ? <span className="unreadBadge">{member.unreadCount}</span> : null}
            </button>
          ))}
          {!filteredMembers.length ? (
            <div className="sidebarEmpty">
              {members.length ? "No matches." : "No members yet — add or import."}
            </div>
          ) : null}
        </section>
      </aside>

      <section className="conversation">
        {selectedMember ? (
          <header className="conversationHeader">
            <button className="iconButton backButton" onClick={() => setMobileChatOpen(false)} type="button">
              <Icon path={icons.back} />
            </button>
            <span className="avatar large" style={{ background: avatarColor(selectedMember.name) }}>
              {initials(selectedMember.name)}
            </span>
            <div className="headerMeta">
              <h2 dir="auto">{selectedMember.name}</h2>
              <p>
                {[selectedMember.phone, selectedMember.city, selectedMember.service, selectedMember.joined]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <div className="headerGroups">
              {groups.map((group) => {
                const inGroup = selectedMember.groupIds.includes(group.id);
                return (
                  <button
                    className={inGroup ? "groupTag active" : "groupTag"}
                    key={group.id}
                    onClick={() => void toggleMemberGroup(selectedMember, group.id)}
                    title={inGroup ? `Remove from ${group.name}` : `Add to ${group.name}`}
                    type="button"
                  >
                    {group.name}
                  </button>
                );
              })}
            </div>
          </header>
        ) : null}

        {notice ? <div className="notice floating">{notice}</div> : null}

        <div className="messages">
          {selectedMember ? (
            messages.length ? (
              <>
                {messages.map((message) => {
                  const date = new Date(message.createdAt);
                  const showDay = !lastDate || !sameDay(lastDate, date);
                  lastDate = date;
                  return (
                    <div key={message.id}>
                      {showDay ? <div className="daySeparator"><span>{dayLabel(date)}</span></div> : null}
                      <article className={`bubble ${message.direction}`}>
                        {renderMessageContent(message)}
                        <footer>
                          <span>{timeLabel(message.createdAt)}</span>
                          {message.direction === "outgoing" ? <StatusTicks status={message.status} /> : null}
                        </footer>
                        {message.error ? <small className="bubbleError">{message.error}</small> : null}
                      </article>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </>
            ) : (
              <EmptyState label="No messages yet — say hello with a template." />
            )
          ) : (
            <EmptyState label="Select a member to open the conversation." />
          )}
        </div>

        <form className="composer" onSubmit={sendMessage}>
          {mediaFile ? (
            <div className="selectedFile">
              <span>
                {mediaFile.name} · {formatFileSize(mediaFile.size)}
                {mediaPreviewUrl && !mediaError ? (
                  <audio className="chipAudioPreview" controls preload="metadata" src={mediaPreviewUrl} />
                ) : null}
                {!mediaError && mediaFile.type.startsWith("audio/") ? (
                  <small className="softNote">Audio is delivered without a caption on WhatsApp.</small>
                ) : null}
                {mediaError ? <small>{mediaError}</small> : null}
              </span>
              <button className="iconButton" onClick={() => { setMediaFile(null); setMediaError(""); }} type="button">
                <Icon path={icons.x} size={14} />
              </button>
            </div>
          ) : null}
          {isRecording ? (
            <div className="recordingBar">
              <span className="recordDot" />
              <span className="recordTime">
                {Math.floor(recordSeconds / 60)}:{String(recordSeconds % 60).padStart(2, "0")}
              </span>
              <span className="recordHint">Recording voice message…</span>
              <button className="iconButton danger" onClick={() => stopRecording(true)} title="Cancel" type="button">
                <Icon path={icons.trash} size={16} />
              </button>
              <button className="sendButton" onClick={() => stopRecording(false)} title="Use recording" type="button">
                <Icon path={icons.check} size={17} />
              </button>
            </div>
          ) : null}
          <div className="composerRow">
            <label className="iconButton attach" title="Attach file">
              <Icon path={icons.paperclip} />
              <input
                disabled={!selectedMember}
                onChange={(event) => {
                  selectMediaFile(event.target.files?.[0] ?? null);
                  event.target.value = "";
                }}
                type="file"
              />
            </label>
            <textarea
              dir="auto"
              disabled={!selectedMember}
              onChange={(event) => setMessageText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (mediaFile) {
                    void sendMedia();
                  } else {
                    event.currentTarget.form?.requestSubmit();
                  }
                }
              }}
              placeholder={mediaFile ? "Add a caption…" : selectedMember ? "Write a message…" : "Select a member first"}
              rows={1}
              value={messageText}
            />
            <button
              className="iconButton templateButton"
              disabled={!selectedMember || isSendingTemplate}
              onClick={() => setModal("template")}
              title="Send a template"
              type="button"
            >
              <Icon path={icons.zap} />
            </button>
            {!messageText.trim() && !mediaFile && !isRecording ? (
              <button
                className="iconButton micButton"
                disabled={!selectedMember}
                onClick={() => void startRecording()}
                title="Record a voice message"
                type="button"
              >
                <Icon path={icons.mic} />
              </button>
            ) : null}
            {mediaFile ? (
              <button
                className="sendButton"
                disabled={!selectedMember || isSending || Boolean(mediaError)}
                onClick={() => void sendMedia()}
                title="Send file"
                type="button"
              >
                <Icon path={icons.send} />
              </button>
            ) : (
              <button
                className="sendButton"
                disabled={!selectedMember || isSending || !messageText.trim()}
                title="Send"
                type="submit"
              >
                <Icon path={icons.send} />
              </button>
            )}
          </div>
        </form>
      </section>

      {modal === "addMember" ? (
        <AddMemberModal
          groups={groups}
          onClose={() => setModal(null)}
          onDone={async (memberId) => {
            await Promise.all([loadMembers(), loadGroups()]);
            setModal(null);
            if (memberId) openMember(memberId);
          }}
        />
      ) : null}
      {modal === "import" ? (
        <ImportModal
          groups={groups}
          onClose={() => setModal(null)}
          onDone={async () => {
            await Promise.all([loadMembers(), loadGroups()]);
          }}
        />
      ) : null}
      {modal === "groups" ? (
        <GroupsModal
          groups={groups}
          onChanged={async () => {
            await Promise.all([loadGroups(), loadMembers()]);
          }}
          onClose={() => setModal(null)}
        />
      ) : null}
      {modal === "bulk" ? (
        <BulkModal
          groups={groups}
          onClose={() => setModal(null)}
          onDone={async () => {
            await loadMembers();
          }}
        />
      ) : null}
      {modal === "campaigns" ? <CampaignsModal onClose={() => setModal(null)} /> : null}
      {modal === "template" && selectedMember ? (
        <TemplatePickerModal
          memberName={selectedMember.name}
          onClose={() => setModal(null)}
          onSend={(selection) => void sendTemplate(selection)}
        />
      ) : null}
    </main>
  );
}

/* ---------- shared modal chrome ---------- */

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className={wide ? "modal wide" : "modal"} role="dialog">
        <header className="modalHeader">
          <h3>{title}</h3>
          <button className="iconButton" onClick={onClose} type="button">
            <Icon path={icons.x} size={16} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="empty">
      <svg aria-hidden fill="none" height="90" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" viewBox="0 0 120 90" width="120">
        <path d="M8 66c18-26 34-34 52-26s28 4 36-6" />
        <circle cx="42" cy="38" r="9" />
        <path d="M8 78h104" strokeDasharray="2 6" />
      </svg>
      <p>{label}</p>
    </div>
  );
}

/* ---------- add member ---------- */

function AddMemberModal({ groups, onClose, onDone }: { groups: Group[]; onClose: () => void; onDone: (memberId: number | null) => Promise<void> }) {
  const [form, setForm] = useState({ name: "", phone: "", notes: "" });
  const [groupId, setGroupId] = useState<number | "">("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch("/api/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Could not add member.");
      setBusy(false);
      return;
    }
    if (groupId) {
      await fetch(`/api/groups/${groupId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberIds: [payload.member.id] })
      });
    }
    await onDone(payload.member.id);
  }

  return (
    <Modal onClose={onClose} title="Add member">
      <form className="modalBody" onSubmit={submit}>
        <label>
          Name
          <input autoFocus onChange={(event) => setForm({ ...form, name: event.target.value })} value={form.name} />
        </label>
        <label>
          WhatsApp number
          <input onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="+972501234567" value={form.phone} />
        </label>
        <label>
          Notes
          <textarea onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={2} value={form.notes} />
        </label>
        {groups.length ? (
          <label>
            Add to group
            <select onChange={(event) => setGroupId(event.target.value ? Number(event.target.value) : "")} value={groupId}>
              <option value="">No group</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>{group.name}</option>
              ))}
            </select>
          </label>
        ) : null}
        {error ? <div className="notice">{error}</div> : null}
        <div className="modalActions">
          <button className="secondary" onClick={onClose} type="button">Cancel</button>
          <button disabled={busy || !form.name.trim() || !form.phone.trim()} type="submit">
            {busy ? "Adding…" : "Add member"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ---------- import ---------- */

function ImportModal({ groups, onClose, onDone }: { groups: Group[]; onClose: () => void; onDone: () => Promise<void> }) {
  const [raw, setRaw] = useState("");
  const [groupId, setGroupId] = useState<number | "">("");
  const [newGroupName, setNewGroupName] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ created: number; existing: number; failed: Array<{ row: ImportRow; error: string }> } | null>(null);

  const rows = useMemo(() => parseCsv(raw), [raw]);

  async function readFile(file: File | null) {
    if (!file) return;
    setRaw(await file.text());
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      let targetGroupId = groupId === "" ? null : groupId;
      if (newGroupName.trim()) {
        const groupResponse = await fetch("/api/groups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newGroupName })
        });
        const groupPayload = await groupResponse.json();
        if (!groupResponse.ok) {
          throw new Error(groupPayload.error ?? "Could not create group.");
        }
        targetGroupId = groupPayload.group.id;
      }

      // Large files are imported in batches so thousands of rows work reliably.
      const batchSize = 400;
      const totals = { created: 0, existing: 0, failed: [] as Array<{ row: ImportRow; error: string }> };
      for (let start = 0; start < rows.length; start += batchSize) {
        const batch = rows.slice(start, start + batchSize);
        setProgress(`Importing ${Math.min(start + batch.length, rows.length)} / ${rows.length}…`);
        const response = await fetch("/api/members/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: batch, groupId: targetGroupId })
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error ?? "Import failed.");
        }
        totals.created += payload.created;
        totals.existing += payload.existing;
        totals.failed.push(...payload.failed);
      }
      setResult(totals);
      await onDone();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Import failed.");
    }
    setProgress("");
    setBusy(false);
  }

  return (
    <Modal onClose={onClose} title="Import members" wide>
      <div className="modalBody">
        {result ? (
          <>
            <div className="importSummary">
              <div><strong>{result.created}</strong><span>added</span></div>
              <div><strong>{result.existing}</strong><span>already existed</span></div>
              <div className={result.failed.length ? "bad" : ""}><strong>{result.failed.length}</strong><span>failed</span></div>
            </div>
            {result.failed.length ? (
              <div className="importErrors">
                {result.failed.slice(0, 8).map((failure, index) => (
                  <p key={index}><strong>{failure.row.phone || failure.row.name}</strong> — {failure.error}</p>
                ))}
              </div>
            ) : null}
            <div className="modalActions">
              <button onClick={onClose} type="button">Done</button>
            </div>
          </>
        ) : (
          <>
            <p className="hint">
              Paste rows or upload a CSV file. Columns: <strong>Name, Phone, Notes</strong> (phone-only lines work too).
            </p>
            <label className="fileDrop">
              <Icon path={icons.upload} size={16} /> Choose CSV / TXT file
              <input accept=".csv,.txt,.tsv" onChange={(event) => void readFile(event.target.files?.[0] ?? null)} type="file" />
            </label>
            <textarea
              dir="auto"
              onChange={(event) => setRaw(event.target.value)}
              placeholder={"Maria,+972521234567,Extra track\nAhmad,+972541234567"}
              rows={6}
              value={raw}
            />
            {rows.length ? (
              <div className="importPreview">
                <p className="hint"><strong>{rows.length}</strong> rows detected — preview:</p>
                <table>
                  <tbody>
                    {rows.slice(0, 5).map((row, index) => (
                      <tr key={index}>
                        <td dir="auto">{row.name || "—"}</td>
                        <td>{row.phone || "—"}</td>
                        <td dir="auto">{row.notes || ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <div className="importGroupRow">
              <label>
                Add everyone to group
                <select
                  disabled={Boolean(newGroupName.trim())}
                  onChange={(event) => setGroupId(event.target.value ? Number(event.target.value) : "")}
                  value={groupId}
                >
                  <option value="">No group</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>{group.name}</option>
                  ))}
                </select>
              </label>
              <label>
                …or create new group
                <input
                  onChange={(event) => setNewGroupName(event.target.value)}
                  placeholder="e.g. مسار اكسترا"
                  value={newGroupName}
                />
              </label>
            </div>
            {error ? <div className="notice">{error}</div> : null}
            <div className="modalActions">
              <button className="secondary" onClick={onClose} type="button">Cancel</button>
              <button disabled={busy || !rows.length} onClick={() => void submit()} type="button">
                {busy ? progress || "Importing…" : `Import ${rows.length} members`}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/* ---------- groups ---------- */

function GroupsModal({ groups, onChanged, onClose }: { groups: Group[]; onChanged: () => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "Could not create group.");
      return;
    }
    setName("");
    await onChanged();
  }

  async function rename(groupId: number) {
    const response = await fetch(`/api/groups/${groupId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editingName })
    });
    if (response.ok) {
      setEditingId(null);
      await onChanged();
    }
  }

  async function remove(group: Group) {
    if (!window.confirm(`Delete group "${group.name}"? Members are kept — only the group is removed.`)) {
      return;
    }
    await fetch(`/api/groups/${group.id}`, { method: "DELETE" });
    await onChanged();
  }

  return (
    <Modal onClose={onClose} title="Groups">
      <div className="modalBody">
        <form className="groupCreateRow" onSubmit={create}>
          <input
            dir="auto"
            onChange={(event) => setName(event.target.value)}
            placeholder="New group, e.g. مسار اكسترا"
            value={name}
          />
          <button disabled={!name.trim()} type="submit"><Icon path={icons.plus} size={14} /> Create</button>
        </form>
        {error ? <div className="notice">{error}</div> : null}
        <div className="groupList">
          {groups.map((group) => (
            <div className="groupRow" key={group.id}>
              {editingId === group.id ? (
                <>
                  <input
                    autoFocus
                    dir="auto"
                    onChange={(event) => setEditingName(event.target.value)}
                    onKeyDown={(event) => { if (event.key === "Enter") void rename(group.id); }}
                    value={editingName}
                  />
                  <button className="secondary" onClick={() => setEditingId(null)} type="button">Cancel</button>
                  <button onClick={() => void rename(group.id)} type="button">Save</button>
                </>
              ) : (
                <>
                  <button
                    className="groupName"
                    onClick={() => { setEditingId(group.id); setEditingName(group.name); }}
                    title="Rename"
                    type="button"
                  >
                    <span dir="auto">{group.name}</span>
                    <em>{group.memberCount} members</em>
                  </button>
                  <button className="iconButton danger" onClick={() => void remove(group)} title="Delete group" type="button">
                    <Icon path={icons.trash} size={15} />
                  </button>
                </>
              )}
            </div>
          ))}
          {!groups.length ? <p className="hint">No groups yet — create one above, e.g. مسار اكسترا.</p> : null}
        </div>
      </div>
    </Modal>
  );
}

/* ---------- campaigns ---------- */

type CampaignRun = { id: number; sent: number; failed: number; remaining: number; ranAt: string };
type RecipientRow = { memberId: number; name: string; phone: string; error: string | null; sentAt: string | null };
type FailureReason = { kind: string; title: string; explanation: string; action: string | null };
type FailedRow = RecipientRow & {
  reason: FailureReason;
  alternate: string | null;
  alternateTaken: boolean;
};
type CampaignDetail = {
  runs: CampaignRun[];
  delivered: RecipientRow[];
  failed: FailedRow[];
  pending: RecipientRow[];
};

function CampaignDetailPanel({ campaignId }: { campaignId: number }) {
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [tab, setTab] = useState<"runs" | "failed" | "pending">("runs");
  const [openReason, setOpenReason] = useState<string | null>(null);
  const [fixing, setFixing] = useState<number | null>(null);
  const [fixNotes, setFixNotes] = useState<Record<number, string>>({});

  async function load() {
    const response = await fetch(`/api/campaigns/${campaignId}/detail`);
    if (response.ok) {
      setDetail(await response.json());
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const response = await fetch(`/api/campaigns/${campaignId}/detail`);
      if (!response.ok || cancelled) return;
      setDetail(await response.json());
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  // Moves one contact to the other country code, then refreshes the list.
  async function switchCountryCode(row: FailedRow) {
    if (!row.alternate) return;
    setFixing(row.memberId);
    const response = await fetch("/api/members/phone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: row.memberId, phone: row.alternate })
    });
    const payload = await response.json().catch(() => ({}));
    setFixNotes((notes) => ({
      ...notes,
      [row.memberId]: response.ok ? `Now ${payload.phone}` : payload.error ?? "Could not change it."
    }));
    setFixing(null);
    if (response.ok) {
      await load();
    }
  }

  if (!detail) return <p className="hint">Loading batches…</p>;

  const rows = tab === "pending" ? detail.pending : [];

  // Failures are grouped by reason so 27 identical-looking lines become a
  // handful of problems, each with its own explanation.
  const failureGroups = Object.values(
    detail.failed.reduce<Record<string, { reason: FailureReason; rows: FailedRow[] }>>((groups, row) => {
      const key = row.reason?.kind ?? "other";
      groups[key] = groups[key] ?? { reason: row.reason, rows: [] };
      groups[key].rows.push(row);
      return groups;
    }, {})
  ).sort((a, b) => b.rows.length - a.rows.length);

  return (
    <div className="campaignDetail">
      <div className="detailTabs">
        <button className={tab === "runs" ? "active" : ""} onClick={() => setTab("runs")} type="button">
          Batches <em>{detail.runs.length}</em>
        </button>
        <button className={tab === "failed" ? "active" : ""} onClick={() => setTab("failed")} type="button">
          Failed <em>{detail.failed.length}</em>
        </button>
        <button className={tab === "pending" ? "active" : ""} onClick={() => setTab("pending")} type="button">
          Not sent yet <em>{detail.pending.length}</em>
        </button>
      </div>

      {tab === "runs" ? (
        detail.runs.length ? (
          <table className="runTable">
            <thead>
              <tr><th>#</th><th>Date</th><th>Sent</th><th>Failed</th><th>Left after</th></tr>
            </thead>
            <tbody>
              {detail.runs.map((run, index) => (
                <tr key={run.id}>
                  <td>{detail.runs.length - index}</td>
                  <td>{new Date(run.ranAt).toLocaleString()}</td>
                  <td><strong>{run.sent}</strong></td>
                  <td className={run.failed ? "bad" : ""}>{run.failed}</td>
                  <td>{run.remaining}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="hint">No batch has run yet.</p>
        )
      ) : tab === "failed" ? (
        failureGroups.length ? (
          <div className="failureGroups">
            {failureGroups.map(({ reason, rows: groupRows }) => (
              <div className="failureGroup" key={reason.kind}>
                <div className="failureHeading">
                  <strong>{reason.title}</strong>
                  <span className="failureCount">{groupRows.length}</span>
                  <button
                    aria-label={`What does "${reason.title}" mean?`}
                    className="infoButton"
                    onClick={() => setOpenReason(openReason === reason.kind ? null : reason.kind)}
                    type="button"
                  >
                    i
                  </button>
                </div>
                {openReason === reason.kind ? (
                  <div className="failureExplain">
                    <p>{reason.explanation}</p>
                    {reason.action ? <p className="failureAction">{reason.action}</p> : null}
                  </div>
                ) : null}
                <div className="recipientList">
                  {groupRows.map((row) => (
                    <div className="recipientRow" key={row.memberId}>
                      <span dir="auto">{row.name}</span>
                      <span className="bulkPhone">{row.phone}</span>
                      {row.alternate ? (
                        row.alternateTaken ? (
                          <span className="recipientHint">
                            {row.alternate} already belongs to another contact — likely a duplicate.
                          </span>
                        ) : fixNotes[row.memberId] ? (
                          <span className="recipientHint">{fixNotes[row.memberId]}</span>
                        ) : (
                          <button
                            className="linkButton"
                            disabled={fixing === row.memberId}
                            onClick={() => void switchCountryCode(row)}
                            type="button"
                          >
                            {fixing === row.memberId ? "Changing…" : `Try ${row.alternate} instead`}
                          </button>
                        )
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="hint">No failures.</p>
        )
      ) : rows.length ? (
        <div className="recipientList">
          {rows.map((row) => (
            <div className="recipientRow" key={row.memberId}>
              <span dir="auto">{row.name}</span>
              <span className="bulkPhone">{row.phone}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="hint">Everyone has received it.</p>
      )}
    </div>
  );
}

function CampaignsModal({ onClose }: { onClose: () => void }) {
  const [campaigns, setCampaigns] = useState<CampaignInfo[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState("");

  async function load() {
    const response = await fetch("/api/campaigns");
    if (response.ok) {
      const payload = await response.json();
      setCampaigns(payload.campaigns);
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(interval);
  }, []);

  async function action(campaignId: number, act: "pause" | "resume" | "run-now") {
    await fetch(`/api/campaigns/${campaignId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: act })
    });
    await load();
  }

  // Sends made before manual bulk sends were logged can be rebuilt from the messages.
  async function importPastSends() {
    setImporting(true);
    setImportNote("");
    const response = await fetch("/api/campaigns/backfill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setImportNote(payload.error ?? `Import failed (${response.status}).`);
      setImporting(false);
      return;
    }
    const count = payload.created?.length ?? 0;
    const scanned: Array<{ group: string; sends: number; alreadyLogged: number }> = payload.scanned ?? [];
    const seen = scanned.reduce((total, entry) => total + entry.sends, 0);
    setImportNote(
      count
        ? `Added ${count} past send${count === 1 ? "" : "s"}.`
        : seen
          ? `Found ${seen} past send${seen === 1 ? "" : "s"} — all already listed here.`
          : "No past group sends found in the message history."
    );
    setImporting(false);
    await load();
  }

  const statusLabel: Record<CampaignInfo["status"], string> = {
    active: "Active",
    paused: "Paused",
    done: "Completed"
  };

  return (
    <Modal onClose={onClose} title="Campaigns" wide>
      <div className="modalBody">
        <div className="campaignToolbar">
          <button className="secondary" disabled={importing} onClick={() => void importPastSends()} type="button">
            {importing ? "Importing…" : "Import past sends"}
          </button>
          {importNote ? <span className="hint">{importNote}</span> : null}
        </div>
        {loading ? <p className="hint">Loading…</p> : null}
        {!loading && !campaigns.length ? (
          <p className="hint">
            No campaigns yet. Start one from <strong>Bulk send</strong> → &quot;Auto-campaign&quot; — batches go out
            daily on their own and you get a Telegram report after each one.
          </p>
        ) : null}
        {campaigns.map((campaign) => {
          const percent = campaign.progress.total
            ? Math.round((campaign.progress.delivered / campaign.progress.total) * 100)
            : 0;
          return (
            <div className="campaignRow" key={campaign.id}>
              <div className="campaignHead">
                <strong dir="auto">{withContactName(campaign.label, "")}</strong>
                <span className={`campaignStatus ${campaign.status}`}>{statusLabel[campaign.status]}</span>
              </div>
              <div className="progressTrack">
                <div className="progressFill" style={{ width: `${percent}%` }} />
              </div>
              <div className="campaignMeta">
                <span>
                  {campaign.progress.delivered} / {campaign.progress.total} delivered
                  {campaign.progress.remaining > 0
                    ? ` · ${campaign.progress.remaining} left (~${campaign.progress.daysLeft}d)`
                    : ""}
                </span>
                <span>
                  {campaign.dailyLimit}/day
                  {campaign.lastRunAt ? ` · last batch ${new Date(campaign.lastRunAt).toLocaleString()}` : ""}
                </span>
              </div>
              <div className="campaignActions">
                <button
                  className="secondary"
                  onClick={() => setOpenId(openId === campaign.id ? null : campaign.id)}
                  type="button"
                >
                  {openId === campaign.id ? "Hide batches" : "Batches & who is missing"}
                </button>
              </div>

              {openId === campaign.id ? <CampaignDetailPanel campaignId={campaign.id} /> : null}

              {campaign.status !== "done" ? (
                <div className="campaignActions">
                  {campaign.status === "active" ? (
                    <>
                      <button className="secondary" onClick={() => void action(campaign.id, "pause")} type="button">
                        <Icon path={icons.pause} size={13} /> Pause
                      </button>
                      <button className="secondary" onClick={() => void action(campaign.id, "run-now")} type="button">
                        <Icon path={icons.play} size={13} /> Send next batch now
                      </button>
                    </>
                  ) : (
                    <button className="secondary" onClick={() => void action(campaign.id, "resume")} type="button">
                      <Icon path={icons.play} size={13} /> Resume
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

/* ---------- template selector ---------- */

function TemplateSelector({
  onChange,
  searchable
}: {
  onChange: (selection: TemplateSelection | null, state: { loading: boolean; error: string }) => void;
  searchable?: boolean;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedName, setSelectedName] = useState("");
  const [params, setParams] = useState<string[]>([]);
  const [query, setQuery] = useState("");

  const selected = templates.find((template) => template.name === selectedName) ?? null;

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return templates;
    return templates.filter((template) =>
      `${template.name} ${template.category} ${template.bodyText} ${template.headerText ?? ""}`
        .toLowerCase()
        .includes(term)
    );
  }, [templates, query]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/templates");
        const payload = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setError(payload.error ?? "Could not load templates.");
        } else {
          setTemplates(payload.templates);
          if (payload.templates.length === 1) {
            setSelectedName(payload.templates[0].name);
          }
        }
      } catch {
        if (!cancelled) setError("Could not load templates.");
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selected) {
      onChange(null, { loading, error });
      return;
    }
    // Every placeholder must have a value — an empty array passes .every(),
    // so the length has to be checked too.
    const values = params.slice(0, selected.paramCount);
    const filled =
      selected.paramCount === 0 ||
      (values.length === selected.paramCount && values.every((param) => Boolean(param?.trim())));
    onChange(
      filled
        ? {
            name: selected.name,
            language: selected.language,
            bodyParams: params.slice(0, selected.paramCount).map((param) => param.trim()),
            preview: renderTemplatePreview(selected, params)
          }
        : null,
      { loading, error }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedName, params, templates.length, loading, error]);

  if (loading) {
    return <p className="hint">Loading templates from WhatsApp…</p>;
  }

  if (error) {
    return <div className="notice">{error}</div>;
  }

  if (!templates.length) {
    return <p className="hint">No approved templates found on this WhatsApp account yet.</p>;
  }

  return (
    <>
      {searchable ? (
        <div className="searchBox templateSearch">
          <Icon path={icons.search} size={16} />
          <input
            dir="auto"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${templates.length} templates…`}
            value={query}
          />
        </div>
      ) : null}
      {!visible.length ? <p className="hint">No template matches “{query}”.</p> : null}
    <div className="templateList">
      {visible.map((template) => (
        <div key={`${template.name}-${template.language}`}>
          <button
            className={selectedName === template.name ? "templateOption active" : "templateOption"}
            onClick={() => {
              setSelectedName(template.name);
              setParams([]);
            }}
            type="button"
          >
            <span className="templateName">
              {template.name}
              <span className={`categoryTag ${template.category.toLowerCase()}`}>
                {template.category === "UTILITY" ? "Utility" : template.category === "MARKETING" ? "Marketing" : template.category}
              </span>
              <em>{template.language}</em>
            </span>
            <span className="templateBody" dir="auto">
              {template.headerText ? <strong>{template.headerText}<br /></strong> : null}
              {template.bodyText.length > 220 ? `${template.bodyText.slice(0, 220)}…` : template.bodyText}
            </span>
            {template.hasMediaHeader ? <span className="templateWarn">Has a media header — may need attachment in Meta.</span> : null}
          </button>
          {selectedName === template.name && template.paramCount > 0 ? (
            <div className="templateParams">
              {Array.from({ length: template.paramCount }, (_, index) => (
                <label key={index}>
                  <span className="paramLabel">
                    {"Value for {{"}{index + 1}{"}}"}
                    <button
                      className="linkButton"
                      onClick={() => {
                        const next = [...params];
                        next[index] = NAME_TOKEN;
                        setParams(next);
                      }}
                      type="button"
                    >
                      use contact name
                    </button>
                  </span>
                  <input
                    dir="auto"
                    onChange={(event) => {
                      const next = [...params];
                      next[index] = event.target.value;
                      setParams(next);
                    }}
                    value={params[index] ?? ""}
                  />
                  {params[index] === NAME_TOKEN ? (
                    <span className="paramHint">
                      Each contact gets their own first name here — filled in automatically when it is sent.
                    </span>
                  ) : null}
                </label>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
    </>
  );
}

function TemplatePickerModal({
  memberName,
  onClose,
  onSend
}: {
  memberName: string;
  onClose: () => void;
  onSend: (selection: TemplateSelection | null) => void;
}) {
  const [selection, setSelection] = useState<TemplateSelection | null>(null);
  const [state, setState] = useState({ loading: true, error: "" });

  return (
    <Modal onClose={onClose} title={`Send template to ${memberName}`} wide>
      <div className="modalBody">
        <TemplateSelector
          onChange={(nextSelection, nextState) => {
            setSelection(nextSelection);
            setState(nextState);
          }}
        />
        {selection ? (
          <div className="templatePreview" dir="auto">
            {withContactName(selection.preview, memberName)}
          </div>
        ) : null}
        <div className="modalActions">
          <button className="secondary" onClick={onClose} type="button">Cancel</button>
          {state.error ? (
            <button onClick={() => onSend(null)} type="button">
              Send default opening template
            </button>
          ) : (
            <button disabled={!selection || state.loading} onClick={() => selection && onSend(selection)} type="button">
              Send template
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ---------- bulk send ---------- */

function BulkModal({ groups, onClose, onDone }: { groups: Group[]; onClose: () => void; onDone: () => Promise<void> }) {
  const [groupId, setGroupId] = useState<number | "">("");
  const [mode, setMode] = useState<"template" | "text">("template");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<{
    sent: number;
    failed: number;
    skipped?: number;
    remaining?: number;
    results: BulkResult[];
  } | null>(null);
  const [templateSelection, setTemplateSelection] = useState<TemplateSelection | null>(null);
  const [templateState, setTemplateState] = useState({ loading: true, error: "" });
  const [skipAlreadySent, setSkipAlreadySent] = useState(true);
  const [maxRecipients, setMaxRecipients] = useState(250);
  const [metaLimit, setMetaLimit] = useState<{ dailyLimit: number; suggested: number; quality: string | null } | null>(null);
  const [autoCampaign, setAutoCampaign] = useState(false);
  const [campaignStarted, setCampaignStarted] = useState<{
    estimatedDays: number;
    total: number;
    scheduled?: boolean;
    startsAt?: string;
    repeatMode?: string;
  } | null>(null);
  const [step, setStep] = useState(1);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [repeatMode, setRepeatMode] = useState<"once" | "daily" | "weekly">("once");

  const selectedGroup = groups.find((group) => group.id === groupId) ?? null;

  // Each step gates the next: pick a group, compose a message, then confirm.
  const canContinue =
    step === 1
      ? Boolean(groupId)
      : mode === "text"
        ? Boolean(text.trim())
        : Boolean(templateSelection) || Boolean(templateState.error);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/limits");
        if (!response.ok) return;
        const payload = await response.json();
        if (!cancelled && payload.limit) {
          setMetaLimit(payload.limit);
          setMaxRecipients(payload.limit.suggested);
        }
      } catch {
        // keep static default
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const capLimit = metaLimit?.dailyLimit ?? 1000;

  // A schedule is only sent when the user picked a date on step 4.
  const scheduledFor = scheduleDate ? new Date(`${scheduleDate}T${scheduleTime || "09:00"}`) : null;
  const todayIso = new Date().toISOString().slice(0, 10);
  // Recurrence only matters when the group cannot fit in a single allowed batch.
  const needsRepeat = (selectedGroup?.memberCount ?? 0) > maxRecipients;

  // A group that fits in one batch is always a one-off; a bigger one defaults to daily.
  useEffect(() => {
    if (step === 4) {
      setRepeatMode(needsRepeat ? "daily" : "once");
    }
  }, [step, needsRepeat]);

  async function startCampaign(schedule: boolean) {
    if (!groupId) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId,
          mode,
          text,
          templateName: templateSelection?.name,
          templateLanguage: templateSelection?.language,
          bodyParams: templateSelection?.bodyParams ?? [],
          bodyPreview: templateSelection?.preview,
          dailyLimit: maxRecipients,
          startsAt: schedule && scheduledFor ? scheduledFor.toISOString() : null,
          repeatMode: schedule ? repeatMode : "daily"
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not start campaign.");
      }
      setCampaignStarted({
        estimatedDays: Math.max(1, (payload.estimatedDays ?? 0) + 1),
        total: payload.campaign?.progress?.remaining ?? 0,
        scheduled: payload.scheduled,
        startsAt: schedule && scheduledFor ? scheduledFor.toLocaleString() : undefined,
        repeatMode: schedule ? repeatMode : undefined
      });
      await onDone();
    } catch (campaignError) {
      setError(campaignError instanceof Error ? campaignError.message : "Could not start campaign.");
    }
    setBusy(false);
  }

  async function submit() {
    if (!groupId) return;
    if (autoCampaign) {
      await startCampaign(false);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/messages/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId,
          mode,
          text,
          templateName: templateSelection?.name,
          templateLanguage: templateSelection?.language,
          bodyParams: templateSelection?.bodyParams ?? [],
          bodyPreview: templateSelection?.preview,
          skipAlreadySent,
          maxRecipients
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Bulk send failed.");
      }
      setResults(payload);
      await onDone();
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : "Bulk send failed.");
    }
    setBusy(false);
  }

  if (campaignStarted) {
    return (
      <Modal onClose={onClose} title="Campaign started 🚀" wide>
        <div className="modalBody">
          {campaignStarted.scheduled ? (
            <p className="hint">
              Nothing has been sent yet. The first batch of up to {maxRecipients} goes out on{" "}
              <strong>{campaignStarted.startsAt}</strong>
              {campaignStarted.repeatMode === "daily"
                ? ", then every day at the same time until all "
                : campaignStarted.repeatMode === "weekly"
                  ? ", then every week on the same day and time until all "
                  : " — a single batch, no repeat. "}
              {campaignStarted.repeatMode === "once" ? "" : <><strong>{campaignStarted.total}</strong> members have it. </>}
              Track or cancel it any time under <strong>Campaigns</strong>.
            </p>
          ) : (
          <p className="hint">
            The first batch is being sent right now. The remaining <strong>{campaignStarted.total}</strong> members
            will receive it automatically, one batch of {maxRecipients} per day — done in about{" "}
            <strong>{campaignStarted.estimatedDays} {campaignStarted.estimatedDays === 1 ? "day" : "days"}</strong>.
            Track it any time under <strong>Campaigns</strong>.
          </p>
          )}
          <div className="modalActions">
            <button onClick={onClose} type="button">Done</button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} title="Bulk send" wide>
      <div className="modalBody">
        {results ? (
          <>
            <div className="importSummary">
              <div><strong>{results.sent}</strong><span>sent</span></div>
              <div className={results.failed ? "bad" : ""}><strong>{results.failed}</strong><span>failed</span></div>
              <div><strong>{results.skipped ?? 0}</strong><span>already got it</span></div>
              <div><strong>{results.remaining ?? 0}</strong><span>left for next batch</span></div>
            </div>
            {(results.remaining ?? 0) > 0 ? (
              <p className="hint warning">
                {results.remaining} members still have not received this message — run Bulk send again
                (tomorrow if you hit the daily limit) with the same template and they will be picked up automatically.
              </p>
            ) : null}
            <div className="bulkResults">
              {results.results.map((result) => (
                <div className={result.ok ? "bulkRow" : "bulkRow bad"} key={result.memberId}>
                  <span dir="auto">{result.name}</span>
                  <span className="bulkPhone">{result.phone}</span>
                  <span className="bulkStatus">{result.ok ? "✓ sent" : result.error}</span>
                </div>
              ))}
            </div>
            <div className="modalActions">
              <button onClick={onClose} type="button">Done</button>
            </div>
          </>
        ) : (
          <>
            <ol className="wizardSteps">
              {(step === 4 ? ["Group", "Message", "Options", "Schedule"] : ["Group", "Message", "Options"]).map((label, index) => (
                <li className={step === index + 1 ? "active" : step > index + 1 ? "done" : ""} key={label}>
                  <span>{index + 1}</span> {label}
                </li>
              ))}
            </ol>

            {step > 1 && selectedGroup ? (
              <div className="wizardContext">
                <strong dir="auto">{selectedGroup.name}</strong>
                <em>{selectedGroup.memberCount} contacts</em>
              </div>
            ) : null}

            {step === 1 ? (
              <div className="groupPicker">
                {groups.map((group) => (
                  <button
                    className={groupId === group.id ? "groupPick active" : "groupPick"}
                    key={group.id}
                    onClick={() => setGroupId(group.id)}
                    type="button"
                  >
                    <span dir="auto">{group.name}</span>
                    <em>{group.memberCount}</em>
                  </button>
                ))}
                {!groups.length ? <p className="hint">No groups yet — create one from Groups first.</p> : null}
              </div>
            ) : null}

            {step === 2 ? (
              <>
                <div className="modeSwitch">
                  <button className={mode === "template" ? "active" : ""} onClick={() => setMode("template")} type="button">
                    <Icon path={icons.zap} size={14} /> Template
                  </button>
                  <button className={mode === "text" ? "active" : ""} onClick={() => setMode("text")} type="button">
                    Free text
                  </button>
                </div>
                {mode === "text" ? (
                  <>
                    <textarea
                      dir="auto"
                      onChange={(event) => setText(event.target.value)}
                      placeholder="Write the message everyone in the group will receive…"
                      rows={5}
                      value={text}
                    />
                    <p className="hint warning">
                      Free text only reaches members who wrote to you in the last 24 hours. For everyone else, use a template.
                    </p>
                  </>
                ) : (
                  <TemplateSelector
                    searchable
                    onChange={(nextSelection, nextState) => {
                      setTemplateSelection(nextSelection);
                      setTemplateState(nextState);
                    }}
                  />
                )}
              </>
            ) : null}

            {step === 3 ? (
            <div className="bulkOptions">
              <label className="checkboxRow highlight">
                <input
                  checked={autoCampaign}
                  onChange={(event) => setAutoCampaign(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  Auto-campaign: send a batch every day automatically until everyone got it
                </span>
              </label>
              {!autoCampaign ? (
                <label className="checkboxRow">
                  <input
                    checked={skipAlreadySent}
                    onChange={(event) => setSkipAlreadySent(event.target.checked)}
                    type="checkbox"
                  />
                  <span>Skip members who already received this exact message</span>
                </label>
              ) : null}
              <label>
                {autoCampaign ? "Daily batch size" : "Max recipients in this batch"}
                <input
                  max={capLimit}
                  min={1}
                  onChange={(event) =>
                    setMaxRecipients(Math.max(1, Math.min(capLimit, Number(event.target.value) || 1)))
                  }
                  type="number"
                  value={maxRecipients}
                />
              </label>
              {metaLimit ? (
                <p className="hint">
                  WhatsApp allows <strong>{metaLimit.dailyLimit}</strong> business-initiated conversations per day
                  {metaLimit.quality ? ` (quality: ${metaLimit.quality.toLowerCase()})` : ""} — suggested batch is 70% ={" "}
                  <strong>{metaLimit.suggested}</strong>. You can lower it, but not exceed the limit.
                </p>
              ) : null}
              {autoCampaign && selectedGroup ? (
                <p className="hint">
                  ≈ {Math.max(1, Math.ceil(selectedGroup.memberCount / Math.max(1, maxRecipients)))} days for{" "}
                  {selectedGroup.memberCount} members. A Telegram report arrives after every daily batch.
                </p>
              ) : null}
            </div>
            ) : null}

            {step === 4 ? (
            <div className="bulkOptions">
              <p className="hint">
                Nothing is sent now. The first batch of up to <strong>{maxRecipients}</strong> goes out at the date
                and time you pick below.
              </p>
              <div className="scheduleRow">
                <label>
                  Date
                  <input
                    min={todayIso}
                    onChange={(event) => setScheduleDate(event.target.value)}
                    type="date"
                    value={scheduleDate}
                  />
                </label>
                <label>
                  Time
                  <input
                    onChange={(event) => setScheduleTime(event.target.value)}
                    type="time"
                    value={scheduleTime}
                  />
                </label>
              </div>
              {needsRepeat ? (
                <>
                  <p className="hint">
                    This group has <strong>{selectedGroup?.memberCount}</strong> members — more than the{" "}
                    {maxRecipients} allowed in one batch. Pick how the rest should follow.
                  </p>
                  <div className="repeatChoices">
                    {([
                      { value: "daily", label: "Every day", detail: "Same time each day until everyone got it" },
                      { value: "weekly", label: "Every week", detail: "Same day and time each week" },
                      { value: "once", label: "Just once", detail: `Only the first ${maxRecipients} — no repeat` }
                    ] as const).map((choice) => (
                      <label
                        className={`repeatChoice${repeatMode === choice.value ? " active" : ""}`}
                        key={choice.value}
                      >
                        <input
                          checked={repeatMode === choice.value}
                          name="repeatMode"
                          onChange={() => setRepeatMode(choice.value)}
                          type="radio"
                        />
                        <span>
                          <strong>{choice.label}</strong>
                          <em>{choice.detail}</em>
                        </span>
                      </label>
                    ))}
                  </div>
                </>
              ) : null}
              {scheduledFor && selectedGroup ? (
                <p className="hint">
                  Starts <strong>{scheduledFor.toLocaleString()}</strong>
                  {needsRepeat && repeatMode !== "once"
                    ? ` — about ${Math.ceil(selectedGroup.memberCount / Math.max(1, maxRecipients))} ${
                        repeatMode === "daily" ? "days" : "weeks"
                      } to reach all ${selectedGroup.memberCount} members.`
                    : "."}{" "}
                  A Telegram report arrives after every batch.
                </p>
              ) : null}
            </div>
            ) : null}

            {error ? <div className="notice">{error}</div> : null}

            <div className="modalActions">
              {step === 1 ? (
                <button className="secondary" onClick={onClose} type="button">Cancel</button>
              ) : (
                <button className="secondary" onClick={() => setStep(step - 1)} type="button">Back</button>
              )}
              {step < 3 ? (
                <button disabled={!canContinue} onClick={() => setStep(step + 1)} type="button">
                  Next
                </button>
              ) : step === 3 ? (
                <>
                  <button
                    className="secondary"
                    disabled={busy || !canContinue || (selectedGroup?.memberCount ?? 0) === 0}
                    onClick={() => setStep(4)}
                    type="button"
                  >
                    Schedule…
                  </button>
                  <button
                    disabled={busy || !canContinue || (selectedGroup?.memberCount ?? 0) === 0}
                    onClick={() => void submit()}
                    type="button"
                  >
                    {busy
                      ? autoCampaign ? "Starting campaign…" : "Sending…"
                      : autoCampaign
                        ? "Start auto-campaign"
                        : selectedGroup
                          ? `Send to up to ${Math.min(maxRecipients, selectedGroup.memberCount)} of ${selectedGroup.memberCount}`
                          : "Send"}
                  </button>
                </>
              ) : (
                <button
                  disabled={busy || !scheduledFor || scheduledFor.getTime() <= Date.now()}
                  onClick={() => void startCampaign(true)}
                  type="button"
                >
                  {busy ? "Scheduling…" : scheduledFor ? "Schedule send" : "Pick a date"}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
