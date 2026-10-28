"use client";

import { useCallback, useEffect, useState } from "react";
import { variables } from "../format";
import { NewTemplate } from "./NewTemplate";
import { Tip } from "./Tip";

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

const STATUS: Record<string, { label: string; pill: string }> = {
  APPROVED: { label: "معتمد", pill: "crmPill live" },
  PENDING: { label: "بانتظار ميتا", pill: "crmPill alert" },
  REJECTED: { label: "مرفوض", pill: "crmPill warn" },
  PAUSED: { label: "موقّف من ميتا", pill: "crmPill warn" },
  DISABLED: { label: "معطّل من ميتا", pill: "crmPill warn" }
};

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? `ما زبطت (${response.status}).`);
  }
  return payload;
}

export function TemplatesBoard({ canManage }: { canManage: boolean }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [openName, setOpenName] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
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
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ما قدرنا نجيب القوالب.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function guard(work: () => Promise<unknown>, fallback: string) {
    try {
      setError("");
      await work();
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : fallback);
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
  const frozen = templates.filter((item) => item.frozen).length;
  const waiting = templates.filter((item) => item.status === "PENDING").length;

  return (
    <>
      {error ? <p className="crmError">{error}</p> : null}
      {note ? <p className="crmNote">{note}</p> : null}

      {canManage && (
        <NewTemplate
          onCreated={async (message) => {
            setNote(message);
            setError("");
            await load(true);
          }}
          onError={setError}
        />
      )}

      <section className="crmCard" data-tone="sage">
        <header>
          <span className="crmDot" />
          <h2>المجموعات</h2>
          <Tip title="المجموعات">
            رفّ للقوالب اللي بتروح مع بعض — أسبوع دفعة، حملة، موسم. القالب فيه يقعد على كذا رفّ. وقت ما
            تبني خطوة بتضيّقي اللائحة على مجموعة بدل ما تقري الـ{templates.length} كلهن.
          </Tip>
        </header>

        <div className="crmPad crmChips">
          <button
            className={groupFilter ? "crmChip" : "crmChip on"}
            onClick={() => setGroupFilter("")}
            type="button"
          >
            الكل
          </button>
          {groups.map((group) => (
            <span className="crmChipWrap" key={group.id}>
              <button
                className={groupFilter === group.name ? "crmChip on" : "crmChip"}
                onClick={() => setGroupFilter(groupFilter === group.name ? "" : group.name)}
                type="button"
              >
                {group.name} <small>{group.templateNames.length}</small>
              </button>
              {canManage && (
                <button
                  aria-label={`احذفي ${group.name}`}
                  className="crmChipX"
                  onClick={() =>
                    void (window.confirm(`تنحذف مجموعة «${group.name}»؟ القوالب اللي فيها ما بتتأثّر.`) &&
                      guard(
                        () => api(`/api/template-groups/${group.id}`, { method: "DELETE" }),
                        "ما قدرنا نحذف المجموعة."
                      ))
                  }
                  type="button"
                >
                  ×
                </button>
              )}
            </span>
          ))}
          {canManage && (
            <input
              className="crmChipInput"
              onChange={(event) => setNewGroup(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && newGroup.trim()) {
                  void guard(
                    () => api("/api/template-groups", { method: "POST", body: JSON.stringify({ name: newGroup }) }),
                    "ما قدرنا نعمل المجموعة."
                  ).then(() => setNewGroup(""));
                }
              }}
              placeholder="مجموعة جديدة…"
              value={newGroup}
            />
          )}
        </div>
      </section>

      <form className="crmCard crmPad crmFilters" onSubmit={(event) => event.preventDefault()}>
        <label className="crmField">
          <span>بحث بالاسم أو بالاسم الداخلي أو بنص الرسالة</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="الميزان · clean_week1 · صباح الخير"
            type="search"
            value={query}
          />
        </label>
        <label className="crmCheck">
          <input checked={showFrozen} onChange={(event) => setShowFrozen(event.target.checked)} type="checkbox" />
          <span>اعرضي المجمّدة ({frozen})</span>
        </label>
        <button className="crmBtn quiet" onClick={() => void load(true)} type="button">
          حدّثي من ميتا
        </button>
        <span className="crmNote" style={{ alignSelf: "center" }}>
          {templates.length} قالب · {named} إلهن اسم عربي
          {waiting ? ` · ${waiting} بانتظار ميتا` : ""}
        </span>
      </form>

      <section className="crmCard" data-tone="clay">
        <header>
          <span className="crmDot" />
          <h2>
            {loading ? "عم بنجيب القوالب…" : `${shown.length} من ${templates.length}`}
          </h2>
        </header>

        {!loading && shown.length === 0 ? (
          <p className="crmEmpty">ما في قالب بيطابق.</p>
        ) : (
          shown.map((template) => {
            const isOpen = openName === template.name;
            const isRenaming = renaming === template.name;
            const status = STATUS[template.status];

            return (
              <div
                className={template.frozen ? "tplRow isFrozen" : "tplRow"}
                key={`${template.name}:${template.language}`}
              >
                <div className="crmRow">
                  <button
                    aria-expanded={isOpen}
                    className="grow tplOpen"
                    onClick={() => setOpenName(isOpen ? null : template.name)}
                    type="button"
                  >
                    <span className="crmRowTitle">
                      {/* الاسم العربي أولاً: هو اللي بيعرّف القالب لمين
                          بيبني مسار. اسم ميتا تقني وبيضل تحت. */}
                      {template.alias || <span className="tplNoName">بلا اسم عربي</span>}
                      {(template.groups ?? []).map((group) => (
                        <span className="crmPill tone" key={group}>
                          {group}
                        </span>
                      ))}
                    </span>
                    <span className="crmRowDetail">
                      <code className="crmLtr">{template.name}</code>
                    </span>
                  </button>

                  {status && template.status !== "APPROVED" ? (
                    <span className={status.pill}>{status.label}</span>
                  ) : null}
                  <span className={template.category === "UTILITY" ? "crmPill" : "crmPill warn"}>
                    {template.category === "UTILITY" ? "خدمية" : "تسويقية"}
                  </span>

                  {canManage && (
                    <button
                      className="crmBtn quiet"
                      onClick={() => {
                        setRenaming(isRenaming ? null : template.name);
                        setDraft(template.alias ?? "");
                      }}
                      type="button"
                    >
                      {isRenaming ? "إلغاء" : "سمّيها"}
                    </button>
                  )}
                  {canManage && (
                    <button
                      className="crmBtn quiet"
                      onClick={() =>
                        void guard(
                          () =>
                            api("/api/templates/freeze", {
                              method: "POST",
                              body: JSON.stringify({ name: template.name, frozen: !template.frozen })
                            }),
                          "ما زبطت."
                        )
                      }
                      type="button"
                    >
                      {template.frozen ? "رجّعيها" : "جمّديها"}
                    </button>
                  )}
                </div>

                {isRenaming && (
                  <div className="crmPad tplRename">
                    <input
                      autoFocus
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          void guard(
                            () =>
                              api("/api/templates/alias", {
                                method: "POST",
                                body: JSON.stringify({ name: template.name, alias: draft })
                              }),
                            "ما قدرنا نحفظ الاسم."
                          ).then(() => setRenaming(null));
                        }
                      }}
                      placeholder="الميزان — صباح اليوم الأول"
                      value={draft}
                    />
                    <button
                      className="crmBtn primary"
                      onClick={() =>
                        void guard(
                          () =>
                            api("/api/templates/alias", {
                              method: "POST",
                              body: JSON.stringify({ name: template.name, alias: draft })
                            }),
                          "ما قدرنا نحفظ الاسم."
                        ).then(() => setRenaming(null))
                      }
                      type="button"
                    >
                      احفظي
                    </button>
                    <span className="crmNote">فاضي بيمحيه. هاد اسم إلنا — ميتا ما بتشوفه.</span>
                  </div>
                )}

                {isOpen && (
                  <div className="crmPad tplBody">
                    <p className="crmRowDetail" style={{ marginTop: 0 }}>
                      <span className="crmLtr">{template.language}</span>
                      {` · ${variables(template.paramCount)}`}
                      {template.frozen ? " · مجمّدة، ما بتنعرض وقت بناء خطوة" : ""}
                    </p>
                    {template.headerText ? <p className="tplHeader">{template.headerText}</p> : null}
                    <p className="tplText">{template.bodyText || "(هاد القالب بلا نص)"}</p>

                    {canManage && groups.length > 0 && (
                      <div className="tplGroups">
                        <span className="crmRowDetail">بأي مجموعات</span>
                        {groups.map((group) => (
                          <label className="crmCheck" key={group.id}>
                            <input
                              checked={(template.groups ?? []).includes(group.name)}
                              onChange={(event) =>
                                void guard(
                                  () =>
                                    api(`/api/template-groups/${group.id}`, {
                                      method: "POST",
                                      body: JSON.stringify({
                                        action: event.target.checked ? "assign" : "remove",
                                        templateName: template.name
                                      })
                                    }),
                                  "ما قدرنا نغيّر المجموعة."
                                )
                              }
                              type="checkbox"
                            />
                            <span>{group.name}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </section>
    </>
  );
}
