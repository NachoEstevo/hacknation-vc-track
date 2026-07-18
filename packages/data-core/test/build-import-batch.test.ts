import { describe, expect, it } from "vitest";
import { buildImportBatch, parseClayCsv } from "../src/index";

const csv = `Ignored,Name,Description,Primary Industry,Size,Type,Location,Country,Domain,LinkedIn URL
,Alpha,"Line one
Line two, with comma",Software Development,2-10 employees,Privately Held,London,United Kingdom of Great Britain and Northern Ireland,alpha.com,https://linkedin.com/company/alpha
,Alpha Duplicate,Duplicate,Software Development,2-10 employees,Privately Held,London,United Kingdom of Great Britain and Northern Ireland,https://www.alpha.com/,https://linkedin.com/company/alpha`;

describe("parseClayCsv", () => {
  it("keeps quoted multiline descriptions in one row", () => {
    const rows = parseClayCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.Description).toBe("Line one\nLine two, with comma");
  });
});

describe("buildImportBatch", () => {
  it("deduplicates normalized domains without merging conflicting rows", () => {
    const batch = buildImportBatch(parseClayCsv(csv));
    expect(batch.companies).toHaveLength(1);
    expect(batch.duplicates).toHaveLength(1);
    expect(batch.companies[0]?.description).toContain("Line two, with comma");
    expect(batch.duplicates[0]?.duplicateName).toBe("Alpha Duplicate");
  });

  it("produces stable IDs and summaries when rerun", () => {
    const first = buildImportBatch(parseClayCsv(csv));
    const second = buildImportBatch(parseClayCsv(csv));
    expect(second).toEqual(first);
    expect(first.companies[0]?.stableId).toMatch(/^[a-f0-9]{24}$/);
  });

  it("falls back to LinkedIn when a domain is missing", () => {
    const row = parseClayCsv(`Ignored,Name,Description,Primary Industry,Size,Type,Location,Country,Domain,LinkedIn URL
,Beta,Beta product,Software Development,2-10 employees,Privately Held,New York,United States,,https://linkedin.com/company/beta`);
    const batch = buildImportBatch(row);
    expect(batch.companies[0]?.dedupeKey).toBe("linkedin:beta");
    expect(batch.summary.missingDomains).toBe(1);
  });
});
