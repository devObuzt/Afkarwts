import Link from "next/link";
import { notFound } from "next/navigation";
import { getForm } from "@/app/lib/forms/store";
import { columnWidths, headerKey, isNumeric, printHeader, submissionGrid } from "@/app/lib/forms/report";
import { requireUser } from "@/app/lib/users/current";
import { PdfButton } from "./PdfButton";
import { can } from "@/app/lib/users/permissions";

export const dynamic = "force-dynamic";

const STATES = [
  { key: "", label: "الكل" },
  { key: "added", label: "في المجموعة" },
  { key: "new", label: "بانتظار المراجعة" }
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
  const grid = submissionGrid(form.id, { state: state || undefined })!;
  const printing = query.print === "1";
  // Weighted by content: a phone does not need a consent paragraph's room.
  const widths = columnWidths(grid);
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

          <section className="crmCard crmPad crmSearch">
            <span style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {STATES.map((option) => (
                <Link
                  className={option.key === state ? "crmBtn quiet primary" : "crmBtn quiet"}
                  href={`/new/forms/${form.id}/report${option.key ? `?state=${option.key}` : ""}`}
                  key={option.key || "all"}
                >
                  {option.label}
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
            {widths.map((width, index) => (
              <col key={index} style={{ width }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th>#</th>
              <th>التاريخ</th>
              {grid.columns.map((column, index) => (
                <th key={column}>
                  {/* On screen the question is the column name. On paper a
                      paragraph-long question would make the header half the
                      sheet, and Chromium then stops repeating it — so it
                      prints as a number and the key sits under the table. */}
                  <span className="thFull">{column}</span>
                  <span
                    className={
                      printHeader(column, index) === column ? "thShort" : "thShort thRef"
                    }
                  >
                    {printHeader(column, index)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((row, index) => (
              <tr key={row.submissionId}>
                <td>{index + 1}</td>
                <td>
                  {/* The class carries display:inline-block — on the cell
                      itself it stops being a table cell, and the column
                      collapsed to 9px with the date stacked letter by letter. */}
                  <span className="crmLtr">{row.submittedAt.slice(0, 10)}</span>
                </td>
                {row.cells.map((cell, cellIndex) => (
                  <td className={isNumeric(cell) ? "num" : undefined} key={grid.columns[cellIndex]}>
                    {cell}
                  </td>
                ))}
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
