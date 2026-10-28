"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { readImportList, splitUsable, type ImportRow } from "@/app/lib/import-rows";
import { members as membersCount, rows as rowsCount } from "../../format";

type Group = { id: number; name: string; memberCount: number };
type Failure = { row: ImportRow; error: string };
type Result = { created: number; existing: number; failed: Failure[] };

/** الخادم بيرفض فوق 2000 بالطلب الواحد، والدفعة الصغيرة بتخلّي التقدّم يبيّن. */
const BATCH = 400;

/**
 * أسباب الفشل بترجع من المسار بالإنجليزي — وهو مسار بتستعمله شاشات تانية،
 * فما منغيّره. بتتترجم هون، وأي سبب جديد بينعرض كما هو بدل ما يختفي.
 */
const WHY: Array<[RegExp, string]> = [
  [/missing phone/i, "ما في رقم بالسطر."],
  [/invalid phone/i, "الرقم مش رقم واتساب صالح."],
  [/full international/i, "الرقم ناقصه مفتاح الدولة — مثلاً ‎+972501234567‎."],
  [/already exists|unique/i, "في منتسب تاني بنفس الرقم."]
];

function reason(text: string) {
  return WHY.find(([pattern]) => pattern.test(text))?.[1] ?? text;
}

export function ImportMembers({ groups }: { groups: Group[] }) {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [fileName, setFileName] = useState("");
  const [groupId, setGroupId] = useState<number | "">("");
  const [newGroup, setNewGroup] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  const { rows, duplicates } = useMemo(() => readImportList(raw), [raw]);
  const { usable, missingPhone } = useMemo(() => splitUsable(rows), [rows]);

  async function readFile(file: File | null) {
    if (!file) {
      return;
    }
    setFileName(file.name);
    setRaw(await file.text());
    setResult(null);
  }

  async function run() {
    setBusy(true);
    setError("");

    try {
      let target = groupId === "" ? null : groupId;

      if (newGroup.trim()) {
        const response = await fetch("/api/groups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newGroup })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error ?? "ما قدرنا نعمل المجموعة.");
        }
        target = payload.group.id;
      }

      const totals: Result = { created: 0, existing: 0, failed: [] };

      for (let start = 0; start < usable.length; start += BATCH) {
        const batch = usable.slice(start, start + BATCH);
        setProgress(`${Math.min(start + batch.length, usable.length)} من ${usable.length}…`);
        const response = await fetch("/api/members/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: batch, groupId: target })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error ?? "ما زبط الاستيراد.");
        }
        totals.created += payload.created;
        totals.existing += payload.existing;
        totals.failed.push(...(payload.failed ?? []));
      }

      setResult(totals);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ما زبط الاستيراد.");
    }

    setProgress("");
    setBusy(false);
  }

  if (result) {
    return (
      <section className="crmCard" data-tone="olive">
        <header>
          <span className="crmDot" />
          <h2>خلص الاستيراد</h2>
        </header>

        <div className="crmPad crmStats">
          <div className="crmStat" data-tone="olive">
            <span className="statFigure">{result.created}</span>
            <span className="statName">انضافوا جداد</span>
          </div>
          <div className="crmStat" data-tone="sage">
            <span className="statFigure">{result.existing}</span>
            <span className="statName">كانوا موجودين</span>
          </div>
          <div className="crmStat" data-tone={result.failed.length ? "clay" : "sage"}>
            <span className="statFigure">{result.failed.length}</span>
            <span className="statName">ما زبطوا</span>
          </div>
        </div>

        {result.failed.length > 0 && (
          <div className="crmPad importFailures">
            {/* السطر اللي فشل بينعرض باسمه وسببه — «3 فشلوا» ما بتقول مين. */}
            {result.failed.slice(0, 12).map((failure, at) => (
              <p key={at}>
                <strong>{failure.row.name || failure.row.phone || "سطر فاضي"}</strong>
                {failure.row.name && failure.row.phone ? (
                  <>
                    {" · "}
                    <span className="crmLtr">{failure.row.phone}</span>
                  </>
                ) : null}{" "}
                — {reason(failure.error)}
              </p>
            ))}
            {result.failed.length > 12 ? (
              <p className="crmNote">و{result.failed.length - 12} غيرهن.</p>
            ) : null}
          </div>
        )}

        <div className="crmPad crmFilters">
          <Link className="crmBtn primary" href="/new/people">
            شوفي المنتسبين
          </Link>
          <button
            className="crmBtn quiet"
            onClick={() => {
              setResult(null);
              setRaw("");
              setFileName("");
              setNewGroup("");
            }}
            type="button"
          >
            استيراد لائحة تانية
          </button>
        </div>
      </section>
    );
  }

  return (
    <>
      {error ? <p className="crmError">{error}</p> : null}

      <section className="crmCard" data-tone="clay">
        <header>
          <span className="crmDot" />
          <h2>اللائحة</h2>
        </header>

        <div className="crmPad">
          <label className="importFile">
            <span>اختاري ملف CSV أو TXT</span>
            <input
              accept=".csv,.txt,.tsv"
              onChange={(event) => void readFile(event.target.files?.[0] ?? null)}
              type="file"
            />
          </label>
          {fileName ? <p className="crmNote crmLtr">{fileName}</p> : null}

          <textarea
            dir="auto"
            onChange={(event) => {
              setRaw(event.target.value);
              setResult(null);
            }}
            placeholder={"ليلى,0521234567,إكسترا\nهدى,0531234567\n0541234567"}
            rows={7}
            value={raw}
          />
          <p className="crmNote">
            بيقرا الاسم والرقم والملاحظات، أو عمود أرقام لحاله، أو ملف مصدَّر بسطر عناوين. الفاصلة
            والفاصلة المنقوطة والتاب كلهن بيمشوا.
          </p>
        </div>
      </section>

      {rows.length > 0 && (
        <section className="crmCard" data-tone="sage">
          <header>
            <span className="crmDot" />
            <h2>جاهز للاستيراد</h2>
            <span className="crmPill tone spacer">{membersCount(usable.length)}</span>
            {missingPhone.length > 0 && (
              <span className="crmPill warn">{rowsCount(missingPhone.length)} بلا رقم</span>
            )}
          </header>

          {/* المتكرّر انشال قبل ما يوصل هون: نفس الرقم مكتوب بأربع صيغ هو
              شخص واحد. بيتقال، لأن «استوردي 38» بينما اللائحة 43 سطر بتخلّي
              حدا يظن إنه ضاع إشي. */}
          {duplicates > 0 && (
            <p className="crmPad crmNote" style={{ paddingBottom: 0 }}>
              {`انشال ${rowsCount(duplicates)} — نفس الرقم مكتوب أكثر من مرة.`}
            </p>
          )}

          <div className="crmPad">
            <table className="importPreview">
              <tbody>
                {usable.slice(0, 6).map((row, at) => (
                  <tr key={at}>
                    <td dir="auto">{row.name || "—"}</td>
                    <td className="crmLtr">{row.phone}</td>
                    <td dir="auto">{row.notes || row.city || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {usable.length > 6 ? <p className="crmNote">{`و${usable.length - 6} غيرهن.`}</p> : null}

            {missingPhone.length > 0 && (
              <p className="crmNote" style={{ marginTop: 12 }}>
                {`🔴 رح ينشال ${rowsCount(missingPhone.length)} بلا رقم — الرقم هو اللي بتوصل فيه الرسالة`}
                {missingPhone[0]?.name ? ` (أولهن ${missingPhone[0].name})` : ""}.
              </p>
            )}
          </div>
        </section>
      )}

      <section className="crmCard" data-tone="olive">
        <header>
          <span className="crmDot" />
          <h2>لوين بيروحوا</h2>
        </header>

        <div className="crmPad crmFilters">
          <label className="crmField">
            <span>مجموعة موجودة</span>
            <select
              disabled={Boolean(newGroup.trim())}
              onChange={(event) => setGroupId(event.target.value ? Number(event.target.value) : "")}
              value={groupId}
            >
              <option value="">بلا مجموعة</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name} ({group.memberCount})
                </option>
              ))}
            </select>
          </label>
          <label className="crmField">
            <span>…أو مجموعة جديدة</span>
            <input
              onChange={(event) => setNewGroup(event.target.value)}
              placeholder="مسار إكسترا"
              value={newGroup}
            />
          </label>
        </div>

        <div className="crmPad crmFilters" style={{ borderTop: "1px solid var(--line-soft)" }}>
          <button
            className="crmBtn primary"
            disabled={busy || usable.length === 0}
            onClick={() => void run()}
            type="button"
          >
            {busy ? progress || "عم بنستورد…" : `استوردي ${usable.length}`}
          </button>
          <span className="crmNote" style={{ alignSelf: "center" }}>
            اللي رقمه موجود عنا من قبل ما بينعاد — بينضاف للمجموعة وبس.
          </span>
        </div>
      </section>
    </>
  );
}
