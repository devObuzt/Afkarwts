"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { smsSegments } from "@/app/lib/sms-format";
import { TemplatePicker } from "./TemplatePicker";

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
  providerRef: string | null;
  memberName: string;
  memberPhone: string;
};

type WaTemplate = {
  name: string;
  language: string;
  category: string;
  bodyText: string;
  paramCount: number;
  alias?: string;
};

type Group = { id: number; name: string; memberCount: number };

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

function smsLabel(item: Followup) {
  const simulated = (item.providerRef ?? "").startsWith("sms.");
  return item.state === "sent" && simulated ? "simulated" : item.state;
}

export default function JourneysPage() {
  const [view, setView] = useState<"paths" | "running" | "followups">("paths");
  const [error, setError] = useState("");

  return (
    <div className="journeyPage">
      <header className="journeyHeader">
        <div>
          <Link className="backLink" href="/">
            &larr; Inbox
          </Link>
          <Link className="backLink spaced" href="/templates">
            Templates &rarr;
          </Link>
          <h1>Journeys</h1>
          <p className="hint">
            A <strong>path</strong> is the flow: which message goes out on which day, written once. A{" "}
            <strong>journey</strong> runs that path on one group, counting from that group&apos;s start date.
          </p>
        </div>
      </header>

      <nav className="journeyTabs">
        <button className={view === "paths" ? "active" : ""} onClick={() => setView("paths")} type="button">
          1 &middot; Paths
        </button>
        <button className={view === "running" ? "active" : ""} onClick={() => setView("running")} type="button">
          2 &middot; Running
        </button>
        <button className={view === "followups" ? "active" : ""} onClick={() => setView("followups")} type="button">
          Follow-up
        </button>
      </nav>

      {error ? <p className="journeyError">{error}</p> : null}

      {view === "paths" ? <PathsView onError={setError} /> : null}
      {view === "running" ? <RunningView onError={setError} /> : null}
      {view === "followups" ? <FollowupsView onError={setError} /> : null}
    </div>
  );
}

/* ---------- 1. paths: the flow itself ---------- */

function PathsView({ onError }: { onError: (message: string) => void }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [waTemplates, setWaTemplates] = useState<WaTemplate[]>([]);
  const [name, setName] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [paths, wa] = await Promise.all([api("/api/journeys/templates"), api("/api/templates")]);
      setTemplates(paths.templates);
      setWaTemplates(wa.templates ?? []);
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Could not load paths.");
    }
    setLoading(false);
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    try {
      const created = await api("/api/journeys/templates", { method: "POST", body: JSON.stringify({ name }) });
      setName("");
      await load();
      setOpenId(created.template.id);
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Could not create the path.");
    }
  }

  async function remove(id: number) {
    try {
      onError("");
      await api(`/api/journeys/templates/${id}`, { method: "DELETE" });
      setConfirmId(null);
      await load();
    } catch (caught) {
      setConfirmId(null);
      onError(caught instanceof Error ? caught.message : "Could not delete the path.");
    }
  }

  if (loading) {
    return <p className="hint">Loading…</p>;
  }

  return (
    <section className="journeySection">
      <div className="newPath">
        <input onChange={(event) => setName(event.target.value)} placeholder="Name this path, e.g. Clean" value={name} />
        <button disabled={!name.trim()} onClick={() => void create()} type="button">
          Create path
        </button>
      </div>

      {!templates.length ? <p className="hint">No paths yet. Create one, then add its steps.</p> : null}

      {templates.map((template) => (
        <article className="pathCard" key={template.id}>
          <header>
            <h2>{template.name}</h2>
            <span className={template.steps.length ? "badge" : "badge warn"}>
              {template.steps.length} {template.steps.length === 1 ? "step" : "steps"}
            </span>
            <button className="secondary" onClick={() => setOpenId(openId === template.id ? null : template.id)} type="button">
              {openId === template.id ? "Close" : "Open"}
            </button>
            {confirmId === template.id ? (
              <>
                <button className="danger" onClick={() => void remove(template.id)} type="button">
                  Delete for good
                </button>
                <button className="secondary" onClick={() => setConfirmId(null)} type="button">
                  Keep
                </button>
              </>
            ) : (
              <button className="secondary" onClick={() => setConfirmId(template.id)} type="button">
                Delete
              </button>
            )}
          </header>
          {confirmId === template.id ? (
            <p className="hint">
              Deleting removes &ldquo;{template.name}&rdquo; and its {template.steps.length} step
              {template.steps.length === 1 ? "" : "s"} from this list. Journeys that already ran on it keep their
              history.
            </p>
          ) : null}

          {openId === template.id ? (
            <PathEditor onChanged={load} onError={onError} template={template} waTemplates={waTemplates} />
          ) : null}
        </article>
      ))}
    </section>
  );
}

function PathEditor({
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

  const picked = waTemplates.find((item) => item.name === step.templateName);
  const counted = smsSegments(smsText);

  async function addStep() {
    if (!picked) {
      onError("Pick an approved template for this step.");
      return;
    }

    try {
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
      onError("");
      await onChanged();
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Could not add the step.");
    }
  }

  async function removeStep(id: number) {
    await api(`/api/journeys/steps/${id}`, { method: "DELETE" });
    await onChanged();
  }

  async function saveSms() {
    await api(`/api/journeys/templates/${template.id}`, { method: "PATCH", body: JSON.stringify({ smsText }) });
    await onChanged();
  }

  return (
    <div className="pathBody">
      <h3>Steps</h3>
      {!template.steps.length ? (
        <p className="hint">
          No steps yet. A journey cannot start on an empty path — add the first message below.
        </p>
      ) : (
        <ol className="stepList">
          {template.steps.map((item) => (
            <li key={item.id}>
              <div className="stepWhen">
                Week {item.week}
                <br />
                {WEEKDAYS[item.weekday]} {item.sendTime}
              </div>
              <div className="stepWhat">
                <strong>{item.label || "Untitled step"}</strong>
                <p className="stepTemplate">
                  Template{" "}
                  {waTemplates.find((wa) => wa.name === item.templateName)?.alias ? (
                    <>
                      <strong>{waTemplates.find((wa) => wa.name === item.templateName)?.alias}</strong>{" "}
                    </>
                  ) : null}
                  <code>{item.templateName}</code>
                </p>
                {item.templatePreview ? <p className="stepPreview">{item.templatePreview}</p> : null}
                {item.freeText ? (
                  <p className="stepFree">
                    <span>Free text, inside the 24-hour window:</span> {item.freeText}
                  </p>
                ) : (
                  <p className="hint">Template only — no free-text version.</p>
                )}
              </div>
              <button className="secondary" onClick={() => void removeStep(item.id)} type="button">
                Remove
              </button>
            </li>
          ))}
        </ol>
      )}

      <h3>Add a step</h3>
      <div className="stepForm">
        <label>
          <span>Week</span>
          <input
            min={1}
            onChange={(event) => setStep({ ...step, week: Number(event.target.value) })}
            type="number"
            value={step.week}
          />
        </label>
        <label>
          <span>Day</span>
          <select onChange={(event) => setStep({ ...step, weekday: Number(event.target.value) })} value={step.weekday}>
            {WEEKDAYS.map((day, index) => (
              <option key={day} value={index}>
                {day}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Time</span>
          <input
            onChange={(event) => setStep({ ...step, sendTime: event.target.value })}
            type="time"
            value={step.sendTime}
          />
        </label>
        <label className="wide">
          <span>Step name</span>
          <input
            onChange={(event) => setStep({ ...step, label: event.target.value })}
            placeholder="Welcome"
            value={step.label}
          />
        </label>

        <div className="full">
          <span className="fieldLabel">Approved template — sent when the 24-hour window is shut</span>
          <TemplatePicker
            onChange={(name) => setStep({ ...step, templateName: name })}
            templates={waTemplates}
            value={step.templateName}
          />
        </div>

        {picked ? (
          <div className="full">
            <div className={picked.category === "UTILITY" ? "templatePreview" : "templatePreview marketing"}>
              <div className="previewMeta">
                <span className="badge">{picked.category}</span>
                <span>{picked.language}</span>
                {picked.paramCount ? <span>{picked.paramCount} variable(s)</span> : null}
              </div>
              <p>{picked.bodyText || "(this template has no body text)"}</p>
              {picked.category !== "UTILITY" ? (
                <p className="previewWarn">
                  Meta classes this as <strong>{picked.category}</strong>, whatever its name suggests. Marketing
                  templates count against each person&apos;s marketing cap and Meta withholds some of them — a utility
                  template is the more reliable fallback.
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="hint full">Pick a template to see what it actually says.</p>
        )}

        <label className="full">
          <span>Free text — used instead, when the member wrote to us in the last 24 hours (optional)</span>
          <textarea
            onChange={(event) => setStep({ ...step, freeText: event.target.value })}
            placeholder="مراحب يا رفاق 👋 كيف ماشي معكم؟"
            rows={3}
            value={step.freeText}
          />
        </label>

        <div className="full">
          <button disabled={!step.templateName} onClick={() => void addStep()} type="button">
            Add step
          </button>
        </div>
      </div>

      <h3>SMS fallback</h3>
      <p className="hint">
        Sent once, to anyone who stops being reachable on WhatsApp. Skipped for numbers an Israeli SMS cannot reach.
      </p>
      <textarea onChange={(event) => setSmsText(event.target.value)} rows={2} value={smsText} />
      <p className="hint">
        {counted.characters} characters &middot; {counted.segments} SMS {counted.segments === 1 ? "message" : "messages"}{" "}
        (Arabic fits 70 per message, Latin 160)
      </p>
      <button className="secondary" onClick={() => void saveSms()} type="button">
        Save SMS text
      </button>
    </div>
  );
}

/* ---------- 2. running: a path on a group ---------- */

function RunningView({ onError }: { onError: (message: string) => void }) {
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
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

  async function start() {
    try {
      onError("");
      await api("/api/journeys", { method: "POST", body: JSON.stringify(draft) });
      setDraft({ templateId: 0, groupId: 0, anchorDate: "" });
      await load();
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Could not start the journey.");
    }
  }

  async function setStatus(id: number, status: string) {
    try {
      onError("");
      await api(`/api/journeys/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      await load();
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Could not change the journey.");
    }
  }

  if (loading) {
    return <p className="hint">Loading…</p>;
  }

  const chosen = templates.find((item) => item.id === draft.templateId);

  return (
    <section className="journeySection">
      <div className="startJourney">
        <label>
          <span>Path</span>
          <select
            onChange={(event) => setDraft({ ...draft, templateId: Number(event.target.value) })}
            value={draft.templateId}
          >
            <option value={0}>Choose a path…</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name} — {template.steps.length} steps
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Group</span>
          <select
            onChange={(event) => setDraft({ ...draft, groupId: Number(event.target.value) })}
            value={draft.groupId}
          >
            <option value={0}>Choose a group…</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name} ({group.memberCount})
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Start date — the cohort&apos;s first day</span>
          <input
            onChange={(event) => setDraft({ ...draft, anchorDate: event.target.value })}
            type="date"
            value={draft.anchorDate}
          />
        </label>
        <button
          disabled={!draft.templateId || !draft.groupId || !draft.anchorDate}
          onClick={() => void start()}
          type="button"
        >
          Create
        </button>
      </div>

      {chosen && !chosen.steps.length ? (
        <p className="journeyError">
          &ldquo;{chosen.name}&rdquo; has no steps yet. Add at least one under Paths, or it will never send anything.
        </p>
      ) : null}

      {!journeys.length ? <p className="hint">Nothing running yet.</p> : null}

      {journeys.map((journey) => {
        const steps = templates.find((item) => item.id === journey.templateId)?.steps.length ?? 0;
        const stopped = Object.values(journey.funnel.stopped).reduce((sum, n) => sum + n, 0);

        return (
          <article className="journeyCard" key={journey.id}>
            <header>
              <h2>
                {journey.name} <span className="on">on</span> {journey.group}
              </h2>
              <span className="badge">{journey.status}</span>
            </header>
            <p className="journeyMeta">
              starts {journey.anchorDate} &middot; {steps} steps &middot; {journey.funnel.enrolled} enrolled &middot;{" "}
              {journey.funnel.reached} reached &middot; {journey.funnel.read} read &middot; {journey.funnel.replied}{" "}
              replied &middot; {stopped} stopped
            </p>
            <div className="journeyActions">
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
                {openId === journey.id ? "Hide report" : "Report"}
              </button>
            </div>
            {openId === journey.id ? <JourneyReport journeyId={journey.id} /> : null}
          </article>
        );
      })}
    </section>
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
    <div className="report">
      <div className="funnelGrid">
        <div>
          <strong>{funnel.enrolled}</strong>
          <span>enrolled</span>
        </div>
        <div>
          <strong>{funnel.sent}</strong>
          <span>sent to</span>
        </div>
        <div>
          <strong>{funnel.reached}</strong>
          <span>reached</span>
        </div>
        <div>
          <strong>{funnel.read}</strong>
          <span>read</span>
        </div>
        <div>
          <strong>{funnel.replied}</strong>
          <span>replied</span>
        </div>
        <div>
          <strong>{stopped.reduce((sum, [, n]) => sum + n, 0)}</strong>
          <span>stopped</span>
        </div>
      </div>

      {stopped.length ? (
        <p className="hint">
          Stopped: {stopped.map(([reason, n]) => `${n} ${STOP_REASONS[reason] ?? reason}`).join(" · ")} &middot; SMS{" "}
          {funnel.sms.sent ?? 0} sent, {funnel.sms.queued ?? 0} queued &middot; {funnel.manual.open ?? 0} manual tasks
          open
        </p>
      ) : null}

      <div className="tableScroll">
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
    </div>
  );
}

/* ---------- follow-up ---------- */

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
    <section className="journeySection">
      <h2>SMS queue</h2>
      {provider === "none" ? (
        <p className="hint">
          No SMS provider is configured, so these are simulated. They will go out for real once Afkar&apos;s Inforu
          credentials are in place.
        </p>
      ) : null}
      {!sms.length ? <p className="hint">Nothing queued.</p> : null}
      {sms.map((item) => (
        <article className="followupCard" key={item.id}>
          <header>
            <strong>{item.memberName}</strong>
            <span dir="ltr">{item.memberPhone}</span>
            <span className="badge">{smsLabel(item)}</span>
          </header>
          <p>{item.reason}</p>
          {item.error ? <p className="previewWarn">{item.error}</p> : null}
        </article>
      ))}

      <h2>Manual follow-up</h2>
      {!manual.length ? <p className="hint">Nothing to chase.</p> : null}
      {manual.map((item) => (
        <article className="followupCard" key={item.id}>
          <header>
            <strong>{item.memberName}</strong>
            <span dir="ltr">{item.memberPhone}</span>
            <span className="badge">{item.state}</span>
          </header>
          <p>{item.reason}</p>
          {item.state === "open" ? (
            <div className="followupActions">
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
            <p className="hint">{item.note}</p>
          )}
        </article>
      ))}
    </section>
  );
}
