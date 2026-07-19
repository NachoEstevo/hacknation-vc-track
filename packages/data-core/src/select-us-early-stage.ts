import { parse } from "csv-parse/sync";
import { normalizeDomain } from "./normalize-company.js";

export interface UsEarlyStageRow {
  Rank?: string;
  Nombre?: string;
  Website?: string;
  "Ciudad y estado"?: string;
  Sector?: string;
  "Descripción concreta del producto"?: string;
  "Etapa estimada"?: string;
  "Cantidad estimada de empleados"?: string;
  "LinkedIn de la empresa"?: string;
  "URLs de las fuentes"?: string;
  [key: string]: string | undefined;
}

export type UsEarlyStageDecision = "accepted" | "rejected";
export type UsEarlyStageReason =
  | "missing_public_domain"
  | "later_stage"
  | "outside_software_scope"
  | "physical_or_life_science_business"
  | "team_too_large"
  | "missing_required_fields";

export interface UsEarlyStageAssessment {
  rowNumber: number;
  name: string | null;
  domain: string | null;
  decision: UsEarlyStageDecision;
  reasons: UsEarlyStageReason[];
}

const SOFTWARE_TERMS = /\b(ai|software|saas|cybersecurity|data|developer|it operations|infrastructure|legaltech|govtech|fintech|web)\b/iu;
const PHYSICAL_OR_LIFE_SCIENCE_TERMS = /\b(bioengineering|biotech|therapeutics|medical robotics|medtech|wearables|batter(?:y|ies)|manufacturing|aerospace|robotics|quantum sensing|critical minerals|atmospheric water|space tech|satellite|pharmacy robotics|genetics|proteomics|pathology|ultrasound|neuromodulation)\b/iu;

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed && !/^no encontrado$/iu.test(trimmed) ? trimmed : null;
}

function teamMaximum(value: string | null): number | null {
  const match = value?.match(/(\d+)\s*[-–]\s*(\d+)/u);
  return match ? Number(match[2]) : null;
}

export function parseUsEarlyStageCsv(csv: string): UsEarlyStageRow[] {
  return parse(csv, { bom: true, columns: true, relax_column_count: true, skip_empty_lines: true }) as UsEarlyStageRow[];
}

export function assessUsEarlyStageRow(row: UsEarlyStageRow, rowNumber: number): UsEarlyStageAssessment {
  const name = clean(row.Nombre);
  const domain = normalizeDomain(clean(row.Website) ?? "");
  const sector = clean(row.Sector);
  const description = clean(row["Descripción concreta del producto"]);
  const stage = clean(row["Etapa estimada"]);
  const reasons: UsEarlyStageReason[] = [];

  if (!name || !sector || !description || !stage) reasons.push("missing_required_fields");
  if (!domain) reasons.push("missing_public_domain");
  if (/\b(series a|strategic|post-seed)\b/iu.test(stage ?? "")) reasons.push("later_stage");
  if (teamMaximum(clean(row["Cantidad estimada de empleados"])) && teamMaximum(clean(row["Cantidad estimada de empleados"]))! > 50) reasons.push("team_too_large");
  if (PHYSICAL_OR_LIFE_SCIENCE_TERMS.test(sector ?? "")) reasons.push("physical_or_life_science_business");
  if (!SOFTWARE_TERMS.test(sector ?? "")) reasons.push("outside_software_scope");

  return { rowNumber, name, domain, decision: reasons.length === 0 ? "accepted" : "rejected", reasons };
}
