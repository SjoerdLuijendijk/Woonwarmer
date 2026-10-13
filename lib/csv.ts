// A small RFC 4180 CSV reader: quoted fields may contain the separator, doubled quotes and line
// breaks. Returns the rows as objects keyed by the header row. Runs in the browser and on the server.
export function parseCsvRecords(text: string, separator = ","): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^﻿/, "");

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char !== '"') field += char;
      else if (input[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === separator) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...records] = rows;
  if (!header) return [];
  const names = header.map((name) => name.trim());
  return records
    .filter((values) => values.some((value) => value.trim().length > 0))
    .map((values) => Object.fromEntries(names.map((name, column) => [name, values[column] ?? ""])));
}
