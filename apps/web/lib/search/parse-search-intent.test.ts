import { describe, expect, it } from "vitest";
import { parseSearchIntent } from "./parse-search-intent";

describe("parseSearchIntent", () => {
  it("parses the core investor query into inspectable criteria", () => {
    const intent = parseSearchIntent(
      "Find technical founders in Latin America building AI infrastructure with teams under 6 and no institutional funding.",
    );

    expect(intent.criteria).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "technical_founder", value: true }),
      expect.objectContaining({ field: "geography", value: ["LATAM"] }),
      expect.objectContaining({ field: "sector", value: ["ai_infrastructure"] }),
      expect.objectContaining({ field: "team_size", operator: "lte", value: 5 }),
      expect.objectContaining({
        field: "institutional_funding",
        priority: "exclude",
        value: true,
      }),
    ]));
  });

  it("recognizes Spanish refinements and explicit exclusions", () => {
    const intent = parseSearchIntent(
      "Mostrame equipos pequeños de seguridad de IA nacidos en un hackathon, con demo funcional; excluí web3.",
    );

    expect(intent.criteria).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "team_size", value: 10 }),
      expect.objectContaining({ field: "sector", value: ["ai_security"] }),
      expect.objectContaining({ field: "hackathon_origin", value: true }),
      expect.objectContaining({ field: "working_demo", value: true }),
      expect.objectContaining({ field: "sector", priority: "exclude", value: ["crypto", "web3"] }),
    ]));
  });
});
