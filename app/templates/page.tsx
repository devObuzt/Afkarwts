"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Template = {
  name: string;
  language: string;
  category: string;
  bodyText: string;
  headerText: string | null;
  paramCount: number;
  alias?: string;
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

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [openName, setOpenName] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const payload = await api("/api/templates");
      setTemplates(payload.templates ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load templates.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(name: string) {
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

  const needle = query.trim().toLowerCase();
  const shown = needle
    ? templates.filter(
        (item) =>
          item.name.toLowerCase().includes(needle) ||
          (item.alias ?? "").toLowerCase().includes(needle) ||
          item.bodyText.toLowerCase().includes(needle)
      )
    : templates;

  const named = templates.filter((item) => item.alias).length;

  return (
    <div className="journeyPage">
      <header className="journeyHeader">
        <div>
          <Link className="backLink" href="/journeys">
            &larr; Journeys
          </Link>
          <h1>Templates</h1>
          <p className="hint">
            Every approved template on this WhatsApp account. The <strong>internal name</strong> is ours alone — it
            makes a list of near-identical names readable and is never sent to Meta. Sending always uses the real
            template name.
          </p>
        </div>
      </header>

      {error ? <p className="journeyError">{error}</p> : null}

      <div className="newPath">
        <input
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, internal name or text"
          value={query}
        />
        <span className="hint">
          {templates.length} templates &middot; {named} named
        </span>
      </div>

      {loading ? <p className="hint">Loading…</p> : null}
      {!loading && !shown.length ? <p className="hint">Nothing matches.</p> : null}

      {shown.map((template) => {
        const isOpen = openName === template.name;
        const isEditing = editing === template.name;

        return (
          <article className="templateRow" key={`${template.name}:${template.language}`}>
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
                </span>
              </button>
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
            </header>

            {isEditing ? (
              <div className="renameRow">
                <input
                  autoFocus
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void save(template.name);
                  }}
                  placeholder="Internal name, e.g. الميزان - صباح اليوم الأول"
                  value={draft}
                />
                <button onClick={() => void save(template.name)} type="button">
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
                </div>
                {template.headerText ? <p className="templateHeaderText">{template.headerText}</p> : null}
                <p className="previewBody">{template.bodyText || "(this template has no body text)"}</p>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
