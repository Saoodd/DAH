import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/export";

describe("toCsv", () => {
  const columns = [
    { key: "name", label: "Name" },
    { key: "note", label: "Note" },
  ];

  it("renders a header row and one row per record", () => {
    const csv = toCsv([{ name: "Bunn & Bloom", note: "ok" }], columns);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Name,Note");
    expect(lines[1]).toBe("Bunn & Bloom,ok");
  });

  it("quotes fields containing commas, quotes, or newlines", () => {
    const csv = toCsv([{ name: 'Say "Hi", please', note: "line1\nline2" }], columns);
    const lines = csv.split("\r\n");
    expect(lines[1]).toBe('"Say ""Hi"", please","line1\nline2"');
  });

  it("neutralizes CSV formula injection by prefixing a leading apostrophe", () => {
    const csv = toCsv([{ name: "=cmd|'/c calc'!A1", note: "+1" }], columns);
    const lines = csv.split("\r\n");
    expect(lines[1]).toBe("'=cmd|'/c calc'!A1,'+1");
  });

  it("renders empty string for null/undefined values", () => {
    const csv = toCsv([{ name: null, note: undefined }], columns);
    expect(csv.split("\r\n")[1]).toBe(",");
  });
});
