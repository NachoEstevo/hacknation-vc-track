import {
  isSearchCriterion,
  type SearchCriterion,
} from "./types";

export const THESIS_RISK_POSTURES = ["focused", "balanced", "frontier"] as const;

export type ThesisRiskPosture = (typeof THESIS_RISK_POSTURES)[number];

/** Mirrors `fund_theses.source_scope` (see the `product_platform_core` migration): where sourcing looks before it opens up to public discovery. */
export const THESIS_SOURCE_SCOPES = ["internal", "internal_then_public"] as const;

export type ThesisSourceScope = (typeof THESIS_SOURCE_SCOPES)[number];

export const DEFAULT_THESIS_SOURCE_SCOPE: ThesisSourceScope = "internal_then_public";

export interface ThesisCheckRange {
  currency: "USD";
  min: number;
  max: number;
}

export interface ActiveThesis {
  version: 1;
  brief: string;
  summary: string;
  sectors: string[];
  stages: string[];
  geographies: string[];
  signals: string[];
  exclusions: string[];
  checkRange: ThesisCheckRange;
  riskPosture: ThesisRiskPosture;
  sourceScope: ThesisSourceScope;
  criteria: SearchCriterion[];
  updatedAt: string;
}

export type ActiveThesisInput = Omit<
  ActiveThesis,
  "version" | "summary" | "criteria" | "updatedAt" | "sourceScope"
> & {
  /** Optional so every existing caller keeps compiling; `createActiveThesis` fills in the default. */
  sourceScope?: ThesisSourceScope;
};

const SUPPORTED_SECTORS: Record<string, string> = {
  "ai infrastructure": "ai_infrastructure",
  "developer tools": "developer_tools",
  devtools: "developer_tools",
  security: "ai_security",
  "ai security": "ai_security",
  "enterprise ai": "enterprise_ai",
  "climate tech": "climate_tech",
  healthtech: "health_tech",
  "health tech": "health_tech",
  fintech: "fintech",
  crypto: "crypto",
  web3: "web3",
};

const SUPPORTED_STAGES: Record<string, string> = {
  "pre-seed": "pre_seed",
  preseed: "pre_seed",
  seed: "seed",
  "series a": "series_a",
  "series b": "series_b",
};

const SUPPORTED_GEOGRAPHIES: Record<string, string> = {
  "latin america": "LATAM",
  latam: "LATAM",
  argentina: "AR",
  brazil: "BR",
  brasil: "BR",
  colombia: "CO",
  mexico: "MX",
  peru: "PE",
  "united states": "US",
  usa: "US",
  "united kingdom": "GB",
  uk: "GB",
  europe: "EUROPE",
};

export function normalizeLookup(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Single-label lookups reused by database-backed persistence, which stores one criterion row per chip. */
export function mapSectorToken(label: string): string | null {
  return SUPPORTED_SECTORS[normalizeLookup(label)] ?? null;
}
export function mapStageToken(label: string): string | null {
  return SUPPORTED_STAGES[normalizeLookup(label)] ?? null;
}
export function mapGeographyToken(label: string): string | null {
  return SUPPORTED_GEOGRAPHIES[normalizeLookup(label)] ?? null;
}

function normalizeList(values: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const item = value.trim().replace(/\s+/g, " ").slice(0, 120);
    const key = item.toLocaleLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    normalized.push(item);
    if (normalized.length === 24) break;
  }
  return normalized;
}

function mappedEntries(values: string[], mapping: Record<string, string>): {
  labels: string[];
  values: string[];
  unsupported: string[];
} {
  const labels: string[] = [];
  const mapped: string[] = [];
  const unsupported: string[] = [];
  for (const value of values) {
    const mappedValue = mapping[normalizeLookup(value)];
    if (!mappedValue) {
      unsupported.push(value);
      continue;
    }
    labels.push(value);
    mapped.push(mappedValue);
  }
  return { labels, values: [...new Set(mapped)], unsupported };
}

export function compactUsd(value: number): string {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: value < 1_000_000 ? 0 : 1,
  }).format(value).toLocaleLowerCase();
}

export function describeSourceScope(scope: ThesisSourceScope): string {
  return scope === "internal" ? "Internal only" : "Internal first + public";
}

/**
 * A compact, real-data summary for the home screen's thesis chip: geography
 * codes (falling back to the raw label when unmapped) plus the first stage
 * and sector, then how many remaining thesis facts aren't shown. Never
 * invents a category — every word comes from the caller's own thesis.
 */
export function buildThesisChipLabel(thesis: ActiveThesis | null): string {
  if (!thesis) return "Thesis not configured yet";

  const factCount = thesis.geographies.length
    + thesis.stages.length
    + thesis.sectors.length
    + thesis.signals.length
    + thesis.exclusions.length;
  if (factCount === 0) return "No sourcing criteria yet";

  const shownGeographies = thesis.geographies.slice(0, 2);
  const geoText = shownGeographies.map((geo) => mapGeographyToken(geo) ?? geo).join("/");
  const stageText = thesis.stages[0] ?? "";
  const sectorText = thesis.sectors[0] ?? "";
  const headline = [geoText, [stageText, sectorText].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(" · ");

  const shownCount = shownGeographies.length + (stageText ? 1 : 0) + (sectorText ? 1 : 0);
  const remaining = factCount - shownCount;

  if (!headline) {
    return remaining > 0 ? `${remaining} sourcing signal${remaining === 1 ? "" : "s"}` : "No sourcing criteria yet";
  }
  return remaining > 0 ? `${headline} · +${remaining}` : headline;
}

export function formatThesisSummary(input: ActiveThesisInput): string {
  const sectorText = input.sectors.length ? input.sectors.join(", ") : "open sectors";
  const stageText = input.stages.length ? input.stages.join(" and ") : "any early stage";
  const geoText = input.geographies.length ? input.geographies.join(", ") : "any geography";
  return `Looking for ${stageText.toLocaleLowerCase()} companies in ${sectorText}, led by early teams across ${geoText}. Typical initial check: $${compactUsd(input.checkRange.min)}–$${compactUsd(input.checkRange.max)}.`;
}

function configurationCriterion(
  id: string,
  field: "acceptable_risk" | "check_size" | "team_preferences" | "valued_signal_types",
  value: SearchCriterion["value"],
  priority: SearchCriterion["priority"],
  label: string,
  operator: SearchCriterion["operator"] = "equals",
): SearchCriterion {
  return { id, field, operator, value, priority, label };
}

export function criteriaForActiveThesis(input: ActiveThesisInput): SearchCriterion[] {
  const criteria: SearchCriterion[] = [];
  const sectors = mappedEntries(input.sectors, SUPPORTED_SECTORS);
  const stages = mappedEntries(input.stages, SUPPORTED_STAGES);
  const geographies = mappedEntries(input.geographies, SUPPORTED_GEOGRAPHIES);

  if (sectors.values.length) {
    criteria.push({
      id: "thesis-sectors",
      field: "sector",
      operator: "includes_any",
      value: sectors.values,
      priority: "required",
      label: `Selected sectors: ${sectors.labels.join(", ")}`,
    });
  }
  if (stages.values.length) {
    criteria.push({
      id: "thesis-stages",
      field: "stage",
      operator: "includes_any",
      value: stages.values,
      priority: "required",
      label: `Selected stages: ${stages.labels.join(", ")}`,
    });
  }
  if (geographies.values.length) {
    criteria.push({
      id: "thesis-geographies",
      field: "geography",
      operator: "includes_any",
      value: geographies.values,
      priority: "required",
      label: `Selected geographies: ${geographies.labels.join(", ")}`,
    });
  }

  for (const [group, unsupported] of [
    ["sector", sectors.unsupported],
    ["stage", stages.unsupported],
    ["geography", geographies.unsupported],
  ] as const) {
    for (const [index, value] of unsupported.entries()) {
      criteria.push(configurationCriterion(
        `thesis-${group}-${index}-configuration`,
        "team_preferences",
        value,
        "required",
        `${value} (${group} is not modeled in the current demo)`,
      ));
    }
  }

  for (const [index, signal] of input.signals.entries()) {
    const normalized = normalizeLookup(signal);
    if (/working (product|demo)|functional (product|demo)/.test(normalized)) {
      criteria.push({
        id: `thesis-signal-${index}-working-demo`,
        field: "working_demo",
        operator: "equals",
        value: true,
        priority: "preferred",
        label: signal,
      });
    } else if (/technical (activity|founder)|sustained technical/.test(normalized)) {
      criteria.push({
        id: `thesis-signal-${index}-technical-founder`,
        field: "technical_founder",
        operator: "equals",
        value: true,
        priority: "preferred",
        label: signal,
      });
    } else if (/enterprise use|traction|adoption|usage/.test(normalized)) {
      criteria.push({
        id: `thesis-signal-${index}-traction`,
        field: "traction",
        operator: "equals",
        value: true,
        priority: "preferred",
        label: signal,
      });
    } else {
      criteria.push(configurationCriterion(
        `thesis-signal-${index}-configuration`,
        "valued_signal_types",
        signal,
        "preferred",
        signal,
      ));
    }
  }

  for (const [index, exclusion] of input.exclusions.entries()) {
    const normalized = normalizeLookup(exclusion);
    if (/institutional (series a|funding|capital)|series a\+/.test(normalized)) {
      const value = /funding|capital/.test(normalized)
        ? true
        : ["series_a", "series_b"];
      criteria.push({
        id: `thesis-exclusion-${index}-institutional`,
        field: /funding|capital/.test(normalized) ? "institutional_funding" : "stage",
        operator: Array.isArray(value) ? "includes_any" : "equals",
        value,
        priority: "exclude",
        label: exclusion,
      });
    } else if (/crypto|web3/.test(normalized)) {
      criteria.push({
        id: `thesis-exclusion-${index}-sector`,
        field: "sector",
        operator: "includes_any",
        value: ["crypto", "web3"],
        priority: "exclude",
        label: exclusion,
      });
    } else {
      criteria.push(configurationCriterion(
        `thesis-exclusion-${index}-configuration`,
        "team_preferences",
        exclusion,
        "exclude",
        exclusion,
      ));
    }
  }

  criteria.push(configurationCriterion(
    "thesis-check-range",
    "check_size",
    [input.checkRange.min, input.checkRange.max],
    "preferred",
    `Initial check $${compactUsd(input.checkRange.min)}–$${compactUsd(input.checkRange.max)}`,
    "between",
  ));
  criteria.push(configurationCriterion(
    "thesis-risk-posture",
    "acceptable_risk",
    input.riskPosture,
    "preferred",
    `${input.riskPosture[0]?.toLocaleUpperCase()}${input.riskPosture.slice(1)} risk posture`,
  ));

  return criteria;
}

export function createActiveThesis(
  input: ActiveThesisInput,
  updatedAt = new Date().toISOString(),
): ActiveThesis {
  const normalizedInput = {
    brief: input.brief.trim().replace(/\s+/g, " ").slice(0, 1000),
    sectors: normalizeList(input.sectors),
    stages: normalizeList(input.stages),
    geographies: normalizeList(input.geographies),
    signals: normalizeList(input.signals),
    exclusions: normalizeList(input.exclusions),
    checkRange: { ...input.checkRange },
    riskPosture: input.riskPosture,
    sourceScope: input.sourceScope ?? DEFAULT_THESIS_SOURCE_SCOPE,
  };

  if (!normalizedInput.brief) throw new Error("A sourcing brief is required.");
  if (
    normalizedInput.checkRange.currency !== "USD"
    || !Number.isFinite(normalizedInput.checkRange.min)
    || !Number.isFinite(normalizedInput.checkRange.max)
    || normalizedInput.checkRange.min <= 0
    || normalizedInput.checkRange.max <= 0
    || normalizedInput.checkRange.min > normalizedInput.checkRange.max
  ) {
    throw new Error("The check range must use positive USD values with a minimum at or below the maximum.");
  }
  if (!THESIS_RISK_POSTURES.includes(normalizedInput.riskPosture)) {
    throw new Error("The risk posture is not supported.");
  }

  return {
    version: 1,
    ...normalizedInput,
    summary: formatThesisSummary(normalizedInput),
    criteria: criteriaForActiveThesis(normalizedInput),
    updatedAt,
  };
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length <= 24
    && value.every((item) => typeof item === "string" && Boolean(item.trim()) && item.length <= 120);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Runtime boundary for browser persistence and future account-backed adapters. */
export function isActiveThesis(value: unknown): value is ActiveThesis {
  if (!isRecord(value) || value.version !== 1) return false;
  if (typeof value.brief !== "string" || !value.brief.trim() || value.brief.length > 1000) return false;
  if (typeof value.summary !== "string" || !value.summary.trim() || value.summary.length > 2000) return false;
  if (!isStringList(value.sectors) || !isStringList(value.stages)) return false;
  if (!isStringList(value.geographies) || !isStringList(value.signals) || !isStringList(value.exclusions)) return false;
  if (!isRecord(value.checkRange) || value.checkRange.currency !== "USD") return false;
  if (typeof value.checkRange.min !== "number" || !Number.isFinite(value.checkRange.min)) return false;
  if (typeof value.checkRange.max !== "number" || !Number.isFinite(value.checkRange.max)) return false;
  if (value.checkRange.min <= 0 || value.checkRange.max <= 0 || value.checkRange.min > value.checkRange.max) return false;
  if (!THESIS_RISK_POSTURES.includes(value.riskPosture as ThesisRiskPosture)) return false;
  // Optional for backward compatibility with thesis objects persisted before this field existed;
  // `buildThesisChipLabel`/`describeSourceScope` callers default a missing value themselves.
  if (value.sourceScope !== undefined && !THESIS_SOURCE_SCOPES.includes(value.sourceScope as ThesisSourceScope)) return false;
  if (!Array.isArray(value.criteria) || !value.criteria.every(isSearchCriterion)) return false;
  if (typeof value.updatedAt !== "string" || Number.isNaN(Date.parse(value.updatedAt))) return false;
  return true;
}

export function parseCurrencyAmount(value: string): number | null {
  const normalized = value
    .trim()
    .toLocaleLowerCase()
    .replaceAll("$", "")
    .replaceAll(",", "")
    .replace(/\s+/g, "");
  const match = normalized.match(/^(\d+(?:\.\d+)?)([km])?$/);
  if (!match) return null;
  const amount = Number(match[1]);
  const multiplier = match[2] === "m" ? 1_000_000 : match[2] === "k" ? 1_000 : 1;
  const result = amount * multiplier;
  return Number.isFinite(result) && result > 0 && Number.isSafeInteger(result)
    ? result
    : null;
}
