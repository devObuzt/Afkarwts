"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  PERMISSION_INFO,
  ROLES,
  ROLE_DETAIL,
  ROLE_LABEL,
  ROLE_PRESET,
  type Permission,
  type Role
} from "@/app/lib/users/permissions";

type User = {
  id: number;
  name: string;
  username: string;
  role: Role;
  permissions: Permission[];
  active: boolean;
  lastSeenAt: string | null;
  mustChangePassword: boolean;
};

const GROUPS = [...new Set(PERMISSION_INFO.map((info) => info.group))];

function Checkboxes({
  granted,
  disabled,
  onToggle
}: {
  granted: Permission[];
  disabled: boolean;
  onToggle: (permission: Permission, on: boolean) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {GROUPS.map((group) => (
        <div key={group}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--faint)", marginBottom: 8 }}>{group}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {PERMISSION_INFO.filter((info) => info.group === group).map((info) => (
              <label
                key={info.key}
                style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 13.5, lineHeight: 1.7 }}
              >
                <input
                  checked={granted.includes(info.key)}
                  disabled={disabled}
                  onChange={(event) => onToggle(info.key, event.target.checked)}
                  style={{ width: 17, height: 17, minHeight: 0, marginTop: 3, flex: "none", accentColor: "var(--tone-ink)" }}
                  type="checkbox"
                />
                <span>
                  <strong style={{ fontWeight: 600, color: "var(--ink)" }}>{info.label}</strong>
                  {info.sensitive && (
                    <span className="crmPill alert" style={{ marginInlineStart: 7, fontSize: 11 }}>
                      حسّاسة
                    </span>
                  )}
                  <span style={{ display: "block", color: "var(--muted)", fontSize: 12.5 }}>{info.detail}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function UsersClient({ users, meId }: { users: User[]; meId: number }) {
  const router = useRouter();
  const [editing, setEditing] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<{ name: string; username: string; password: string; role: Role; permissions: Permission[] }>({
    name: "",
    username: "",
    password: "",
    role: "assistant",
    permissions: ROLE_PRESET.assistant
  });
  const [edit, setEdit] = useState<{ name: string; role: Role; permissions: Permission[]; password: string }>({
    name: "",
    role: "assistant",
    permissions: [],
    password: ""
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(path: string, method: string, body: unknown) {
    setBusy(true);
    setError("");
    const response = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setError(payload.error ?? "ما زبطت.");
      return false;
    }

    router.refresh();
    return true;
  }

  function openEdit(user: User) {
    setEditing(user.id);
    setAdding(false);
    setError("");
    setEdit({ name: user.name, role: user.role, permissions: [...user.permissions], password: "" });
  }

  return (
    <>
      <section className="crmCard" data-tone="mauve">
        <header>
          <span className="crmDot" />
          <h2>المستخدمين</h2>
          <button
            className="crmBtn quiet spacer"
            onClick={() => {
              setAdding((value) => !value);
              setEditing(null);
              setError("");
            }}
            type="button"
          >
            {adding ? "إلغاء" : "+ مستخدم جديد"}
          </button>
        </header>

        {adding && (
          <div className="crmPad" style={{ borderBottom: "1px solid var(--line-soft)" }}>
            <div className="crmSearch">
              <label className="crmField" style={{ flex: "1 1 200px" }}>
                <span>الاسم</span>
                <input onChange={(event) => setDraft({ ...draft, name: event.target.value })} type="text" value={draft.name} />
              </label>
              <label className="crmField" style={{ flex: "1 1 180px" }}>
                <span>اسم المستخدم (إنجليزي)</span>
                <input
                  onChange={(event) => setDraft({ ...draft, username: event.target.value })}
                  placeholder="maryam"
                  style={{ direction: "ltr", textAlign: "right" }}
                  type="text"
                  value={draft.username}
                />
              </label>
              <label className="crmField" style={{ flex: "1 1 180px" }}>
                <span>كلمة سر مؤقتة</span>
                <input
                  onChange={(event) => setDraft({ ...draft, password: event.target.value })}
                  style={{ direction: "ltr", textAlign: "right" }}
                  type="text"
                  value={draft.password}
                />
              </label>
            </div>

            <div style={{ marginTop: 14 }}>
              <div className="crmField">
                <span>الدور — بيعبّي الصلاحيات، وبعدها بتعدّليها وحدة وحدة</span>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {ROLES.map((role) => (
                    <button
                      className={draft.role === role ? "crmBtn primary quiet" : "crmBtn quiet"}
                      key={role}
                      onClick={() => setDraft({ ...draft, role, permissions: [...ROLE_PRESET[role]] })}
                      type="button"
                    >
                      {ROLE_LABEL[role]}
                    </button>
                  ))}
                </div>
              </div>
              <p className="crmNote" style={{ marginTop: 7 }}>
                {ROLE_DETAIL[draft.role]}
              </p>
            </div>

            <div style={{ marginTop: 16 }}>
              <Checkboxes
                disabled={draft.role === "owner"}
                granted={draft.permissions}
                onToggle={(permission, on) =>
                  setDraft({
                    ...draft,
                    permissions: on
                      ? [...draft.permissions, permission]
                      : draft.permissions.filter((item) => item !== permission)
                  })
                }
              />
              {draft.role === "owner" && (
                <p className="crmNote" style={{ marginTop: 10 }}>
                  المالكة عندها كل الصلاحيات دايماً — ما بتنسحب منها ولا وحدة.
                </p>
              )}
            </div>

            {error && (
              <p className="crmError" style={{ marginTop: 12 }}>
                {error}
              </p>
            )}

            <button
              className="crmBtn primary"
              disabled={busy || !draft.username || draft.password.length < 8}
              onClick={async () => {
                if (await send("/api/users", "POST", draft)) {
                  setAdding(false);
                  setDraft({ name: "", username: "", password: "", role: "assistant", permissions: ROLE_PRESET.assistant });
                }
              }}
              style={{ marginTop: 14 }}
              type="button"
            >
              {busy ? "عمّال يضيف…" : "أضيفي المستخدم"}
            </button>
          </div>
        )}

        {users.map((user) => (
          <div key={user.id}>
            <div className="crmRow">
              <span className="grow">
                <span className="crmRowTitle" style={{ display: "block" }}>
                  {user.name}
                  {user.id === meId && (
                    <span className="crmPill tone" style={{ marginInlineStart: 8 }}>
                      إنتي
                    </span>
                  )}
                  {!user.active && (
                    <span className="crmPill" style={{ marginInlineStart: 8 }}>
                      معطّل
                    </span>
                  )}
                  {user.mustChangePassword && user.active && (
                    <span className="crmPill open" style={{ marginInlineStart: 8 }}>
                      لازم يغيّر كلمة السر
                    </span>
                  )}
                </span>
                <span className="crmRowDetail" style={{ display: "block" }}>
                  <span className="crmLtr">{user.username}</span> · {ROLE_LABEL[user.role]} ·{" "}
                  {user.permissions.length} صلاحية
                  {user.lastSeenAt ? ` · آخر دخول ${user.lastSeenAt.slice(0, 10)}` : " · ما فات بعد"}
                </span>
              </span>
              <button className="crmBtn quiet" onClick={() => (editing === user.id ? setEditing(null) : openEdit(user))} type="button">
                {editing === user.id ? "سكّري" : "صلاحياته"}
              </button>
            </div>

            {editing === user.id && (
              <div className="crmPad" style={{ background: "var(--paper)", borderBottom: "1px solid var(--line-soft)" }}>
                <div className="crmSearch">
                  <label className="crmField" style={{ flex: "1 1 200px" }}>
                    <span>الاسم</span>
                    <input onChange={(event) => setEdit({ ...edit, name: event.target.value })} type="text" value={edit.name} />
                  </label>
                  <label className="crmField" style={{ flex: "1 1 200px" }}>
                    <span>كلمة سر جديدة (اتركيها فاضية إذا ما بدك تغيّريها)</span>
                    <input
                      onChange={(event) => setEdit({ ...edit, password: event.target.value })}
                      style={{ direction: "ltr", textAlign: "right" }}
                      type="text"
                      value={edit.password}
                    />
                  </label>
                </div>

                <div className="crmField" style={{ marginTop: 14 }}>
                  <span>الدور</span>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {ROLES.map((role) => (
                      <button
                        className={edit.role === role ? "crmBtn primary quiet" : "crmBtn quiet"}
                        key={role}
                        onClick={() => setEdit({ ...edit, role, permissions: [...ROLE_PRESET[role]] })}
                        type="button"
                      >
                        {ROLE_LABEL[role]}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ marginTop: 16 }}>
                  <Checkboxes
                    disabled={edit.role === "owner"}
                    granted={edit.permissions}
                    onToggle={(permission, on) =>
                      setEdit({
                        ...edit,
                        permissions: on
                          ? [...edit.permissions, permission]
                          : edit.permissions.filter((item) => item !== permission)
                      })
                    }
                  />
                </div>

                {error && (
                  <p className="crmError" style={{ marginTop: 12 }}>
                    {error}
                  </p>
                )}

                <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                  <button
                    className="crmBtn primary"
                    disabled={busy}
                    onClick={async () => {
                      const body: Record<string, unknown> = {
                        name: edit.name,
                        role: edit.role,
                        permissions: edit.permissions
                      };
                      if (edit.password) {
                        body.password = edit.password;
                      }
                      if (await send(`/api/users/${user.id}`, "PATCH", body)) {
                        setEditing(null);
                      }
                    }}
                    type="button"
                  >
                    {busy ? "عمّال يحفظ…" : "احفظي"}
                  </button>

                  {user.id !== meId && (
                    <button
                      className={user.active ? "crmBtn danger" : "crmBtn"}
                      disabled={busy}
                      onClick={() => send(`/api/users/${user.id}`, "PATCH", { active: !user.active })}
                      type="button"
                    >
                      {user.active ? "عطّلي الحساب" : "رجّعي شغّليه"}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </section>
    </>
  );
}
