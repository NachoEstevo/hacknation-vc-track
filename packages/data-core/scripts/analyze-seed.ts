import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildImportBatch, parseClayCsv } from "../src/index";

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: npm run analyze:seed -- <csv-path>");
  process.exitCode = 1;
} else {
  const csv = await readFile(resolve(process.cwd(), inputPath), "utf8");
  const batch = buildImportBatch(parseClayCsv(csv));
  console.log(JSON.stringify(batch.summary, null, 2));
}
