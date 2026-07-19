import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseClayCsv } from "../src/parse-clay-csv";
import { buildImportBatch } from "../src/build-import-batch";
import { normalizeLinkedInCompanyUrl } from "../src/normalize-company";
import { assessUsEarlyStageRow, parseUsEarlyStageCsv } from "../src/select-us-early-stage";

const [inputPath, existingPath, outputPath, auditPath] = process.argv.slice(2);

if (!inputPath || !existingPath || !outputPath || !auditPath) {
  console.error("Usage: tsx scripts/build-us-early-stage-seed.ts <input> <existing> <output> <audit>");
  process.exitCode = 1;
} else {
  const [input, existing] = await Promise.all([readFile(resolve(inputPath), "utf8"), readFile(resolve(existingPath), "utf8")]);
  const assessments = parseUsEarlyStageCsv(input).map((row, index) => assessUsEarlyStageRow(row, index + 2));
  const rows = parseUsEarlyStageCsv(input);
  const accepted = rows.filter((_, index) => assessments[index]?.decision === "accepted");
  const current = parseClayCsv(existing);
  const header = ["Small Companies, Software & IT, US & UK", "Name", "Description", "Primary Industry", "Size", "Type", "Location", "Country", "Domain", "LinkedIn URL"];
  const csvValue = (value: string | null | undefined): string => `"${(value ?? "").replace(/[ \t]+(?=\r?\n|$)/gu, "").replaceAll('"', '""')}"`;
  const converted = accepted.map((row) => [
    "", row.Nombre, row["Descripción concreta del producto"], row.Sector,
    row["Cantidad estimada de empleados"], "Privately Held", row["Ciudad y estado"], "United States",
    row.Website, normalizeLinkedInCompanyUrl(row["LinkedIn de la empresa"] ?? "") ?? "",
  ]);
  const combined = [header, ...current.map((row) => header.map((key) => row[key])), ...converted]
    .map((row) => row.map(csvValue).join(",")).join("\n").concat("\n");
  const batch = buildImportBatch(parseClayCsv(combined));
  if (batch.duplicates.length > 0 || batch.quarantined.length > 0) {
    throw new Error("Refusing to write a canonical seed with duplicate or quarantined rows.");
  }
  const reasonCounts = assessments.flatMap((assessment) => assessment.reasons)
    .reduce<Record<string, number>>((counts, reason) => ({ ...counts, [reason]: (counts[reason] ?? 0) + 1 }), {});
  const audit = {
    source: "us_early_stage_startups_100_2026-07-18.csv",
    sourceRows: rows.length,
    existingRowsRetained: current.length,
    acceptedRows: accepted.length,
    rejectedRows: assessments.filter(({ decision }) => decision === "rejected").length,
    duplicateRows: batch.duplicates.length,
    quarantinedRows: batch.quarantined.length,
    reasonCounts,
    accepted: assessments.filter(({ decision }) => decision === "accepted").map(({ rowNumber, name, domain }) => ({ rowNumber, name, domain })),
    rejected: assessments.filter(({ decision }) => decision === "rejected").map(({ rowNumber, name, reasons }) => ({ rowNumber, name, reasons })),
    limitations: [
      "The source CSV is not committed. This audit and canonical seed retain only fields required by the engine.",
      "Acceptance is a discovery-quality decision, not verification of funding, customers, founders, or scores.",
      "No LinkedIn or X pages were fetched during import.",
    ],
  };
  await Promise.all([writeFile(resolve(outputPath), combined), writeFile(resolve(auditPath), `${JSON.stringify(audit, null, 2)}\n`)]);
  console.log(JSON.stringify({ accepted: accepted.length, rejected: audit.rejectedRows, combinedRows: batch.companies.length, reasonCounts }, null, 2));
}
