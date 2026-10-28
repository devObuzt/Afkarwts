export type ImportRow = {
  name: string;
  phone: string;
  notes: string;
  city?: string;
  joined?: string;
  service?: string;
};

/**
 * Reading a list of people out of whatever was pasted.
 *
 * What arrives is never one format: an export with a header row, a column of
 * bare phone numbers, a two-column list from a notebook, commas or semicolons
 * or tabs. The rule is to accept all of it rather than ask whoever has the
 * list to reshape it first — that reshaping is where the mistakes get made.
 *
 * It lived inside the old inbox screen. It is here so one copy serves both
 * screens and can be held to tests.
 */
export function readImportList(raw: string): { rows: ImportRow[]; duplicates: number } {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) {
    return { rows: [], duplicates: 0 };
  }

  const splitLine = (line: string) => {
    const delimiter = line.includes("\t") ? "\t" : line.includes(";") ? ";" : ",";
    return line.split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, ""));
  };

  const header = splitLine(lines[0]).map((cell) => cell.toLowerCase());
  const isHeaderRow = header.some((cell) => /phone|name|اسم|رقم/.test(cell));

  let rows: ImportRow[] = [];

  if (isHeaderRow && header.some((cell) => cell.includes("phone"))) {
    // Header-mapped, e.g. Phone Number, First Name, Last Name, City, CT, Service
    const col = (matcher: (cell: string) => boolean) => header.findIndex(matcher);
    const phoneIdx = col((cell) => cell.includes("phone") || cell.includes("رقم"));
    const firstIdx = col((cell) => cell.includes("first") || cell === "name" || cell.includes("الاسم الاول"));
    const lastIdx = col((cell) => cell.includes("last") || cell.includes("الاسم الاخير"));
    const cityIdx = col((cell) => cell.includes("city") || cell.includes("مدينة"));
    const joinedIdx = col((cell) => cell === "ct" || cell.includes("join") || cell.includes("تاريخ"));
    const serviceIdx = col((cell) => cell.includes("service") || cell.includes("خدمة"));
    const notesIdx = col((cell) => cell.includes("note") || cell.includes("ملاحظ"));

    rows = lines.slice(1).map((line) => {
      const cells = splitLine(line);
      const first = firstIdx >= 0 ? cells[firstIdx] ?? "" : "";
      const last = lastIdx >= 0 ? cells[lastIdx] ?? "" : "";
      return {
        name: [first, last].filter(Boolean).join(" "),
        phone: phoneIdx >= 0 ? cells[phoneIdx] ?? "" : "",
        notes: notesIdx >= 0 ? cells[notesIdx] ?? "" : "",
        city: cityIdx >= 0 ? cells[cityIdx] ?? "" : "",
        joined: joinedIdx >= 0 ? cells[joinedIdx] ?? "" : "",
        service: serviceIdx >= 0 ? cells[serviceIdx] ?? "" : ""
      };
    });
  } else {
    // Positional: Name, Phone, Notes — or a column of nothing but numbers.
    rows = lines.map((line) => {
      const cells = splitLine(line);
      return { name: cells[0] ?? "", phone: cells[1] ?? "", notes: cells[2] ?? "" };
    });
    if (rows.length && /name|phone|اسم|رقم/i.test(`${rows[0].name} ${rows[0].phone}`)) {
      rows.shift();
    }
    rows = rows.map((row) => {
      if (!row.phone && /^[+\d][\d\s()-]{6,}$/.test(row.name)) {
        return { ...row, name: "", phone: row.name };
      }
      return row;
    });
  }

  // The same person twice in one file is one person. Matched on the digits
  // that identify the line, so 052…, 9725…, +9725… and 00972… are one key.
  const seen = new Set<string>();
  let duplicates = 0;

  const kept = rows.filter((row) => {
    const key = row.phone.replace(/[^\d]/g, "").replace(/^0+/, "").replace(/^97[02]/, "");
    if (!key) {
      return Boolean(row.name);
    }
    if (seen.has(key)) {
      duplicates += 1;
      return false;
    }
    seen.add(key);
    return true;
  });

  // Counted here, not by subtracting from the pasted line count: that
  // subtraction also counts the header row, and would report a clean export
  // as having one duplicate in it.
  return { rows: kept, duplicates };
}

export function parseImportRows(raw: string): ImportRow[] {
  return readImportList(raw).rows;
}

/**
 * What the server will refuse: every row needs a number. Said before the
 * import rather than after, because «3 فشلوا» at the end does not say which
 * three, and the file is already half in.
 */
export function splitUsable(rows: ImportRow[]) {
  const usable = rows.filter((row) => row.phone.trim());
  return { usable, missingPhone: rows.filter((row) => !row.phone.trim()) };
}
