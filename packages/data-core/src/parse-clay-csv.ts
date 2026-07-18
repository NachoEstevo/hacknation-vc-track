import { parse } from "csv-parse/sync";
import type { ClayCompanyRow } from "./types";

export function parseClayCsv(csv: string): ClayCompanyRow[] {
  return parse(csv, {
    bom: true,
    columns: true,
    relax_column_count: true,
    skip_empty_lines: true,
  }) as ClayCompanyRow[];
}
