"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { InfoTip } from "./InfoTip";
import { NewTemplateForm } from "./NewTemplateForm";

type Template = {
  name: string;
  language: string;
  category: string;
  status: string;
  bodyText: string;
  headerText: string | null;
  paramCount: number;
  alias?: string;
  frozen?: boolean;
  groups?: string[];
};

type Group = { id: number; name: string; templateNames: string[] };

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

const STATUS_LABEL: Record<string, string> = {
  APPROVED: "Approved",
  PENDING: "Waiting for Meta",
  REJECTED: "Refused",
  PAUSED: "Paused by Meta",
  DISABLED: "Disabled by Meta"
};

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [openName, setOpenName] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [showFrozen, setShowFrozen] = useState(false);
  const [newGroup, setNewGroup] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (refresh = false) => {
    try {
      const payload = await api(`/api/templates?all=1${refresh ? "&refresh=1" : ""}`);
      setTemplates(payload.templates ?? []);
      setGroups(payload.groups ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load templates.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveAlias(name: string) {
    try {
      setError("");
      await api("/api/templates/alias", { method: "POST", body: JSON.stringify({ name, alias: draft }) });
      setEditing(null);
      setDraft("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the name.");
    }
  }

  async function toggleFrozen(template: Template) {
    try {
      setError("");
      await api("/api/templates/freeze", {
        method: "POST",
        body: JSON.stringify({ name: template.name, frozen: !template.frozen })
      });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not change it.");
    }
  }

  async function addGroup() {
    if (!newGroup.trim()) {
      return;
    }
    try {
      setError("");
      await api("/api/template-groups", { method: "POST", body: JSON.stringify({ name: newGroup }) });
      setNewGroup("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the group.");
    }
  }

  async function setMembership(groupId: number, name: string, inGroup: boolean) {
    try {
      setError("");
      await api(`/api/template-groups/${groupId}`, {
        method: "POST",
        body: JSON.stringify({ action: inGroup ? "assign" : "remove", templateName: name })
      });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not change the group.");
    }
  }

  async function removeGroup(group: Group) {
    if (!window.confirm(`Delete the group "${group.name}"? The templates in it are untouched.`)) {
      return;
    }
    try {
      await api(`/api/template-groups/${group.id}`, { method: "DELETE" });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete the group.");
    }
  }

  const needle = query.trim().toLowerCase();
  const shown = templates
    .filter((item) => (showFrozen ? true : !item.frozen))
    .filter((item) => (groupFilter ? (item.groups ?? []).includes(groupFilter) : true))
    .filter(
      (item) =>
        !needle ||
        item.name.toLowerCase().includes(needle) ||
        (item.alias ?? "").toLowerCase().includes(needle) ||
        item.bodyText.toLowerCase().includes(needle)
    );

  const named = templates.filter((item) => item.alias).length;
  const frozenCount = templates.filter((item) => item.frozen).length;
  const waiting = templates.filter((item) => item.status === "PENDING").length;

  return (
    <div className="journeyPage">
      <header className="journeyHeader">
        <div>
          <Link className="backLink" href="/journeys">
            &larr; Journeys
          </Link>
          <h1>Templates</h1>
          <p className="hint">
            Every template on this WhatsApp account, and everything Afkar keeps about it that Meta does not: an
            internal name, the groups it belongs to, and whether it is still offered when building a path.
          </p>
        </div>
      </header>

      {error ? <p className="journeyError">{error}</p> : null}
      {note ? <p className="journeyNote">{note}</p> : null}

      <NewTemplateForm
        onCreated={async (message) => {
          setNote(message);
          setError("");
          await load(true);
        }}
        onError={setError}
      />

      <section className="groupBar">
        <span className="fieldLabel">
          Groups
          <InfoTip title="Groups">
            A shelf for templates that belong together — a cohort&apos;s week, a campaign, a season. A template can
            sit on several shelves. When building a step you can narrow the list to one group instead of reading
            through all {templates.length}.
          </InfoTip>
        </span>
        <div className="groupChips">
          <button
            className={groupFilter ? "chip" : "chip on"}
            onClick={() => setGroupFilter("")}
            type="button"
          >
            All
          </button>
          {groups.map((group) => (
            <span className="chipWrap" key={group.id}>
              <button
                className={groupFilter === group.name ? "chip on" : "chip"}
                onClick={() => setGroupFilter(groupFilter === group.name ? "" : group.name)}
                type="button"
              >
                {group.name} <small>{group.templateNames.length}</small>
              </button>
              <button aria-label={`Delete ${group.name}`} className="chipX" onClick={() => void removeGroup(group)} type="button">
                ×
              </button>
            </span>
          ))}
          <input
            onChange={(event) => setNewGroup(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void addGroup();
            }}
            placeholder="New group…"
            value={newGroup}
          />
        </div>
      </section>

      <div className="newPath">
        <input
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, internal name or text"
          value={query}
        />
        <label className="inlineCheck">
          <input checked={showFrozen} onChange={(event) => setShowFrozen(event.target.checked)} type="checkbox" />
          <span>Show frozen ({frozenCount})</span>
        </label>
        <span className="hint">
          {templates.length} templates · {named} named{waiting ? ` · ${waiting} waiting for Meta` : ""}
        </span>
      </div>

      {loading ? <p className="hint">Loading…</p> : null}
      {!loading && !shown.length ? <p className="hint">Nothing matches.</p> : null}

      {shown.map((template) => {
        const isOpen = openName === template.name;
        const isEditing = editing === template.name;

        return (
          <article className={template.frozen ? "templateRow frozen" : "templateRow"} key={`${template.name}:${template.language}`}>
            <header>
              <button
                aria-expanded={isOpen}
                className="templateToggle"
                onClick={() => setOpenName(isOpen ? null : template.name)}
                type="button"
              >
                <span aria-hidden className="chevron">
                  {isOpen ? "▾" : "▸"}
                </span>
                <span className="templateNames">
                  <code>{template.name}</code>
                  {template.alias ? (
                    <span className="alias">{template.alias}</span>
                  ) : (
                    <span className="alias none">no internal name</span>
                  )}
                  {(template.groups ?? []).map((group) => (
                    <span className="groupTag" key={group}>
                      {group}
                    </span>
                  ))}
                </span>
              </button>
              {template.status !== "APPROVED" ? (
                <span className={template.status === "REJECTED" ? "badge warn" : "badge"}>
                  {STATUS_LABEL[template.status] ?? template.status}
                </span>
              ) : null}
              <span className={template.category === "UTILITY" ? "badge" : "badge warn"}>{template.category}</span>
              <button
                className="secondary"
                onClick={() => {
                  setEditing(isEditing ? null : template.name);
                  setDraft(template.alias ?? "");
                }}
                type="button"
              >
                {isEditing ? "Cancel" : "Rename"}
              </button>
              <button className="secondary" onClick={() => void toggleFrozen(template)} type="button">
                {template.frozen ? "Bring back" : "Freeze"}
              </button>
            </header>

            {isEditing ? (
              <div className="renameRow">
                <input
                  autoFocus
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void saveAlias(template.name);
                  }}
                  placeholder="Internal name, e.g. الميزان - صباح اليوم الأول"
                  value={draft}
                />
                <button onClick={() => void saveAlias(template.name)} type="button">
                  Save
                </button>
                <span className="hint">Empty clears it. Only this nickname changes — Meta sees nothing.</span>
              </div>
            ) : null}

            {isOpen ? (
              <div className="templateBody">
                <div className="previewMeta">
                  <span>{template.language}</span>
                  {template.paramCount ? <span>{template.paramCount} variable(s)</span> : null}
                  {template.frozen ? <span className="warnText">Frozen — not offered when building a step</span> : null}
                </div>
                {template.headerText ? <p className="templateHeaderText">{template.headerText}</p> : null}
                <p className="previewBody">{template.bodyText || "(this template has no body text)"}</p>

                {groups.length ? (
                  <div className="groupPicker">
                    <span className="fieldLabel">In groups</span>
                    {groups.map((group) => {
                      const inGroup = (template.groups ?? []).includes(group.name);
                      return (
                        <label className="inlineCheck" key={group.id}>
                          <input
                            checked={inGroup}
                            onChange={(event) => void setMembership(group.id, template.name, event.target.checked)}
                            type="checkbox"
                          />
                          <span>{group.name}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
