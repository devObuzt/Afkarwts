import Link from "next/link";
import { notFound } from "next/navigation";
import { getForm } from "@/app/lib/forms/store";
import {
  columnWidths,
  duplicateCount,
  headerKey,
  isNumeric,
  printHeader,
  submissionGrid
} from "@/app/lib/forms/report";
import { requireUser } from "@/app/lib/users/current";
import { DuplicateMark } from "./DuplicateMark";
import { EditableCell } from "./EditableCell";
import { HebrewCell } from "./HebrewCell";
import { PdfButton } from "./PdfButton";
import { can } from "@/app/lib/users/permissions";

export const dynamic = "force-dynamic";

const STATES = [
  { key: "", label: "الكل" },
  { key: "added", label: "في المجموعة" },
  { key: "new", label: "بانتظار المراجعة" },
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
  searchParams: Promise<{ state?: string; print?: string }>;
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
  const printing = query.print === "1";
  // Correcting in place needs both: the form permission and the right to
  // see the answers — the same pair the save route enforces, so a cell is
  // never offered to somebody the server would refuse. Never while
  // printing: the PDF is a reading of the table, not a way into it.
  const editable = !printing && can(user, "forms.manage");
  const canReject = can(user, "leads.review");
  // The form's own count, not the current view's — see duplicateCount.
  const duplicates = duplicateCount(form.id);
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
  const extra = (duplicates > 0 && !printing ? 6 : 0) + 18;
  const scale = (100 - extra) / 100;
  const shrink = (width: string) => `${Math.round(Number(width.replace("%", "")) * scale * 100) / 100}%`;
  const laidOut = [
    shrink(widths[0]),
    ...(duplicates > 0 && !printing ? ["6%"] : []),
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
              {form.groupName} · {form.name} · {grid.rows.length} تسجيل · {grid.columns.length} سؤال
            </p>
          </header>

          {duplicates > 0 && (
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
                </Link>
              ))}
            </span>
            <span className="spacer" style={{ display: "flex", gap: 8, marginInlineStart: "auto" }}>
              <a className="crmBtn" href={`/api/forms/${form.id}/export${state ? `?state=${state}` : ""}`}>
                تنزيل Excel
              </a>
              <PdfButton
                formId={form.id}
                printHref={`/new/forms/${form.id}/report?print=1${state ? `&state=${state}` : ""}`}
                state={state}
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
              {!printing && duplicates > 0 && <th>تكرار</th>}
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
                {!printing && duplicates > 0 && (
                  <td>
                    <DuplicateMark
                      canReject={canReject}
                      state={row.state}
                      submissionId={row.submissionId}
                      twins={row.duplicateOf}
                    />
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
