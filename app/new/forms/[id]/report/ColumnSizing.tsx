"use client";

import { useEffect } from "react";

/**
 * Drag the edge of a heading to make its column wider or narrower.
 *
 * The widths the server sends are a starting point, not a verdict — which
 * column needs room depends on what is being read that day, and nobody
 * should have to ask for a number to be changed in code. What is dragged
 * is remembered per form, in this browser.
 *
 * The grips are built here rather than rendered into every heading: the
 * headings are written in five different places in the table, and a
 * purely visual affordance should not have to be threaded through all of
 * them.
 */
const KEY = (formId: number) => `afkar:gridw:${formId}`;
const MIN = 28;
const MAX = 720;

export function ColumnSizing({ formId }: { formId: number }) {
  useEffect(() => {
    const table = document.querySelector<HTMLTableElement>(".gridTable");
    const head = table?.querySelector("thead tr");
    if (!table || !head) {
      return;
    }

    const cols = Array.from(table.querySelectorAll<HTMLTableColElement>("colgroup col"));
    const heads = Array.from(head.querySelectorAll<HTMLTableCellElement>("th"));

    /** Keeping the table's own width in step, or a widened column just steals from its neighbour. */
    const retotal = () => {
      const total = cols.reduce((sum, col) => sum + (parseFloat(col.style.width) || 0), 0);
      table.style.width = `${Math.round(total)}px`;
    };

    const saved: Record<string, number> = (() => {
      try {
        return JSON.parse(localStorage.getItem(KEY(formId)) ?? "{}");
      } catch {
        // A browser with storage blocked still gets a usable table.
        return {};
      }
    })();

    // A saved width is keyed by the heading's own text, not its position:
    // the table gains and loses columns (the controls column comes and
    // goes, Afkar add a note column), and a width pinned to an index would
    // land on whatever moved into that slot.
    const nameOf = (at: number) => (heads[at]?.textContent ?? "").trim().slice(0, 40) || `#${at}`;

    for (const [at, col] of cols.entries()) {
      const width = saved[nameOf(at)];
      if (width) {
        col.style.width = `${width}px`;
      }
    }
    retotal();

    const grips: HTMLElement[] = [];
    let active: { at: number; startX: number; startWidth: number } | null = null;

    const onMove = (event: PointerEvent) => {
      if (!active) {
        return;
      }
      // RTL: dragging the inline-end edge leftwards makes it wider, so the
      // sign follows the document's direction rather than the screen's.
      const rtl = getComputedStyle(table).direction === "rtl";
      const moved = (event.clientX - active.startX) * (rtl ? -1 : 1);
      const width = Math.max(MIN, Math.min(MAX, active.startWidth + moved));
      cols[active.at].style.width = `${Math.round(width)}px`;
      retotal();
    };

    const onUp = () => {
      if (!active) {
        return;
      }
      const width = parseFloat(cols[active.at].style.width) || 0;
      saved[nameOf(active.at)] = Math.round(width);
      try {
        localStorage.setItem(KEY(formId), JSON.stringify(saved));
      } catch {
        // Not being able to remember it is not a reason to undo it.
      }
      active = null;
      document.body.classList.remove("resizingCol");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    for (const [at, cell] of heads.entries()) {
      if (!cols[at]) {
        continue;
      }
      const grip = document.createElement("span");
      grip.className = "colGrip";
      grip.title = "اسحب لتغيير عرض العمود · نقرتان للعودة";
      grip.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        active = { at, startX: event.clientX, startWidth: cols[at].getBoundingClientRect().width };
        document.body.classList.add("resizingCol");
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      });
      // The way back, without hunting for the exact original number.
      grip.addEventListener("dblclick", (event) => {
        event.preventDefault();
        delete saved[nameOf(at)];
        try {
          localStorage.setItem(KEY(formId), JSON.stringify(saved));
        } catch {
          /* nothing to do */
        }
        window.location.reload();
      });
      cell.appendChild(grip);
      grips.push(grip);
    }

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.classList.remove("resizingCol");
      for (const grip of grips) grip.remove();
    };
  }, [formId]);

  return null;
}
