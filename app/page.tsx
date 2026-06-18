"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

const maxMediaBytes = 64 * 1024 * 1024;
const maxMediaLabel = "64 MB";
const whatsappImageBytes = 5 * 1024 * 1024;
const whatsappVideoBytes = 16 * 1024 * 1024;
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
  createdAt: string;
};

type Message = {
  id: number;
  memberId: number;
  direction: "incoming" | "outgoing";
  messageType: "text" | "image" | "video" | "document";
  body: string;
  whatsappMessageId: string | null;
  status: "received" | "pending" | "accepted" | "sent" | "delivered" | "read" | "failed";
  error: string | null;
  mediaUrl: string | null;
  mediaMimeType: string | null;
  mediaFilename: string | null;
  createdAt: string;
};

const statusLabels: Record<Message["status"], string> = {
  received: "received",
  pending: "sending",
  accepted: "accepted by Meta",
  sent: "sent to WhatsApp",
  delivered: "delivered",
  read: "read",
  failed: "failed"
};

function isVideoMessage(message: Message) {
  return message.messageType === "video" || Boolean(message.mediaMimeType?.startsWith("video/"));
}

function mediaDeliveryNote(file: File) {
  if (file.type === "video/mp4" || file.type === "video/3gpp") {
    return "WhatsApp videos can be up to 16 MB.";
  }

  return "";
}

function validateSelectedFile(file: File) {
  if (file.size > maxMediaBytes) {
    return `This file is ${formatFileSize(file.size)}. The maximum supported size is ${maxMediaLabel}.`;
  }

  if (file.type === "video/quicktime") {
    return "MOV is not supported by WhatsApp Cloud API. Convert it to MP4 and keep it under 16 MB.";
  }

  if (file.type === "video/mp4" || file.type === "video/3gpp") {
    if (file.size > whatsappVideoBytes) {
      return `This video is ${formatFileSize(file.size)}. WhatsApp Cloud API supports videos up to 16 MB.`;
    }

    return "";
  }

  if (file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp") {
    if (file.size > whatsappImageBytes) {
      return `This image is ${formatFileSize(file.size)}. WhatsApp Cloud API supports images up to 5 MB.`;
    }

    return "";
  }

  if (whatsappDocumentMimeTypes.has(file.type)) {
    return "";
  }

  return "This file type is not supported by WhatsApp Cloud API.";
}

export default function Home() {
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [memberForm, setMemberForm] = useState({ name: "", phone: "", notes: "" });
  const [messageText, setMessageText] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [notice, setNotice] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isSendingTemplate, setIsSendingTemplate] = useState(false);

  const selectedMember = useMemo(
    () => members.find((member) => member.id === selectedMemberId) ?? null,
    [members, selectedMemberId]
  );

  async function loadMembers() {
    const response = await fetch("/api/members");
    const payload = (await response.json()) as { members: Member[] };
    setMembers(payload.members);

    if (!selectedMemberId && payload.members[0]) {
      setSelectedMemberId(payload.members[0].id);
    }
  }

  async function loadMessages(memberId: number) {
    const response = await fetch(`/api/members/${memberId}/messages`);
    if (!response.ok) {
      setMessages([]);
      return;
    }

    const payload = (await response.json()) as { messages: Message[] };
    setMessages(payload.messages);
  }

  useEffect(() => {
    void loadMembers();
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

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");

    const response = await fetch("/api/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(memberForm)
    });

    const payload = await response.json();
    if (!response.ok) {
      setNotice(payload.error ?? "Could not add member.");
      return;
    }

    setMemberForm({ name: "", phone: "", notes: "" });
    await loadMembers();
    setSelectedMemberId(payload.member.id);
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedMemberId || !messageText.trim()) {
      return;
    }

    setIsSending(true);
    setNotice("");

    const response = await fetch("/api/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: selectedMemberId, text: messageText })
    });

    const payload = await response.json();
    if (!response.ok) {
      setNotice(payload.error ?? "Message was saved but WhatsApp send failed.");
    } else {
      setMessageText("");
    }

    await loadMessages(selectedMemberId);
    setIsSending(false);
  }

  async function sendTemplate() {
    if (!selectedMemberId) {
      return;
    }

    setIsSendingTemplate(true);
    setNotice("");

    const response = await fetch("/api/messages/send-template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: selectedMemberId })
    });

    const payload = await response.json();
    if (!response.ok) {
      setNotice(payload.error ?? "Template send failed.");
    }

    await loadMessages(selectedMemberId);
    setIsSendingTemplate(false);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  async function sendMedia() {
    if (!selectedMemberId || !mediaFile) {
      return;
    }

    setIsSending(true);
    setNotice("");

    const params = new URLSearchParams({
      memberId: String(selectedMemberId),
      caption: messageText,
      filename: mediaFile.name,
      mimeType: mediaFile.type || "application/octet-stream"
    });

    const response = await fetch(`/api/messages/send-media?${params.toString()}`, {
      method: "POST",
      headers: {
        "Content-Type": mediaFile.type || "application/octet-stream"
      },
      body: mediaFile
    });

    const payload = await response.json();
    if (!response.ok) {
      setNotice(payload.error ?? "Media send failed.");
    } else {
      setMessageText("");
      setMediaFile(null);
    }

    await loadMessages(selectedMemberId);
    setIsSending(false);
  }

  function selectMediaFile(file: File | null) {
    const validationError = file ? validateSelectedFile(file) : "";
    if (file && validationError) {
      setMediaFile(null);
      setNotice(validationError);
      return;
    }

    setNotice("");
    setMediaFile(file);
  }

  function renderMessageContent(message: Message) {
    if (message.messageType === "image" && message.mediaUrl) {
      return (
        <>
          <img alt={message.mediaFilename ?? message.body} className="mediaPreview" src={message.mediaUrl} />
          {message.body ? <p>{message.body}</p> : null}
        </>
      );
    }

    if (isVideoMessage(message) && message.mediaUrl) {
      return (
        <>
          <video className="mediaPreview" controls playsInline preload="metadata" src={message.mediaUrl} />
          <a className="documentLink" href={message.mediaUrl} rel="noreferrer" target="_blank">
            Open video
          </a>
          {message.body ? <p>{message.body}</p> : null}
        </>
      );
    }

    if (message.messageType === "document" && message.mediaUrl) {
      return (
        <>
          <a className="documentLink" href={message.mediaUrl} rel="noreferrer" target="_blank">
            {message.mediaFilename || message.body || "Open file"}
          </a>
          {message.body && message.body !== message.mediaFilename ? <p>{message.body}</p> : null}
        </>
      );
    }

    return <p>{message.body}</p>;
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brandMark">A</span>
          <div>
            <h1>Afkar WhatsApp</h1>
            <p>Member conversations</p>
          </div>
        </div>

        <form className="panel compact" onSubmit={addMember}>
          <h2>Add member</h2>
          <label>
            Name
            <input
              value={memberForm.name}
              onChange={(event) => setMemberForm({ ...memberForm, name: event.target.value })}
              placeholder="Member name"
            />
          </label>
          <label>
            WhatsApp number
            <input
              value={memberForm.phone}
              onChange={(event) => setMemberForm({ ...memberForm, phone: event.target.value })}
              placeholder="+972526993229"
            />
          </label>
          <label>
            Notes
            <textarea
              value={memberForm.notes}
              onChange={(event) => setMemberForm({ ...memberForm, notes: event.target.value })}
              placeholder="Optional"
              rows={3}
            />
          </label>
          <button type="submit">Add member</button>
        </form>

        <section className="memberList" aria-label="Members">
          {members.map((member) => (
            <button
              className={member.id === selectedMemberId ? "member active" : "member"}
              key={member.id}
              onClick={() => setSelectedMemberId(member.id)}
              type="button"
            >
              <strong>{member.name}</strong>
              <span>{member.phone}</span>
            </button>
          ))}
        </section>
      </aside>

      <section className="conversation">
        <header className="conversationHeader">
          {selectedMember ? (
            <>
              <div>
                <p className="eyebrow">Selected member</p>
                <h2>{selectedMember.name}</h2>
              </div>
              <div className="phoneBadge">{selectedMember.phone}</div>
              <button className="logoutButton" onClick={logout} type="button">
                Logout
              </button>
            </>
          ) : (
            <h2>Add a member to start</h2>
          )}
        </header>

        {notice ? <div className="notice">{notice}</div> : null}

        <div className="messages">
          {selectedMember ? (
            messages.length ? (
              messages.map((message) => (
                <article className={`bubble ${message.direction}`} key={message.id}>
                  {renderMessageContent(message)}
                  <footer>
                    <span>{new Date(message.createdAt).toLocaleString()}</span>
                    <span>{statusLabels[message.status]}</span>
                  </footer>
                  {message.error ? <small>{message.error}</small> : null}
                </article>
              ))
            ) : (
              <div className="empty">No messages yet.</div>
            )
          ) : (
            <div className="empty">Members and replies will appear here.</div>
          )}
        </div>

        <form className="composer" onSubmit={sendMessage}>
          <div className="composerInput">
            <textarea
              disabled={!selectedMember}
              value={messageText}
              onChange={(event) => setMessageText(event.target.value)}
              placeholder={mediaFile ? "Add a caption" : selectedMember ? "Write a WhatsApp message" : "Select a member first"}
              rows={3}
            />
            <label className="filePicker">
              File
              <input
                disabled={!selectedMember}
                onChange={(event) => selectMediaFile(event.target.files?.[0] ?? null)}
                type="file"
              />
            </label>
            {mediaFile ? (
              <div className="selectedFile">
                <span>
                  {mediaFile.name}
                  {mediaDeliveryNote(mediaFile) ? <small>{mediaDeliveryNote(mediaFile)}</small> : null}
                </span>
                <button onClick={() => setMediaFile(null)} type="button">
                  Clear
                </button>
              </div>
            ) : null}
          </div>
          <div className="composerActions">
            <button disabled={!selectedMember || isSendingTemplate} onClick={sendTemplate} type="button">
              {isSendingTemplate ? "Starting..." : "Send template"}
            </button>
            <button disabled={!selectedMember || isSending || !mediaFile} onClick={sendMedia} type="button">
              {isSending && mediaFile ? "Sending..." : "Send file"}
            </button>
            <button disabled={!selectedMember || isSending || !messageText.trim() || Boolean(mediaFile)} type="submit">
              {isSending ? "Sending..." : "Send text"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
