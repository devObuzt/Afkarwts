"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminNav } from "@/app/components/AdminNav";

type Form = {
  id: number;
  name: string;
  token: string;
  groupId: number;
  groupName: string;
  status: "open" | "closed";
  title: string;
  intro: string;
  submissionCount: number;
  newCount: number;
};

type Field = {
  id: number;
  label: string;
  help: string;
  kind: "text" | "textarea" | "phone" | "date" | "choice" | "multi" | "consent" | "town" | "signature";
  showWhenFieldId: number | null;
  showWhenValue: string;
  required: boolean;
  options: string[];
  mapsTo: "" | "name" | "phone" | "city";
};

type Lead = {
  id: number;
  formId: number;
  formName: string;
  state: "new" | "added" | "rejected";
  memberId: number | null;
  name: string;
  phone: string;
  city: string;
  submittedAt: string;
  knownMemberId: number | null;
  knownMemberName: string | null;
};

type Group = { id: number; name: string; memberCount: number };

const KINDS: Array<{ value: Field["kind"]; label: string }> = [
  { value: "text", label: "Short answer" },
  { value: "textarea", label: "Long answer" },
  { value: "phone", label: "Phone" },
  { value: "date", label: "Date" },
  { value: "choice", label: "Pick one" },
  { value: "multi", label: "Pick several" },
  { value: "consent", label: "Agreement" },
  { value: "town", label: "Town (searchable list)" },
  { value: "signature", label: "Signature" }
];

const STATE_LABEL: Record<Lead["state"], string> = {
  new: "New",
  added: "In the group",
  rejected: "Rejected"
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

export default function LeadsPage() {
  const [view, setView] = useState<"leads" | "forms">("leads");
  const [error, setError] = useState("");

  return (
    <div className="journeyPage">
      <AdminNav />
      <header className="journeyHeader">
        <div>
          <h1>Leads</h1>
          <p className="hint">
            A <strong>form</strong> is one cohort&apos;s registration link. Whoever fills it lands here as a{" "}
            <strong>lead</strong> — nobody joins a group, and no journey starts, until you say so.
          </p>
        </div>
      </header>

      <div className="journeyTabs">
        <button className={view === "leads" ? "active" : ""} onClick={() => setView("leads")} type="button">
          1 &middot; Registrations
        </button>
        <button className={view === "forms" ? "active" : ""} onClick={() => setView("forms")} type="button">
          2 &middot; Forms
        </button>
      </div>

      {error ? <p className="journeyError">{error}</p> : null}

      {view === "leads" ? <LeadsView onError={setError} /> : <FormsView onError={setError} />}
    </div>
  );
}

function LeadsView({ onError }: { onError: (message: string) => void }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [forms, setForms] = useState<Form[]>([]);
  const [formFilter, setFormFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("new");
  const [openId, setOpenId] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Array<{ label: string; value: string }>>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const query = new URLSearchParams();
      if (formFilter) query.set("formId", formFilter);
      if (stateFilter) query.set("state", stateFilter);
      const payload = await api(`/api/leads?${query.toString()}`);
      setLeads(payload.leads ?? []);
      setForms(payload.forms ?? []);
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Could not load the leads.");
    }
    setLoading(false);
  }, [formFilter, stateFilter, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function open(id: number) {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    try {
      const payload = await api(`/api/leads/${id}`);
      setAnswers(payload.answers ?? []);
      setOpenId(id);
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Could not open the lead.");
    }
  }

  async function approve(ids: number[]) {
    const known = leads.filter((lead) => ids.includes(lead.id) && lead.knownMemberId);
    let overwrite = false;

    if (known.length) {
      const names = known.map((lead) => lead.knownMemberName).join("، ");
      overwrite = window.confirm(
        `${known.length} of these already have a contact here (${names}).\n\n` +
          "OK — update their saved name and city from what they just wrote.\n" +
          "Cancel — keep their details as they are. Either way they join the group."
      );
    }

    setBusy(true);
    onError("");

    // One bad row used to abort the loop: the ones before it were already
    // added, the ones after were never tried, and the screen named neither.
    // Every row is attempted, and the failures are reported together.
    const failedIds: number[] = [];
    const failures: string[] = [];

    for (const id of ids) {
      try {
        await api(`/api/leads/${id}`, {
          method: "POST",
          body: JSON.stringify({ action: "approve", overwrite })
        });
      } catch (caught) {
        failedIds.push(id);
        const name = leads.find((lead) => lead.id === id)?.name || `#${id}`;
        failures.push(`${name}: ${caught instanceof Error ? caught.message : "لم تنجح الإضافة."}`);
      }
    }

    // Only the ones that failed stay selected, so a second click retries
    // exactly those and nothing is added twice.
    setPicked(failedIds);
    if (failures.length) {
      onError(failures.join(" · "));
    }
    await load();
    setBusy(false);
  }

  async function reject(id: number) {
    try {
      await api(`/api/leads/${id}`, { method: "POST", body: JSON.stringify({ action: "reject" }) });
      await load();
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Could not reject it.");
    }
  }

  const targetGroup = forms.find((form) => String(form.id) === formFilter)?.groupName;

  return (
    <>
      <div className="newPath">
        <select onChange={(event) => setFormFilter(event.target.value)} value={formFilter}>
          <option value="">Every form</option>
          {forms.map((form) => (
            <option key={form.id} value={form.id}>
              {form.name} ({form.submissionCount})
            </option>
          ))}
        </select>
        <select onChange={(event) => setStateFilter(event.target.value)} value={stateFilter}>
          <option value="new">New</option>
          <option value="added">In the group</option>
          <option value="rejected">Rejected</option>
          <option value="">All</option>
        </select>
        <span className="hint">{leads.length} registration(s)</span>
      </div>

      {picked.length ? (
        <div className="bulkBar">
          <span>
            {picked.length} selected
            {targetGroup ? (
              <>
                {" "}
                &rarr; <strong>{targetGroup}</strong>
              </>
            ) : null}
          </span>
          <button disabled={busy} onClick={() => void approve(picked)} type="button">
            {busy ? "Adding…" : "Add to the group"}
          </button>
          <button className="secondary" onClick={() => setPicked([])} type="button">
            Clear
          </button>
        </div>
      ) : null}

      {loading ? <p className="hint">Loading…</p> : null}
      {!loading && !leads.length ? <p className="hint">Nothing here yet.</p> : null}

      {leads.map((lead) => (
        <article className="leadRow" key={lead.id}>
          <header>
            {lead.state === "new" ? (
              <input
                aria-label={`Select ${lead.name}`}
                checked={picked.includes(lead.id)}
                onChange={(event) =>
                  setPicked((current) =>
                    event.target.checked ? [...current, lead.id] : current.filter((id) => id !== lead.id)
                  )
                }
                type="checkbox"
              />
            ) : null}

            <button className="templateToggle" onClick={() => void open(lead.id)} type="button">
              <span aria-hidden className="chevron">
                {openId === lead.id ? "▾" : "▸"}
              </span>
              <span className="templateNames">
                <strong>{lead.name || "(no name)"}</strong>
                <code>{lead.phone || "no phone"}</code>
                <span className="alias">{lead.formName}</span>
              </span>
            </button>

            {lead.knownMemberId ? <span className="badge warn">موجود مسبقاً</span> : null}
            <span className={lead.state === "added" ? "badge" : "badge soft"}>{STATE_LABEL[lead.state]}</span>

            {lead.state !== "added" ? (
              <button disabled={busy} onClick={() => void approve([lead.id])} type="button">
                Add to the group
              </button>
            ) : null}
            {lead.state === "new" ? (
              <button className="secondary" onClick={() => void reject(lead.id)} type="button">
                Reject
              </button>
            ) : null}
          </header>

          {openId === lead.id ? (
            <div className="templateBody">
              <div className="previewMeta">
                <span>{new Date(lead.submittedAt.replace(" ", "T") + "Z").toLocaleString()}</span>
                {lead.city ? <span>{lead.city}</span> : null}
                {lead.knownMemberName ? <span className="warnText">Already a contact: {lead.knownMemberName}</span> : null}
              </div>
              <dl className="answerList">
                {answers.map((answer, index) => (
                  <div key={index}>
                    <dt>{answer.label}</dt>
                    <dd>
                      {/* A signature is stored as a PNG; printed as text it is
                          seven thousand characters of base64 where a name
                          should be. */}
                      {answer.value.startsWith("data:image/") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img alt={answer.label} className="answerSignature" src={answer.value} />
                      ) : (
                        answer.value || "—"
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
        </article>
      ))}
    </>
  );
}

function FormsView({ onError }: { onError: (message: string) => void }) {
  const [forms, setForms] = useState<Form[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [name, setName] = useState("");
  const [groupId, setGroupId] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [copied, setCopied] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [formsPayload, groupsPayload] = await Promise.all([api("/api/forms"), api("/api/groups")]);
      setForms(formsPayload.forms ?? []);
      setGroups(groupsPayload.groups ?? []);
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Could not load the forms.");
    }
    setLoading(false);
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openFields(id: number) {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    const payload = await api(`/api/forms/${id}`);
    setFields(payload.fields ?? []);
    setOpenId(id);
  }

  async function reloadFields(id: number) {
    const payload = await api(`/api/forms/${id}`);
    setFields(payload.fields ?? []);
    await load();
  }

  async function create() {
    try {
      onError("");
      await api("/api/forms", {
        method: "POST",
        body: JSON.stringify({ name, groupId: Number(groupId), fromTemplate: true })
      });
      setName("");
      setGroupId("");
      await load();
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Could not create the form.");
    }
  }

  async function toggleStatus(form: Form) {
    await api(`/api/forms/${form.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: form.status === "open" ? "closed" : "open" })
    });
    await load();
  }

  async function removeForm(form: Form) {
    if (
      !window.confirm(
        `Delete "${form.name}"? Its ${form.submissionCount} registration(s) go with it. Contacts already added to the group stay.`
      )
    ) {
      return;
    }
    await api(`/api/forms/${form.id}`, { method: "DELETE" });
    setOpenId(null);
    await load();
  }

  function copyLink(form: Form) {
    const link = `${window.location.origin}/f/${form.token}`;
    void navigator.clipboard?.writeText(link);
    setCopied(form.id);
    window.setTimeout(() => setCopied(null), 1600);
  }

  return (
    <>
      <div className="newPath">
        <input
          onChange={(event) => setName(event.target.value)}
          placeholder="Form name, e.g. CLEAN 18.10"
          value={name}
        />
        <select onChange={(event) => setGroupId(event.target.value)} value={groupId}>
          <option value="">Register them into…</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name} ({group.memberCount})
            </option>
          ))}
        </select>
        <button disabled={!name.trim() || !groupId} onClick={() => void create()} type="button">
          Create form
        </button>
        <span className="hint">Starts from Afkar&apos;s Clean questions — edit them per cohort.</span>
      </div>

      {loading ? <p className="hint">Loading…</p> : null}
      {!loading && !forms.length ? <p className="hint">No forms yet.</p> : null}

      {forms.map((form) => (
        <article className="templateRow" key={form.id}>
          <header>
            <button className="templateToggle" onClick={() => void openFields(form.id)} type="button">
              <span aria-hidden className="chevron">
                {openId === form.id ? "▾" : "▸"}
              </span>
              <span className="templateNames">
                <strong>{form.name}</strong>
                <span className="alias">{form.groupName}</span>
              </span>
            </button>
            <span className={form.status === "open" ? "badge" : "badge soft"}>
              {form.status === "open" ? "Open" : "Closed"}
            </span>
            <span className="hint">
              {form.submissionCount} registration(s){form.newCount ? ` · ${form.newCount} new` : ""}
            </span>
            <button className="secondary" onClick={() => copyLink(form)} type="button">
              {copied === form.id ? "Copied ✓" : "Copy link"}
            </button>
            <button className="secondary" onClick={() => void toggleStatus(form)} type="button">
              {form.status === "open" ? "Close" : "Reopen"}
            </button>
            <button className="secondary" onClick={() => void removeForm(form)} type="button">
              Delete
            </button>
          </header>

          {openId === form.id ? (
            <div className="templateBody">
              <TitleEditor form={form} onChanged={() => reloadFields(form.id)} onError={onError} />
              <p className="formLink">
                <code>
                  {typeof window === "undefined" ? "" : window.location.origin}/f/{form.token}
                </code>
              </p>
              <FieldEditor fields={fields} formId={form.id} onChanged={() => reloadFields(form.id)} onError={onError} />
            </div>
          ) : null}
        </article>
      ))}
    </>
  );
}

function TitleEditor({
  form,
  onChanged,
  onError
}: {
  form: Form;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [title, setTitle] = useState(form.title);
  const [intro, setIntro] = useState(form.intro);
  const [saved, setSaved] = useState(false);

  async function save() {
    try {
      onError("");
      await api(`/api/forms/${form.id}`, { method: "PATCH", body: JSON.stringify({ title, intro }) });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1600);
      await onChanged();
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Could not save the title.");
    }
  }

  return (
    <div className="stepForm">
      <label className="full">
        <span>
          Title people see — <code>{"{{year}}"}</code> becomes the year when the page opens
        </span>
        <input
          onChange={(event) => setTitle(event.target.value)}
          placeholder="CLEAN - اسبوع كلين تنظيف السموم {{year}}"
          value={title}
        />
      </label>
      <label className="full">
        <span>A line under it (optional)</span>
        <textarea onChange={(event) => setIntro(event.target.value)} rows={2} value={intro} />
      </label>
      <div className="full stepFormActions">
        <button onClick={() => void save()} type="button">
          {saved ? "Saved ✓" : "Save the title"}
        </button>
        <span className="hint">
          The name above (<strong>{form.name}</strong>) stays ours — nobody filling the form sees it.
        </span>
      </div>
    </div>
  );
}

function FieldEditor({
  fields,
  formId,
  onChanged,
  onError
}: {
  fields: Field[];
  formId: number;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<{
    label: string;
    help: string;
    kind: Field["kind"];
    required: boolean;
    options: string;
    mapsTo: Field["mapsTo"];
    showWhenFieldId: string;
    showWhenValue: string;
  }>({
    label: "",
    help: "",
    kind: "text",
    required: true,
    options: "",
    mapsTo: "",
    showWhenFieldId: "",
    showWhenValue: ""
  });

  function startEdit(field: Field) {
    setEditingId(field.id);
    setDraft({
      label: field.label,
      help: field.help,
      kind: field.kind,
      required: field.required,
      options: field.options.join("\n"),
      mapsTo: field.mapsTo,
      showWhenFieldId: field.showWhenFieldId ? String(field.showWhenFieldId) : "",
      showWhenValue: field.showWhenValue
    });
  }

  function startNew() {
    setEditingId(-1);
    setDraft({
      label: "",
      help: "",
      kind: "text",
      required: true,
      options: "",
      mapsTo: "",
      showWhenFieldId: "",
      showWhenValue: ""
    });
  }

  async function save() {
    const body = {
      label: draft.label,
      help: draft.help,
      kind: draft.kind,
      required: draft.required,
      options: draft.options.split("\n").map((line) => line.trim()).filter(Boolean),
      mapsTo: draft.mapsTo,
      showWhenFieldId: draft.showWhenFieldId ? Number(draft.showWhenFieldId) : null,
      showWhenValue: draft.showWhenValue
    };

    try {
      onError("");
      if (editingId && editingId > 0) {
        await api(`/api/forms/fields/${editingId}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await api(`/api/forms/${formId}/fields`, { method: "POST", body: JSON.stringify(body) });
      }
      setEditingId(null);
      await onChanged();
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Could not save the question.");
    }
  }

  async function move(fieldId: number, direction: "up" | "down") {
    await api(`/api/forms/fields/${fieldId}`, { method: "PATCH", body: JSON.stringify({ move: direction }) });
    await onChanged();
  }

  async function remove(field: Field) {
    if (!window.confirm(`Remove "${field.label}"? Registrations already made keep their answer.`)) {
      return;
    }
    await api(`/api/forms/fields/${field.id}`, { method: "DELETE" });
    await onChanged();
  }

  return (
    <div className="fieldEditor">
      {fields.map((field, index) => (
        <div className="fieldRow" key={field.id}>
          <span className="fieldNum">{index + 1}</span>
          <span className="fieldLabelText">
            {field.label}
            {field.required ? <span className="req"> *</span> : null}
            {field.mapsTo ? <span className="groupTag">→ {field.mapsTo}</span> : null}
            {field.showWhenFieldId ? (
              <span className="groupTag">
                يظهر إذا: {fields.find((item) => item.id === field.showWhenFieldId)?.label.slice(0, 22) ?? "?"} ={" "}
                {field.showWhenValue}
              </span>
            ) : null}
          </span>
          <span className="hint">{KINDS.find((kind) => kind.value === field.kind)?.label}</span>
          <button className="secondary" disabled={index === 0} onClick={() => void move(field.id, "up")} type="button">
            ↑
          </button>
          <button
            className="secondary"
            disabled={index === fields.length - 1}
            onClick={() => void move(field.id, "down")}
            type="button"
          >
            ↓
          </button>
          <button className="secondary" onClick={() => startEdit(field)} type="button">
            Edit
          </button>
          <button className="secondary" onClick={() => void remove(field)} type="button">
            Remove
          </button>
        </div>
      ))}

      {editingId !== null ? (
        <div className="stepForm">
          <label className="full">
            <span>The question</span>
            <textarea
              onChange={(event) => setDraft({ ...draft, label: event.target.value })}
              rows={2}
              value={draft.label}
            />
          </label>
          <label className="full">
            <span>Help under it (optional)</span>
            <input onChange={(event) => setDraft({ ...draft, help: event.target.value })} value={draft.help} />
          </label>
          <label>
            <span>Answer type</span>
            <select
              onChange={(event) => setDraft({ ...draft, kind: event.target.value as Field["kind"] })}
              value={draft.kind}
            >
              {KINDS.map((kind) => (
                <option key={kind.value} value={kind.value}>
                  {kind.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Fills the contact&apos;s…</span>
            <select
              onChange={(event) => setDraft({ ...draft, mapsTo: event.target.value as Field["mapsTo"] })}
              value={draft.mapsTo}
            >
              <option value="">nothing</option>
              <option value="name">name</option>
              <option value="phone">phone</option>
              <option value="city">city</option>
            </select>
          </label>
          {draft.kind === "choice" || draft.kind === "multi" || draft.kind === "consent" ? (
            <label className="full">
              <span>Options — one per line</span>
              <textarea
                onChange={(event) => setDraft({ ...draft, options: event.target.value })}
                rows={4}
                value={draft.options}
              />
            </label>
          ) : null}
          <label className="full">
            <span>Show this question only when…</span>
            <select
              onChange={(event) =>
                setDraft({ ...draft, showWhenFieldId: event.target.value, showWhenValue: "" })
              }
              value={draft.showWhenFieldId}
            >
              <option value="">always show it</option>
              {fields
                .filter((item) => item.id !== editingId && item.options.length)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label.slice(0, 60)}
                  </option>
                ))}
            </select>
          </label>

          {draft.showWhenFieldId ? (
            <label className="full">
              <span>…was answered</span>
              <select
                onChange={(event) => setDraft({ ...draft, showWhenValue: event.target.value })}
                value={draft.showWhenValue}
              >
                <option value="">pick an answer…</option>
                {(fields.find((item) => String(item.id) === draft.showWhenFieldId)?.options ?? []).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="inlineCheck full">
            <input
              checked={draft.required}
              onChange={(event) => setDraft({ ...draft, required: event.target.checked })}
              type="checkbox"
            />
            <span>Must be answered</span>
          </label>
          <div className="full stepFormActions">
            <button disabled={!draft.label.trim()} onClick={() => void save()} type="button">
              {editingId > 0 ? "Save changes" : "Add the question"}
            </button>
            <button className="secondary" onClick={() => setEditingId(null)} type="button">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className="secondary" onClick={startNew} type="button">
          Add a question
        </button>
      )}
    </div>
  );
}
