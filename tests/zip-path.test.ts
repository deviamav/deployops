import { describe, it, expect } from "vitest";
import AdmZip from "adm-zip";
import { isEntryPathSafe, normalizeEntryName, sanitizeZipBuffer } from "../src/lib/zip";

describe("isEntryPathSafe — Zip-Slip protection", () => {
  describe("дозволяє легітимні шляхи", () => {
    const safe = [
      "index.html",
      "assets/style.css",
      "fonts/Inter.woff2",
      "fonts/../font.ttf", // нормалізується в font.ttf — Tilda/Webflow роблять так
      "a/b/c/d.js",
      "deep/nested/file.png",
      "with-dash/and_under/file.txt",
      "01_index.html",
      "image.jpg",
      "css/components/button.css",
    ];
    for (const p of safe) {
      it(`OK: ${p}`, () => expect(isEntryPathSafe(p)).toBe(true));
    }
  });

  describe("блокує реальні traversal атаки", () => {
    const unsafe = [
      "../etc/passwd",
      "../../etc/shadow",
      "fonts/../../etc/passwd", // після normalize: ../etc/passwd
      "fonts/../../../root/.ssh/authorized_keys",
      "/etc/passwd",
      "/root/.bashrc",
      "\\windows\\system32\\config",
      "C:\\Users\\admin",
      "c:/users/admin",
      "D:\\backup.zip",
      "../../../../../tmp/x",
    ];
    for (const p of unsafe) {
      it(`BLOCK: ${p}`, () => expect(isEntryPathSafe(p)).toBe(false));
    }
  });

  describe("крайові випадки", () => {
    it("порожній шлях — блокуємо", () => expect(isEntryPathSafe("")).toBe(false));
    it("тільки крапка — блокуємо", () => expect(isEntryPathSafe(".")).toBe(false));
    it("тільки .. — блокуємо", () => expect(isEntryPathSafe("..")).toBe(false));
    it("backslash посеред — нормалізується як subpath і OK", () =>
      expect(isEntryPathSafe("assets\\fonts\\a.ttf")).toBe(true));
    it("junk dir fonts/../ — OK для inspect (skip при sanitize)", () =>
      expect(isEntryPathSafe("fonts/../")).toBe(true));
  });
});

describe("normalizeEntryName", () => {
  it("fonts/../font.ttf → font.ttf", () => {
    expect(normalizeEntryName("fonts/../font.ttf")).toBe("font.ttf");
  });
  it("css/../ → null (junk dir, skip)", () => {
    expect(normalizeEntryName("css/../")).toBe(null);
  });
});

describe("sanitizeZipBuffer", () => {
  it("перепаковує entries з .. у безпечні шляхи", () => {
    const zip = new AdmZip();
    zip.addFile("fonts/../Inter.woff2", Buffer.from("font"));
    zip.addFile("js/../app.js", Buffer.from("js"));
    zip.addFile("css/../style.css", Buffer.from("css"));
    const out = sanitizeZipBuffer(zip.toBuffer());
    const names = new AdmZip(out).getEntries().map((e) => e.entryName).sort();
    expect(names).toEqual(["Inter.woff2", "app.js", "style.css"].sort());
  });

  it("пропускає junk directory markers fonts/../", () => {
    const zip = new AdmZip();
    zip.addFile("fonts/../", Buffer.alloc(0));
    zip.addFile("index.html", Buffer.from("ok"));
    const out = sanitizeZipBuffer(zip.toBuffer());
    const names = new AdmZip(out).getEntries().map((e) => e.entryName);
    expect(names).toEqual(["index.html"]);
  });
});
