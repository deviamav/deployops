import { describe, expect, it } from "vitest";
import { parseServersTxt } from "@/lib/parsers/servers-txt";
import { parseDomainsTxt } from "@/lib/parsers/domains-txt";

describe("parseServersTxt", () => {
  it("3 валідні рядки → 3 записи без errors", () => {
    const txt =
      "37.1.221.109\tdrBDx9T66y\txusulora.pro xakomi.pro revanogi.pro\n" +
      "45.136.196.175\tdVBN5LXQj4\tbikidequft.pro\n" +
      "45.136.199.29\t5t5N2mHu59\tpanujic.pro\n";
    const rows = parseServersTxt(txt);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => !r.error)).toBe(true);
    expect(rows[0].domains).toHaveLength(3);
    expect(rows[0].host).toBe("37.1.221.109");
    expect(rows[0].password).toBe("drBDx9T66y");
  });

  it("ігнорує # та порожні рядки", () => {
    const txt =
      "# comment line\n" +
      "\n" +
      "37.1.221.109\tpass\tfoo.com\n" +
      "  \n";
    const rows = parseServersTxt(txt);
    expect(rows).toHaveLength(1);
    expect(rows[0].error).toBeUndefined();
  });

  it("невалідний IP → error", () => {
    const txt = "999.0.0.1\tpwd\n";
    const rows = parseServersTxt(txt);
    expect(rows).toHaveLength(1);
    expect(rows[0].error).toMatch(/invalid IP/i);
  });

  it("неправильний домен → error", () => {
    const txt = "1.2.3.4\tpwd\tnot_a_domain\n";
    const rows = parseServersTxt(txt);
    expect(rows[0].error).toMatch(/invalid domain/i);
  });

  it("відсутній пароль → error", () => {
    const txt = "1.2.3.4\n";
    const rows = parseServersTxt(txt);
    expect(rows[0].error).toMatch(/expected 2-3/);
  });

  it("3 поля з 0 доменами — валідно", () => {
    const txt = "1.2.3.4\tpass\t\n";
    const rows = parseServersTxt(txt);
    expect(rows[0].error).toBeUndefined();
    expect(rows[0].domains).toEqual([]);
  });
});

describe("parseDomainsTxt", () => {
  it("1 домен на рядок", () => {
    const txt = "# Закуплено\nzonomila.com\nvijekone.com\n\nhijoqadatet.com\n";
    const rows = parseDomainsTxt(txt);
    expect(rows.map((r) => r.name)).toEqual([
      "zonomila.com",
      "vijekone.com",
      "hijoqadatet.com",
    ]);
    expect(rows.every((r) => !r.error)).toBe(true);
  });

  it("невалідний домен → error", () => {
    const rows = parseDomainsTxt("not_a_domain");
    expect(rows[0].error).toMatch(/invalid domain/);
  });
});
