/**
 * A Word file, written by hand.
 *
 * Afkar hand two lists out every round: one to whoever presses the juices
 * and one to the delivery companies. Both arrive as Word documents today,
 * so that is what leaves here — not a PDF of a screen and not a CSV
 * somebody has to re-type.
 *
 * There is no Word library in this project and adding one for two tables
 * is not worth a dependency: a .docx is a zip of four XML files, and a
 * zip with no compression is a header, the bytes, and an index. Both are
 * written below, and both are small enough to read in one sitting.
 */

/* ------------------------------------------------------------------ zip */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

export function crc32(data: Buffer) {
  let c = -1;
  for (let i = 0; i < data.length; i++) {
    c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ -1) >>> 0;
}

/**
 * A stored (uncompressed) zip. Deflate would make the file smaller and
 * the writer twice as long; a hundred-row table is a few kilobytes of
 * XML either way, and every reader accepts method 0.
 */
export function zip(files: Array<{ name: string; data: Buffer }>) {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const sum = crc32(file.data);

    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4); // version needed
    head.writeUInt16LE(0x0800, 6); // UTF-8 names
    head.writeUInt16LE(0, 8); // stored
    head.writeUInt16LE(0, 10); // time
    head.writeUInt16LE(0x21, 12); // date — 1980-01-01, so the file is byte-stable
    head.writeUInt32LE(sum, 14);
    head.writeUInt32LE(file.data.length, 18);
    head.writeUInt32LE(file.data.length, 22);
    head.writeUInt16LE(name.length, 26);
    head.writeUInt16LE(0, 28);
    locals.push(head, name, file.data);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4); // version made by
    entry.writeUInt16LE(20, 6); // version needed
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(0, 10);
    entry.writeUInt16LE(0, 12);
    entry.writeUInt16LE(0x21, 14);
    entry.writeUInt32LE(sum, 16);
    entry.writeUInt32LE(file.data.length, 20);
    entry.writeUInt32LE(file.data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);

    offset += head.length + name.length + file.data.length;
  }

  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, directory, end]);
}

/* ----------------------------------------------------------------- docx */

export function escapeXml(value: string) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // A control character makes Word refuse the whole document rather
    // than drop the cell, so they never reach the file.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

const FONT = "Arial";

/**
 * A run of text. Marked rtl unless the caller says otherwise: Hebrew and
 * Arabic both live here, but a row number is a number — «1.» inside an
 * rtl run comes out «.1», with the full stop thrown to the wrong side.
 */
function run(text: string, opts: { bold?: boolean; size?: number; color?: string; ltr?: boolean } = {}) {
  const size = (opts.size ?? 10) * 2; // half-points
  return (
    "<w:r><w:rPr>" +
    `<w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/>` +
    (opts.bold ? "<w:b/><w:bCs/>" : "") +
    (opts.color ? `<w:color w:val="${opts.color}"/>` : "") +
    `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>` +
    (opts.ltr ? "" : "<w:rtl/>") +
    "</w:rPr>" +
    `<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`
  );
}

function paragraph(
  text: string,
  opts: {
    bold?: boolean;
    size?: number;
    align?: "right" | "center" | "left";
    color?: string;
    after?: number;
    ltr?: boolean;
  } = {}
) {
  const align = opts.align ?? "right";
  return (
    "<w:p><w:pPr>" +
    // Explicitly off, not merely absent: the section is bidi, and a
    // paragraph that says nothing inherits it — «1.» came out «.1».
    (opts.ltr ? '<w:bidi w:val="0"/>' : "<w:bidi/>") +
    `<w:jc w:val="${align}"/>` +
    `<w:spacing w:before="0" w:after="${opts.after ?? 40}" w:line="240" w:lineRule="auto"/>` +
    `<w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/>${opts.ltr ? "" : "<w:rtl/>"}</w:rPr>` +
    "</w:pPr>" +
    (text ? run(text, opts) : "") +
    "</w:p>"
  );
}

function cell(
  text: string,
  opts: { width: number; bold?: boolean; fill?: string; align?: "right" | "center"; ltr?: boolean; span?: number }
) {
  // Percent widths: 5000 is the full table, so a percent is fifty.
  return (
    "<w:tc><w:tcPr>" +
    `<w:tcW w:w="${Math.round(opts.width * 50)}" w:type="pct"/>` +
    (opts.span && opts.span > 1 ? `<w:gridSpan w:val="${opts.span}"/>` : "") +
    (opts.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${opts.fill}"/>` : "") +
    '<w:vAlign w:val="center"/>' +
    "</w:tcPr>" +
    paragraph(text, { bold: opts.bold, align: opts.align ?? "right", size: 9, after: 0, ltr: opts.ltr }) +
    "</w:tc>"
  );
}

/**
 * A row is either cells, or a band across the whole table.
 *
 * The band is what separates one delivery region from the next on the
 * paper: a driver who works inside the Green Line has to see where his
 * part of the list ends, and «الضفة» two rows below «القدس» with nothing
 * between them is a route nobody notices is wrong.
 */
export type WordRow = string[] | { heading: string };

export type WordTable = {
  /** «חלק 1 מתוך 3 · שורות 1–50» — which part of the list this one is. */
  note: string;
  rows: WordRow[];
};

export type WordDoc = {
  /** «ערכות Shad1:» — the cohort, against the right margin of every page. */
  subtitle: string;
  /** «סבב 18.10.26» — the round. The same on every page. */
  title: string;
  /** One shape for every table in the file. */
  columns: Array<{ label: string; width: number }>;
  /**
   * The tables, in order, one page each.
   *
   * 🔑 Afkar hand these out in fifties — one table is one person's load —
   * so the file is a stack of tables, not one long one. A part that is
   * carried by somebody else (the West Bank) starts a table of its own
   * however short it is, because the point of the split is who drives it.
   */
  tables: WordTable[];
};

/**
 * The file as Afkar's own lists are shaped: a stack of tables, one to a
 * page, each right to left with a gold header row and a numbered first
 * column.
 *
 * `w:bidiVisual` is what puts the first column at the right. Without it
 * the text inside each cell reads right-to-left while the columns march
 * left-to-right, which is how a Hebrew table comes out mirrored.
 */
export function buildDocx(doc: WordDoc) {
  const borders =
    "<w:tblBorders>" +
    ["top", "left", "bottom", "right", "insideH", "insideV"]
      .map((side) => `<w:${side} w:val="single" w:sz="6" w:space="0" w:color="000000"/>`)
      .join("") +
    "</w:tblBorders>";

  const header =
    '<w:tr><w:trPr><w:tblHeader/></w:trPr>' +
    doc.columns
      .map((column) => cell(column.label, { width: column.width, bold: true, fill: "FFC000", align: "center" }))
      .join("") +
    "</w:tr>";

  const span = doc.columns.reduce((total, column) => total + column.width, 0);

  const grid =
    "<w:tblGrid>" +
    doc.columns.map((column) => `<w:gridCol w:w="${Math.round(column.width * 104)}"/>`).join("") +
    "</w:tblGrid>";

  const body = (rows: WordRow[]) =>
    rows
      .map((row) =>
        Array.isArray(row)
          ? "<w:tr>" +
            row
              .map((value, at) =>
                cell(value, {
                  width: doc.columns[at]?.width ?? 10,
                  // The number and the phone are read as values, not as prose —
                  // and laid out left to right, so «1.» keeps its full stop and
                  // a phone does not reverse.
                  align: at === 0 || /^[\d+\-/. ]+$/.test(value.trim()) ? "center" : "right",
                  ltr: at === 0 || /^[\d+\-/. ]+$/.test(value.trim())
                })
              )
              .join("") +
            "</w:tr>"
          : "<w:tr>" +
            // A paler shade of the header gold: it reads as part of the same
            // table rather than as a second header row.
            cell(row.heading, { width: span, span: doc.columns.length, bold: true, fill: "FFF2CC" }) +
            "</w:tr>"
      )
      .join("");

  const pages = doc.tables
    .map(
      (table, at) =>
        // Every page re-states the cohort and the round: a single sheet
        // handed to one driver has to say what it is on its own.
        (at > 0 ? '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' : "") +
        paragraph(doc.subtitle, { bold: true, size: 11, align: "right" }) +
        paragraph(doc.title, { bold: true, size: 14, align: "center", after: 40 }) +
        paragraph(table.note, { bold: true, size: 10, align: "center", after: 160 }) +
        "<w:tbl><w:tblPr>" +
        '<w:tblW w:w="5000" w:type="pct"/>' +
        "<w:bidiVisual/>" +
        '<w:jc w:val="right"/>' +
        borders +
        '<w:tblLayout w:type="fixed"/>' +
        "</w:tblPr>" +
        grid +
        header +
        body(table.rows) +
        "</w:tbl>" +
        paragraph("")
    )
    .join("");

  const document =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    "<w:body>" +
    pages +
    // Portrait, like the lists Afkar already send. The columns are set as
    // percentages, so seven of them share the narrower page rather than
    // spilling off it.
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="900" w:right="720" w:bottom="900" w:left="720" w:header="360" w:footer="360" w:gutter="0"/>' +
    "<w:bidi/></w:sectPr>" +
    "</w:body></w:document>";

  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    "</Types>";

  const rels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    "</Relationships>";

  return zip([
    // [Content_Types].xml goes first: some readers look at the first entry
    // rather than the directory.
    { name: "[Content_Types].xml", data: Buffer.from(contentTypes, "utf8") },
    { name: "_rels/.rels", data: Buffer.from(rels, "utf8") },
    { name: "word/document.xml", data: Buffer.from(document, "utf8") }
  ]);
}
