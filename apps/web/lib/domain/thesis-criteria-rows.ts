import {
  compactUsd,
  DEFAULT_THESIS_SOURCE_SCOPE,
  formatThesisSummary,
  mapGeographyToken,
  mapSectorToken,
  mapStageToken,
  normalizeLookup,
  THESIS_RISK_POSTURES,
  THESIS_SOURCE_SCOPES,
  type ActiveThesis,
  type ActiveThesisInput,
  type ThesisRiskPosture,
  type ThesisSourceScope,
} from "./active-thesis";
import type {
  CriterionField,
  CriterionOperator,
  CriterionPriority,
  CriterionValue,
  SearchCriterion,
} from "./types";

/**
 * `fund_theses` / `thesis_criteria` store one row per criterion, unlike the
 * browser-only `ActiveThesis.criteria`, which groups sectors/stages/
 * geographies into a single composite criterion with a joined label. This
 * module decomposes an `ActiveThesisInput` into one row per chip so every
 * database row is independently meaningful, and reconstructs an
 * `ActiveThesis` back from stored rows for display and editing.
 */
export interface ThesisCriterionRow {
  field: CriterionField;
  operator: CriterionOperator;
  value: CriterionValue;
  priority: CriterionPriority;
  label: string;
  sortOrder: number;
}

export interface StoredThesisCriterion extends ThesisCriterionRow {
  id: string;
}

function capitalize(value: string): string {
  return value ? `${value[0]?.toLocaleUpperCase()}${value.slice(1)}` : value;
}

export function thesisCriteriaRowsForInput(input: ActiveThesisInput): ThesisCriterionRow[] {
  const rows: Omit<ThesisCriterionRow, "sortOrder">[] = [];

  for (const chip of input.sectors) {
    const mapped = mapSectorToken(chip);
    rows.push(mapped
      ? { field: "sector", operator: "equals", value: mapped, priority: "required", label: chip }
      : {
          field: "team_preferences",
          operator: "equals",
          value: chip,
          priority: "required",
          label: `${chip} (sector is not modeled in the current demo)`,
        });
  }

  for (const chip of input.stages) {
    const mapped = mapStageToken(chip);
    rows.push(mapped
      ? { field: "stage", operator: "equals", value: mapped, priority: "required", label: chip }
      : {
          field: "team_preferences",
          operator: "equals",
          value: chip,
          priority: "required",
          label: `${chip} (stage is not modeled in the current demo)`,
        });
  }

  for (const chip of input.geographies) {
    const mapped = mapGeographyToken(chip);
    rows.push(mapped
      ? { field: "geography", operator: "equals", value: mapped, priority: "required", label: chip }
      : {
          field: "team_preferences",
          operator: "equals",
          value: chip,
          priority: "required",
          label: `${chip} (geography is not modeled in the current demo)`,
        });
  }

  for (const signal of input.signals) {
    const normalized = normalizeLookup(signal);
    if (/working (product|demo)|functional (product|demo)/.test(normalized)) {
      rows.push({ field: "working_demo", operator: "equals", value: true, priority: "preferred", label: signal });
    } else if (/technical (activity|founder)|sustained technical/.test(normalized)) {
      rows.push({ field: "technical_founder", operator: "equals", value: true, priority: "preferred", label: signal });
    } else if (/enterprise use|traction|adoption|usage/.test(normalized)) {
      rows.push({ field: "traction", operator: "equals", value: true, priority: "preferred", label: signal });
    } else {
      rows.push({ field: "valued_signal_types", operator: "equals", value: signal, priority: "preferred", label: signal });
    }
  }

  for (const exclusion of input.exclusions) {
    const normalized = normalizeLookup(exclusion);
    if (/institutional (series a|funding|capital)|series a\+/.test(normalized)) {
      if (/funding|capital/.test(normalized)) {
        rows.push({ field: "institutional_funding", operator: "equals", value: true, priority: "exclude", label: exclusion });
      } else {
        rows.push({
          field: "stage",
          operator: "includes_any",
          value: ["series_a", "series_b"],
          priority: "exclude",
          label: exclusion,
        });
      }
    } else if (/crypto|web3/.test(normalized)) {
      rows.push({
        field: "sector",
        operator: "includes_any",
        value: ["crypto", "web3"],
        priority: "exclude",
        label: exclusion,
      });
    } else {
      rows.push({ field: "team_preferences", operator: "equals", value: exclusion, priority: "exclude", label: exclusion });
    }
  }

  rows.push({
    field: "check_size",
    operator: "between",
    value: [input.checkRange.min, input.checkRange.max],
    priority: "preferred",
    label: `Initial check $${compactUsd(input.checkRange.min)}–$${compactUsd(input.checkRange.max)}`,
  });
  rows.push({
    field: "acceptable_risk",
    operator: "equals",
    value: input.riskPosture,
    priority: "preferred",
    label: `${capitalize(input.riskPosture)} risk posture`,
  });

  return rows.map((row, sortOrder) => ({ ...row, sortOrder }));
}

const SIGNAL_FIELDS: CriterionField[] = ["working_demo", "technical_founder", "traction", "valued_signal_types"];

function numberPair(value: CriterionValue): [number, number] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [min, max] = value;
  return typeof min === "number" && typeof max === "number" ? [min, max] : null;
}

export function activeThesisFromStoredCriteria(params: {
  brief: string;
  criteria: StoredThesisCriterion[];
  updatedAt: string;
  /** `fund_theses.source_scope` lives on the thesis row itself, not a criterion row. */
  sourceScope?: string | null;
}): ActiveThesis {
  const sorted = [...params.criteria].sort((a, b) => a.sortOrder - b.sortOrder);

  const sectors = sorted.filter((row) => row.field === "sector" && row.priority !== "exclude").map((row) => row.label);
  const stages = sorted.filter((row) => row.field === "stage" && row.priority !== "exclude").map((row) => row.label);
  const geographies = sorted
    .filter((row) => row.field === "geography" && row.priority !== "exclude")
    .map((row) => row.label);
  const signals = sorted
    .filter((row) => row.priority === "preferred" && SIGNAL_FIELDS.includes(row.field))
    .map((row) => row.label);
  const exclusions = sorted.filter((row) => row.priority === "exclude").map((row) => row.label);

  const checkRow = sorted.find((row) => row.field === "check_size");
  const checkPair = checkRow ? numberPair(checkRow.value) : null;
  const checkRange = checkPair
    ? { currency: "USD" as const, min: checkPair[0], max: checkPair[1] }
    : { currency: "USD" as const, min: 100_000, max: 750_000 };

  const riskRow = sorted.find((row) => row.field === "acceptable_risk");
  const riskPosture: ThesisRiskPosture = riskRow
    && typeof riskRow.value === "string"
    && THESIS_RISK_POSTURES.includes(riskRow.value as ThesisRiskPosture)
    ? (riskRow.value as ThesisRiskPosture)
    : "balanced";

  const sourceScope: ThesisSourceScope = THESIS_SOURCE_SCOPES.includes(params.sourceScope as ThesisSourceScope)
    ? (params.sourceScope as ThesisSourceScope)
    : DEFAULT_THESIS_SOURCE_SCOPE;

  const criteria: SearchCriterion[] = sorted.map((row) => ({
    id: row.id,
    field: row.field,
    operator: row.operator,
    value: row.value,
    priority: row.priority,
    label: row.label,
  }));

  const input: ActiveThesisInput = {
    brief: params.brief,
    sectors,
    stages,
    geographies,
    signals,
    exclusions,
    checkRange,
    riskPosture,
    sourceScope,
  };

  return {
    version: 1,
    ...input,
    sourceScope,
    summary: formatThesisSummary(input),
    criteria,
    updatedAt: params.updatedAt,
  };
}
