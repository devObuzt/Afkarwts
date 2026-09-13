"use client";

import { useCallback, useEffect, useState } from "react";
import { smsSegments } from "@/app/lib/sms-format";

type Step = {
  id: number;
  week: number;
  weekday: number;
  sendTime: string;
  label: string;
  freeText: string;
  templateName: string;
  templateLanguage: string;
  templatePreview: string;
};

type Template = { id: number; name: string; smsText: string; steps: Step[] };

type Funnel = {
  enrolled: number;
  sent: number;
  reached: number;
  read: number;
  replied: number;
  stopped: Record<string, number>;
  repliedAfterStop: number;
  sms: Record<string, number>;
  manual: Record<string, number>;
};

type Journey = {
  id: number;
  templateId: number;
  groupId: number;
  anchorDate: string;
  status: "draft" | "active" | "paused" | "done";
  name: string;
  group: string;
  funnel: Funnel;
};

type StepRow = {
  stepId: number;
  label: string;
  dueAt: string;
  sentText: number;
  sentTemplate: number;
  failed: number;
  deferred: number;
  missed: number;
  skipped: number;
  stuck: number;
  delivered: number;
  read: number;
  replied: number;
};

type Followup = {
  id: number;
  kind: "sms" | "manual";
  reason: string;
  state: string;
  body: string;
  note: string;
  error: string | null;
  memberName: string;
  memberPhone: string;
};

type WaTemplate = { name: string; language: string; category: string; bodyText: string; paramCount: number };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const STOP_REASONS: Record<string, string> = {
  not_delivered: "never arrived",
  not_read: "arrived, unread",
  send_failed: "number cannot receive"
};

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed (${response.status}).`);
  }
  return payload;
}

function dueLabel(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(iso));
}

export default function JourneysModal({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<"journeys" | "templates" | "followups">("journeys");
  const [error, setError] = useState("");

  return (
    <div
      className="overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal wide" role="dialog">
        <header className="modalHeader">
          <h3>Journeys</h3>
          <button className="iconButton" onClick={onClose} type="button">
            &times;
          </button>
        </header>
        <div className="modalBody">
          <div className="detailTabs">
            <button className={view === "journeys" ? "active" : ""} onClick={() => setView("journeys")} type="button">
              Running
            </button>
            <button className={view === "templates" ? "active" : ""} onClick={() => setView("templates")} type="button">
              Paths
            </button>
            <button className={view === "followups" ? "active" : ""} onClick={() => setView("followups")} type="button">
              Follow-up
            </button>
          </div>

          {error ? <p className="hint">{error}</p> : null}

          {view === "journeys" ? <JourneysView onError={setError} /> : null}
          {view === "templates" ? <TemplatesView onError={setError} /> : null}
          {view === "followups" ? <FollowupsView onError={setError} /> : null}
        </div>
      </div>
    </div>
  );
}

function JourneysView({ onError }: { onError: (message: string) => void }) {
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [groups, setGroups] = useState<Array<{ id: number; name: string; memberCount: number }>>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState({ templateId: 0, groupId: 0, anchorDate: "" });

  const load = useCallback(async () => {
    try {
      const [j, t, g] = await Promise.all([api("/api/journeys"), api("/api/journeys/templates"), api("/api/groups")]);
      setJourneys(j.journeys);
      setTemplates(t.templates);
      setGroups(g.groups);
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Could not load journeys.");
    }
    setLoading(false);
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    try {
      await api("/api/journeys", { method: "POST", body: JSON.stringify(draft) });
      setDraft({ templateId: 0, groupId: 0, anchorDate: "" });
      await load();
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Could not start the journey.");
    }
  }

  async function setStatus(id: number, status: string) {
    await api(`/api/journeys/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    await load();
  }

  if (loading) {
    return <p className="hint">Loading…</p>;
  }

  return (
    <>
      <div className="bulkOptions">
        <select
          onChange={(event) => setDraft({ ...draft, templateId: Number(event.target.value) })}
          value={draft.templateId}
        >
          <option value={0}>Pick a path…</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name} ({template.steps.length} steps)
            </option>
          ))}
        </select>
        <select onChange={(event) => setDraft({ ...draft, groupId: Number(event.target.value) })} value={draft.groupId}>
          <option value={0}>Pick a group…</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name} ({group.memberCount})
            </option>
          ))}
        </select>
        <input
          onChange={(event) => setDraft({ ...draft, anchorDate: event.target.value })}
          type="date"
          value={draft.anchorDate}
        />
        <button
          disabled={!draft.templateId || !draft.groupId || !draft.anchorDate}
          onClick={() => void create()}
          type="button"
        >
          Start
        </button>
      </div>
      <p className="hint">
        The start date is the cohort&apos;s first day. Every step is counted from it, so the whole schedule is fixed the
        moment a journey starts.
      </p>

      {!journeys.length ? <p className="hint">No journeys yet.</p> : null}

      {journeys.map((journey) => (
        <div className="campaignRow" key={journey.id}>
          <div className="campaignHead">
            <strong>
              {journey.name} · {journey.group}
            </strong>
            <span className="campaignStatus">{journey.status}</span>
          </div>
          <div className="campaignMeta">
            starts {journey.anchorDate} · {journey.funnel.enrolled} enrolled · {journey.funnel.reached} reached ·{" "}
            {journey.funnel.read} read · {journey.funnel.replied} replied ·{" "}
            {Object.values(journey.funnel.stopped).reduce((sum, n) => sum + n, 0)} stopped
          </div>
          <div className="campaignActions">
            {journey.status === "draft" || journey.status === "paused" ? (
              <button onClick={() => void setStatus(journey.id, "active")} type="button">
                Activate
              </button>
            ) : null}
            {journey.status === "active" ? (
              <button className="secondary" onClick={() => void setStatus(journey.id, "paused")} type="button">
                Pause
              </button>
            ) : null}
            <button className="secondary" onClick={() => setOpenId(openId === journey.id ? null : journey.id)} type="button">
              {openId === journey.id ? "Hide" : "Report"}
            </button>
          </div>
          {openId === journey.id ? <JourneyReport journeyId={journey.id} /> : null}
        </div>
      ))}
    </>
  );
}

function JourneyReport({ journeyId }: { journeyId: number }) {
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [steps, setSteps] = useState<StepRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const payload = await api(`/api/journeys/${journeyId}/report`);
      if (!cancelled) {
        setFunnel(payload.funnel);
        setSteps(payload.steps);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [journeyId]);

  if (!funnel) {
    return <p className="hint">Loading…</p>;
  }

  const stopped = Object.entries(funnel.stopped);

  return (
    <div className="campaignDetail">
      <ul className="funnel">
        <li>Enrolled: {funnel.enrolled}</li>
        <li>Sent: {funnel.sent}</li>
        <li>Reached: {funnel.reached}</li>
        <li>Read: {funnel.read}</li>
        <li>Replied: {funnel.replied}</li>
        <li>
          Stopped: {stopped.reduce((sum, [, n]) => sum + n, 0)}
          {stopped.length ? ` (${stopped.map(([reason, n]) => `${STOP_REASONS[reason] ?? reason}: ${n}`).join(" · ")})` : ""}
        </li>
        <li>
          SMS: {funnel.sms.sent ?? 0} sent · {funnel.sms.queued ?? 0} queued · {funnel.sms.failed ?? 0} failed
        </li>
        <li>
          Manual: {funnel.manual.open ?? 0} open · {funnel.manual.done ?? 0} done
        </li>
        {funnel.repliedAfterStop ? <li>Replied after stopping: {funnel.repliedAfterStop}</li> : null}
      </ul>

      <table className="stepTable">
        <thead>
          <tr>
            <th>Step</th>
            <th>Due</th>
            <th>Sent</th>
            <th>Delivered</th>
            <th>Read</th>
            <th>Replied</th>
            <th>Problems</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((step) => (
            <tr key={step.stepId}>
              <td>{step.label}</td>
              <td>{dueLabel(step.dueAt)}</td>
              <td>
                {step.sentText + step.sentTemplate}
                {step.sentText ? ` (${step.sentText} free text)` : ""}
              </td>
              <td>{step.delivered}</td>
              <td>{step.read}</td>
              <td>{step.replied}</td>
              <td>
                {[
                  step.failed ? `${step.failed} failed` : null,
                  step.deferred ? `${step.deferred} deferred` : null,
                  step.missed ? `${step.missed} missed` : null,
                  step.skipped ? `${step.skipped} skipped` : null,
                  step.stuck ? `${step.stuck} stuck` : null
                ]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TemplatesView({ onError }: { onError: (message: string) => void }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [waTemplates, setWaTemplates] = useState<WaTemplate[]>([]);
  const [name, setName] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [t, w] = await Promise.all([api("/api/journeys/templates"), api("/api/templates")]);
      setTemplates(t.templates);
      setWaTemplates(w.templates ?? []);
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Could not load paths.");
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createTemplate() {
    await api("/api/journeys/templates", { method: "POST", body: JSON.stringify({ name }) });
    setName("");
    await load();
  }

  return (
    <>
      <div className="bulkOptions">
        <input onChange={(event) => setName(event.target.value)} placeholder="Path name" value={name} />
        <button disabled={!name.trim()} onClick={() => void createTemplate()} type="button">
          New path
        </button>
      </div>

      {templates.map((template) => (
        <div className="campaignRow" key={template.id}>
          <div className="campaignHead">
            <strong>{template.name}</strong>
            <span className="campaignStatus">{template.steps.length} steps</span>
          </div>
          <div className="campaignActions">
            <button className="secondary" onClick={() => setOpenId(openId === template.id ? null : template.id)} type="button">
              {openId === template.id ? "Hide" : "Edit"}
            </button>
          </div>
          {openId === template.id ? (
            <TemplateEditor onChanged={load} onError={onError} template={template} waTemplates={waTemplates} />
          ) : null}
        </div>
      ))}
    </>
  );
}

function TemplateEditor({
  template,
  waTemplates,
  onChanged,
  onError
}: {
  template: Template;
  waTemplates: WaTemplate[];
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [smsText, setSmsText] = useState(template.smsText);
  const [step, setStep] = useState({
    week: 1,
    weekday: 0,
    sendTime: "07:00",
    label: "",
    freeText: "",
    templateName: ""
  });

  const counted = smsSegments(smsText);

  async function saveSms() {
    await api(`/api/journeys/templates/${template.id}`, { method: "PATCH", body: JSON.stringify({ smsText }) });
    await onChanged();
  }

  async function addStep() {
    const picked = waTemplates.find((item) => item.name === step.templateName);
    if (!picked) {
      onError("Pick an approved template for the step.");
      return;
    }

    await api(`/api/journeys/templates/${template.id}/steps`, {
      method: "POST",
      body: JSON.stringify({
        ...step,
        templateLanguage: picked.language,
        templatePreview: picked.bodyText,
        bodyParams: Array.from({ length: picked.paramCount }, (_, index) => (index === 0 ? "{{name}}" : ""))
      })
    });
    setStep({ ...step, label: "", freeText: "", templateName: "" });
    await onChanged();
  }

  async function removeStep(id: number) {
    await api(`/api/journeys/steps/${id}`, { method: "DELETE" });
    await onChanged();
  }

  return (
    <div className="campaignDetail">
      <table className="stepTable">
        <thead>
          <tr>
            <th>When</th>
            <th>Step</th>
            <th>Template</th>
            <th>Free text</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {template.steps.map((item) => (
            <tr key={item.id}>
              <td>
                Week {item.week} · {WEEKDAYS[item.weekday]} · {item.sendTime}
              </td>
              <td>{item.label || "—"}</td>
              <td>{item.templateName}</td>
              <td>{item.freeText ? "yes" : "template only"}</td>
              <td>
                <button className="secondary" onClick={() => void removeStep(item.id)} type="button">
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="bulkOptions">
        <input
          min={1}
          onChange={(event) => setStep({ ...step, week: Number(event.target.value) })}
          type="number"
          value={step.week}
        />
        <select onChange={(event) => setStep({ ...step, weekday: Number(event.target.value) })} value={step.weekday}>
          {WEEKDAYS.map((day, index) => (
            <option key={day} value={index}>
              {day}
            </option>
          ))}
        </select>
        <input
          onChange={(event) => setStep({ ...step, sendTime: event.target.value })}
          type="time"
          value={step.sendTime}
        />
        <input
          onChange={(event) => setStep({ ...step, label: event.target.value })}
          placeholder="Step name"
          value={step.label}
        />
        <select onChange={(event) => setStep({ ...step, templateName: event.target.value })} value={step.templateName}>
          <option value="">Approved template…</option>
          {waTemplates.map((item) => (
            <option key={`${item.name}:${item.language}`} value={item.name}>
              {item.name} ({item.category})
            </option>
          ))}
        </select>
        <button disabled={!step.templateName} onClick={() => void addStep()} type="button">
          Add step
        </button>
      </div>

      <textarea
        onChange={(event) => setStep({ ...step, freeText: event.target.value })}
        placeholder="Free text for this step — sent when the member wrote to us in the last 24 hours. Leave empty to always use the template."
        rows={3}
        value={step.freeText}
      />

      <label className="checkboxRow">SMS sent when someone stops being reachable</label>
      <textarea onChange={(event) => setSmsText(event.target.value)} rows={2} value={smsText} />
      <p className="hint">
        {counted.characters} characters · {counted.segments} SMS {counted.segments === 1 ? "message" : "messages"}{" "}
        (Arabic fits 70 per message, Latin 160)
      </p>
      <button className="secondary" onClick={() => void saveSms()} type="button">
        Save SMS text
      </button>
    </div>
  );
}

function FollowupsView({ onError }: { onError: (message: string) => void }) {
  const [items, setItems] = useState<Followup[]>([]);
  const [provider, setProvider] = useState("none");
  const [notes, setNotes] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    try {
      const payload = await api("/api/journeys/followups");
      setItems(payload.followups);
      setProvider(payload.smsProvider);
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Could not load follow-up.");
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(id: number, action: "resolve" | "resume") {
    await api(`/api/journeys/followups/${id}`, {
      method: "POST",
      body: JSON.stringify({ action, note: notes[id] ?? "" })
    });
    await load();
  }

  const sms = items.filter((item) => item.kind === "sms");
  const manual = items.filter((item) => item.kind === "manual");

  return (
    <>
      <h4>SMS queue</h4>
      {provider === "none" ? (
        <p className="hint">Waiting for Afkar&apos;s Inforu credentials — nothing is sent until they are in place.</p>
      ) : null}
      {!sms.length ? <p className="hint">Nothing queued.</p> : null}
      {sms.map((item) => (
        <div className="campaignRow" key={item.id}>
          <div className="campaignHead">
            <strong>
              {item.memberName} · {item.memberPhone}
            </strong>
            <span className="campaignStatus">{item.state}</span>
          </div>
          <div className="campaignMeta">
            {item.reason}
            {item.error ? ` · ${item.error}` : ""}
          </div>
        </div>
      ))}

      <h4>Manual follow-up</h4>
      {!manual.length ? <p className="hint">Nothing to chase.</p> : null}
      {manual.map((item) => (
        <div className="campaignRow" key={item.id}>
          <div className="campaignHead">
            <strong>
              {item.memberName} · {item.memberPhone}
            </strong>
            <span className="campaignStatus">{item.state}</span>
          </div>
          <div className="campaignMeta">{item.reason}</div>
          {item.state === "open" ? (
            <div className="campaignActions">
              <input
                onChange={(event) => setNotes({ ...notes, [item.id]: event.target.value })}
                placeholder="What happened?"
                value={notes[item.id] ?? ""}
              />
              <button onClick={() => void act(item.id, "resolve")} type="button">
                Contacted
              </button>
              <button className="secondary" onClick={() => void act(item.id, "resume")} type="button">
                Put back on the path
              </button>
            </div>
          ) : (
            <div className="campaignMeta">{item.note}</div>
          )}
        </div>
      ))}
    </>
  );
}
