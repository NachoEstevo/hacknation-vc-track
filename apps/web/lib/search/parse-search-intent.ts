import type {
  CriterionField,
  CriterionOperator,
  CriterionPriority,
  SearchCriterion,
  SearchIntent,
} from "../domain";

function normalizeQuery(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function criterionId(field: CriterionField, value: SearchCriterion["value"]): string {
  const suffix = Array.isArray(value) ? value.join("-") : String(value);
  return `${field}-${suffix}`.replace(/[^a-z0-9]+/g, "-");
}

export function parseSearchIntent(query: string): SearchIntent {
  const normalized = normalizeQuery(query);
  const criteria: SearchCriterion[] = [];
  const seen = new Set<string>();

  const add = (
    field: CriterionField,
    operator: CriterionOperator,
    value: SearchCriterion["value"],
    priority: CriterionPriority,
    label: string,
  ): void => {
    const id = criterionId(field, value);
    if (seen.has(id)) return;
    seen.add(id);
    criteria.push({ id, field, operator, value, priority, label });
  };

  const excludesCrypto = /\b(exclude|excluding|except|exclui|excluir|sin)\b[^.]{0,50}\b(crypto|web3)\b/.test(normalized);
  if (excludesCrypto) {
    add("sector", "includes_any", ["crypto", "web3"], "exclude", "Exclude crypto and web3");
  }

  const sectorPatterns: Array<[RegExp, string, string]> = [
    [/\b(ai|agent) infrastructure\b|\binfraestructura (de |para )?(ia|agentes)\b/, "ai_infrastructure", "AI infrastructure"],
    [/\b(ai security|security for ai|agent security)\b|\bseguridad (de |para )?(ia|agentes)\b/, "ai_security", "AI security"],
    [/\b(developer tools?|devtools?|tools? for developers?)\b|\bherramientas? para (desarrolladores|developers)\b/, "developer_tools", "Developer tools"],
    [/\benterprise ai\b|\bia empresarial\b/, "enterprise_ai", "Enterprise AI"],
    [/\bclimate( tech)?\b|\bclima(tica)?\b/, "climate_tech", "Climate tech"],
    [/\bhealth( tech)?\b|\bsalud\b/, "health_tech", "Health tech"],
    [/\bfintech\b/, "fintech", "Fintech"],
    [/\b(crypto|web3)\b/, "crypto", "Crypto or web3"],
  ];

  for (const [pattern, value, label] of sectorPatterns) {
    if (pattern.test(normalized) && !(excludesCrypto && value === "crypto")) {
      add("sector", "includes_any", [value], "required", label);
    }
  }

  if (/\b(latam|latin america|america latina|latinoamerica)\b/.test(normalized)) {
    add("geography", "includes_any", ["LATAM"], "required", "Latin America");
  }
  if (/\b(europe|europa)\b/.test(normalized)) {
    add("geography", "includes_any", ["EUROPE"], "required", "Europe");
  }

  const countryPatterns: Array<[RegExp, string, string]> = [
    [/\b(argentina)\b/, "AR", "Argentina"],
    [/\b(brazil|brasil)\b/, "BR", "Brazil"],
    [/\b(colombia)\b/, "CO", "Colombia"],
    [/\b(mexico)\b/, "MX", "Mexico"],
    [/\b(peru)\b/, "PE", "Peru"],
    [/\b(united kingdom|uk|reino unido)\b/, "GB", "United Kingdom"],
    [/\b(united states|usa|eeuu)\b/, "US", "United States"],
  ];
  for (const [pattern, value, label] of countryPatterns) {
    if (pattern.test(normalized)) {
      add("geography", "includes_any", [value], "required", label);
    }
  }

  if (/\bpre[- ]?seed\b|\bpresemilla\b/.test(normalized)) {
    add("stage", "equals", "pre_seed", "required", "Pre-seed");
  } else if (/\bseed\b|\bsemilla\b/.test(normalized)) {
    add("stage", "equals", "seed", "required", "Seed");
  }

  const teamLimit = normalized.match(
    /\b(under|below|fewer than|less than|menos de|hasta|up to)\s+(\d{1,3})\s+(people|employees|personas|empleados|team members)?\b/,
  );
  if (teamLimit) {
    const statedLimit = Number(teamLimit[2]);
    const exclusive = !/^(hasta|up to)$/.test(teamLimit[1] ?? "");
    const maximum = exclusive ? Math.max(1, statedLimit - 1) : statedLimit;
    add("team_size", "lte", maximum, "required", `Team of ${maximum} or fewer`);
  } else if (/\b(small teams?|equipos? pequenos?)\b/.test(normalized)) {
    add("team_size", "lte", 10, "required", "Small team (10 or fewer)");
  }

  if (/\btechnical founders?\b|\bfounders? tecnic[oa]s?\b/.test(normalized)) {
    add("technical_founder", "equals", true, "required", "Technical founder");
  }
  if (/\b(working|functional|live) (demo|product)\b|\b(demo|producto) funcional\b/.test(normalized)) {
    add("working_demo", "equals", true, "required", "Working demo");
  }
  if (/\b(hackathon[- ]born|born at a hackathon|from a hackathon)\b|\bnacid[oa]s? en (un )?hackathon\b/.test(normalized)) {
    add("hackathon_origin", "equals", true, "required", "Hackathon-born");
  }
  if (/\b(traction|adoption|usage signals?|senales? de (uso|adopcion|traccion))\b/.test(normalized)) {
    add("traction", "equals", true, "preferred", "Evidence of traction");
  }
  if (/\b(not raising|isn'?t raising|not fundraising|no estan? levantando|sin fundraising)\b/.test(normalized)) {
    add("raising", "equals", false, "required", "Not currently raising");
  }
  if (/\b(no|without|hasn'?t raised|not raised|sin)\b[^.]{0,45}\b(institutional (funding|capital|round)|venture capital|inversion institucional|capital institucional)\b/.test(normalized)) {
    add(
      "institutional_funding",
      "equals",
      true,
      "exclude",
      "No institutional funding",
    );
  }

  const sourceScope = /\b(internal only|only internal|solo interna|solo base interna)\b/.test(normalized)
    ? "internal"
    : "internal_then_public";

  return { query, criteria, sourceScope };
}
