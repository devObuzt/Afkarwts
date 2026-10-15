import Link from "next/link";
import { notFound } from "next/navigation";
import { getForm } from "@/app/lib/forms/store";
import {
  columnWidths,
  duplicateCount,
  headerKey,
  isNumeric,
  printHeader,
  rejectedCount,
  searchRows,
  submissionGrid,
  viewQuery
} from "@/app/lib/forms/report";
import { requireUser } from "@/app/lib/users/current";
import { DeleteMark } from "./DeleteMark";
import { DuplicateMark } from "./DuplicateMark";
import { RestoreMark } from "./RestoreMark";
import { SearchBox } from "./SearchBox";
import { EditableCell } from "./EditableCell";
import { HebrewCell } from "./HebrewCell";
import { PdfButton } from "./PdfButton";
import { can } from "@/app/lib/users/permissions";

export const dynamic = "force-dynamic";

const STATES = [
  { key: "", label: "الكل" },
  { key: "added", label: "في المجموعة" },
  { key: "new", label: "بانتظار المراجعة" },
  // A rejected registration is out of «الكل» and out of every export —
  // this tab is the only place it still appears, and the only way back.
  { key: "rejected", label: "المرفوضة" },
  // Not a state the registration carries — a view of the table. Kept
  // beside the others because it is the same question: which rows now?
  { key: "duplicates", label: "المكررات" }
];

/**
 * The cohort's registrations as the table Afkar reads them in: one row per
 * person, every question across the top. It is the shape the answer is
 * wanted in — who is pregnant, who takes what — before a week of
 * programmes is written.
 */
export default async function ReportPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ state?: string; print?: string; q?: string }>;
}) {
  const user = await requireUser("journeys.view");
  const query = await searchParams;
  const form = getForm(Number((await params).id));

  if (!form) {
    notFound();
  }

  // The answers are the medical file; the table is not a way around that.
  if (!can(user, "people.health")) {
    return (
      <div className="crmPage">
        <Link className="crmBack" href="/new/paths">
          ← المسارات
        </Link>
        <p className="crmEmpty">
          هذا الجدول يحوي الإجابات الصحية كاملة، وصلاحية «عرض الإجابات الصحية» غير معطاة لحسابك.
        </p>
      </div>
    );
  }

  const state = STATES.some((option) => option.key === query.state) ? (query.state ?? "") : "";
  const onlyDuplicates = state === "duplicates";
  // «المكررات» is not a state in the database: the grid is built whole and
  // then narrowed, because a row only knows it has a twin once every row
  // has been read.
  const grid = submissionGrid(form.id, { state: onlyDuplicates ? undefined : state || undefined })!;
  if (onlyDuplicates) {
    grid.rows = grid.rows.filter((row) => row.duplicateOf.length > 0);
  }
  // Searching the whole row, because what you remember about a woman is
  // rarely the field it lives in. Digits are compared as digits, so
  // «054-123» finds a phone the form stored as «+972 54-123».
  const search = (query.q ?? "").trim();
  grid.rows = searchRows(grid.rows, search);
  const view = viewQuery({ state, q: search });
  const printing = query.print === "1";
  // Correcting in place needs both: the form permission and the right to
  // see the answers — the same pair the save route enforces, so a cell is
  // never offered to somebody the server would refuse. Never while
  // printing: the PDF is a reading of the table, not a way into it.
  const editable = !printing && can(user, "forms.manage");
  const canReject = can(user, "leads.review");
  // Erasing is not rejecting: it is gated on the one permission already
  // described to its holder as irreversible, and never offered on paper.
  const canDelete = !printing && can(user, "people.delete");
  // The form's own count, not the current view's — see duplicateCount.
  const duplicates = duplicateCount(form.id);
  const rejected = rejectedCount(form.id);
  // One extra column carries the row's action, and which action depends on
  // the view: the duplicate mark normally, the way back in «المرفوضة».
  // Keeping it to a single column is what keeps the colgroup honest — a
  // second one would have to be paid for out of the same 100%.
  const viewingRejected = state === "rejected";
  const markColumn = !printing && (viewingRejected || duplicates > 0 || canDelete);
  // Two controls need more room than a pill. One number, used by both the
  // colgroup and the share it is paid for with, so they cannot disagree.
  const markWidth = canDelete ? 10 : 6;
  const markHeading = viewingRejected ? "إرجاع" : canDelete ? "إجراءات" : "تكرار";
  // Weighted by content: a phone does not need a consent paragraph's room.
  // The Arabic town column is dropped: «البلدة بالعبرية» already carries
  // the same answer in the form the records use. One list drives the
  // headings, the cells and the widths so they cannot drift apart.
  const shown = grid.columns.map((_, index) => index).filter((index) => index !== grid.cityColumn);
  const widths = columnWidths(grid);
  // The duplicate mark is a column too. Without its own width the colgroup
  // is one short and every width lands on the cell to its left — the
  // answers shift and the id prints under the date. The 6% comes off the
  // rest proportionally rather than out of the total, which has to stay 100.
  // Every column drawn outside `columnWidths` has to be paid for out of
  // the same 100%: the duplicate mark when there is one, and the two
  // Hebrew columns always. A colgroup that is short puts every answer
  // under the wrong heading.
  const extra = (markColumn ? markWidth : 0) + 18;
  // Scaled against the widths actually drawn, not against 100. Dropping the
  // Arabic town column took its share of the row with it, and the colgroup
  // came out of production at 95% — the counts were right, so nothing
  // shifted, but the table sat narrower than the sheet. Dividing by what is
  // kept puts it back at 100 whichever column is dropped.
  const num = (width: string) => Number(width.replace("%", ""));
  const keptTotal = num(widths[0]) + num(widths[1]) + shown.reduce((sum, index) => sum + num(widths[index + 2]), 0);
  const scale = (100 - extra) / (keptTotal || 1);
  const shrink = (width: string) => `${Math.round(num(width) * scale * 100) / 100}%`;
  const laidOut = [
    shrink(widths[0]),
    ...(markColumn ? [`${markWidth}%`] : []),
    shrink(widths[1]),
    "9%",
    "9%",
    ...shown.map((index) => shrink(widths[index + 2]))
  ];
  const key = headerKey(grid.columns);

  return (
    <div className={printing ? "crmPage wide printing" : "crmPage wide"}>
      {!printing && (
        <>
          <Link className="crmBack" href="/new/paths">
            ← المسارات
          </Link>

          <header className="crmHead">
            <h1>تقرير الاستمارات</h1>
            <p>
              {form.groupName} · {form.name} ·{" "}
              {search ? `${grid.rows.length} نتيجة لـ«${search}»` : `${grid.rows.length} تسجيل`} ·{" "}
              {grid.columns.length} سؤال
            </p>
          </header>

          {viewingRejected && (
            <p className="crmNote" style={{ marginBottom: -6 }}>
              التسجيلات المرفوضة لا تظهر في «الكل» ولا في ملف Excel ولا في PDF — هذه الشاشة هي
              مكانها الوحيد. «أرجعه» يعيد التسجيل إلى «بانتظار المراجعة»، وإضافته إلى المجموعة
              تبقى قراراً منفصلاً.
            </p>
          )}

          {!viewingRejected && duplicates > 0 && (
            <p className="crmNote" style={{ marginBottom: -6 }}>
              {duplicates} تسجيل يحمل رقم هاتف مكرر على هذه الاستمارة — نفس المرأة سجّلت أكثر من
              مرة. «ارفض» يرفض التسجيل وحده؛ المنتسبة تبقى، لأن تسجيلها الآخر ما زال لها.
            </p>
          )}

          {editable && (
            <p className="crmNote" style={{ marginBottom: -6 }}>
              نقرتان على أي خانة لتعديلها · Enter للحفظ · Esc للتراجع. تصحيح الهاتف أو الاسم
              يغيّره في ملف المنتسبة أيضاً.
            </p>
          )}

          <section className="crmCard crmPad crmSearch">
            <span style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {STATES.map((option) => (
                <Link
                  className={option.key === state ? "crmBtn quiet primary" : "crmBtn quiet"}
                  href={`/new/forms/${form.id}/report${option.key ? `?state=${option.key}` : ""}`}
                  key={option.key || "all"}
                >
                  {option.label}
                  {option.key === "duplicates" && duplicates > 0 ? ` (${duplicates})` : ""}
                  {option.key === "rejected" && rejected > 0 ? ` (${rejected})` : ""}
                </Link>
              ))}
            </span>
            <SearchBox formId={form.id} state={state} value={search} />
            <span className="spacer" style={{ display: "flex", gap: 8, marginInlineStart: "auto" }}>
              <a className="crmBtn" href={`/api/forms/${form.id}/export${view}`}>
                تنزيل Excel
              </a>
              <PdfButton
                formId={form.id}
                printHref={`/new/forms/${form.id}/report?print=1${view ? `&${view.slice(1)}` : ""}`}
                query={view}
              />
            </span>
          </section>
        </>
      )}

      {printing && (
        <header className="printHead">
          <h1>
            {form.groupName} — تقرير الاستمارات
          </h1>
          <p>
            {form.name} · {grid.rows.length} تسجيل · {new Date().toISOString().slice(0, 10)}
          </p>
        </header>
      )}

      <div className="gridScroll">
        <table className="gridTable">
          <colgroup>
            {laidOut.map((width, index) => (
              <col key={index} style={{ width }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th>#</th>
              {markColumn && <th>{markHeading}</th>}
              <th>التاريخ</th>
              <th>الاسم بالعبرية</th>
              <th>البلدة</th>
              {shown.map((index) => (
                <th key={grid.columns[index]}>
                  {/* On screen the question is the column name. On paper a
                      paragraph-long question would make the header half the
                      sheet, and Chromium then stops repeating it — so it
                      prints as a number and the key sits under the table. */}
                  <span className="thFull">{grid.columns[index]}</span>
                  <span
                    className={
                      printHeader(grid.columns[index], index) === grid.columns[index]
                        ? "thShort"
                        : "thShort thRef"
                    }
                  >
                    {printHeader(grid.columns[index], index)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((row, index) => (
              <tr key={row.submissionId}>
                <td>
                  {/* The number is the way in: a typo is noticed while
                      reading the table, so the correction starts there. */}
                  {printing ? (
                    index + 1
                  ) : (
                    <Link href={`/new/forms/${form.id}/submissions/${row.submissionId}`} title="تعديل التسجيل">
                      {index + 1}
                    </Link>
                  )}
                </td>
                {markColumn && (
                  <td>
                    <span className="rowActions">
                      {viewingRejected
                        ? canReject && <RestoreMark submissionId={row.submissionId} />
                        : duplicates > 0 && (
                            <DuplicateMark
                              canReject={canReject}
                              state={row.state}
                              submissionId={row.submissionId}
                              twins={row.duplicateOf}
                            />
                          )}
                      {canDelete && (
                        <DeleteMark
                          city={row.hebrew.city}
                          inGroup={row.state === "added"}
                          name={row.cells[0] || row.hebrew.name}
                          phone={row.phone}
                          submissionId={row.submissionId}
                        />
                      )}
                    </span>
                  </td>
                )}
                <td>
                  {/* The class carries display:inline-block — on the cell
                      itself it stops being a table cell, and the column
                      collapsed to 9px with the date stacked letter by letter. */}
                  <span className="crmLtr">{row.submittedAt.slice(0, 10)}</span>
                </td>
                {printing ? (
                  <>
                    <td className="heCell">{row.hebrew.name || "—"}</td>
                    <td className="heCell">{row.hebrew.city || "—"}</td>
                  </>
                ) : (
                  <>
                    <HebrewCell
                      confirmed={row.hebrew.nameConfirmed}
                      field="name"
                      submissionId={row.submissionId}
                      value={row.hebrew.name}
                    />
                    <HebrewCell
                      confirmed={row.hebrew.cityConfirmed}
                      field="city"
                      submissionId={row.submissionId}
                      value={row.hebrew.city}
                    />
                  </>
                )}
                {shown.map((cellIndex) =>
                  editable ? (
                    <EditableCell
                      answerId={row.answerIds[cellIndex]}
                      className={isNumeric(row.cells[cellIndex]) ? "num" : undefined}
                      key={grid.columns[cellIndex]}
                      submissionId={row.submissionId}
                      value={row.cells[cellIndex]}
                    />
                  ) : (
                    <td
                      className={isNumeric(row.cells[cellIndex]) ? "num" : undefined}
                      key={grid.columns[cellIndex]}
                    >
                      {row.cells[cellIndex]}
                    </td>
                  )
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {key.length > 0 && (
        <dl className="printKey">
          <dt className="printKeyTitle">مفتاح الأسئلة</dt>
          {key.map((entry) => (
            <div key={entry.short}>
              <dt>{entry.short}</dt>
              <dd>{entry.label}</dd>
            </div>
          ))}
        </dl>
      )}

      {grid.rows.length === 0 && <p className="crmEmpty">لا تسجيلات ضمن هذا الفلتر.</p>}
    </div>
  );
}
