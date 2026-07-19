import { describe, expect, it } from "vitest";
import { assessUsEarlyStageRow, buildImportBatch, parseClayCsv, parseUsEarlyStageCsv } from "../src/index.js";

const csv = `Rank,Nombre,Website,Ciudad y estado,Sector,Descripción concreta del producto,Etapa estimada,Cantidad estimada de empleados
1,Alpha,https://www.alpha.ai/,"Austin, Texas",AI infrastructure / developer tools,A hosted developer platform,Seed,2–20 (inferencia)
2,Beta,No encontrado,"New York, New York",Cybersecurity / AI agents,A security product,Seed,2–20 (inferencia)
3,Gamma,https://gamma.bio/,"Boston, Massachusetts",Bioengineering / AI therapeutics,A therapeutics platform,Seed,2–20 (inferencia)
4,Delta,https://delta.ai/,"San Francisco, California",AI infrastructure,A platform,Series A,11–50 (inferencia)`;

describe("US early-stage selection", () => {
  it("accepts only small, early, public-domain software candidates", () => {
    const rows = parseUsEarlyStageCsv(csv);
    expect(assessUsEarlyStageRow(rows[0]!, 2)).toMatchObject({ decision: "accepted", domain: "alpha.ai" });
    expect(assessUsEarlyStageRow(rows[1]!, 3).reasons).toContain("missing_public_domain");
    expect(assessUsEarlyStageRow(rows[2]!, 4).reasons).toContain("physical_or_life_science_business");
    expect(assessUsEarlyStageRow(rows[3]!, 5).reasons).toContain("later_stage");
  });

  it("keeps the transformed canonical identity deterministic", () => {
    const batch = buildImportBatch(parseClayCsv(`Ignored,Name,Description,Primary Industry,Size,Type,Location,Country,Domain,LinkedIn URL
,Alpha,A hosted developer platform,AI infrastructure / developer tools,2–20 (inferencia),Privately Held,"Austin, Texas",United States,https://www.alpha.ai/,`));
    expect(batch.companies).toHaveLength(1);
    expect(batch.companies[0]?.dedupeKey).toBe("domain:alpha.ai");
    expect(batch.companies[0]?.stableId).toMatch(/^[a-f0-9]{24}$/);
  });
});
