export interface ExportColumn {
  key: string;
  label: string;
}

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let str = String(value);
  // Spreadsheet engines may ignore leading control characters/whitespace
  // before evaluating a formula. Prefix the entire cell when the first
  // meaningful character is a formula trigger.
  if (/^[\u0000-\u0020]*[=+\-@]/.test(str)) str = `'${str}`;
  if (/[",\n\r]/.test(str)) str = `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function toCsv(rows: Record<string, unknown>[], columns: ExportColumn[]): string {
  const header = columns.map((c) => escapeCsvCell(c.label)).join(",");
  const body = rows
    .map((row) => columns.map((c) => escapeCsvCell(row[c.key])).join(","))
    .join("\r\n");
  return `${header}\r\n${body}`;
}
