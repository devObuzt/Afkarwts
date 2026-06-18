"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

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
  body: string;
  whatsappMessageId: string | null;
  status: "received" | "pending" | "accepted" | "sent" | "delivered" | "read" | "failed";
  error: string | null;
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

export default function Home() {
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [memberForm, setMemberForm] = useState({ name: "", phone: "", notes: "" });
  const [messageText, setMessageText] = useState("");
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
                  <p>{message.body}</p>
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
          <textarea
            disabled={!selectedMember}
            value={messageText}
            onChange={(event) => setMessageText(event.target.value)}
            placeholder={selectedMember ? "Write a WhatsApp message" : "Select a member first"}
            rows={3}
          />
          <div className="composerActions">
            <button disabled={!selectedMember || isSendingTemplate} onClick={sendTemplate} type="button">
              {isSendingTemplate ? "Starting..." : "Send template"}
            </button>
            <button disabled={!selectedMember || isSending || !messageText.trim()} type="submit">
              {isSending ? "Sending..." : "Send text"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
