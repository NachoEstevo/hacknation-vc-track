import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL(
    "../../../supabase/migrations/20260719130000_seed_hack_nation_founder_research.sql",
    import.meta.url,
  ),
);

describe("Hack-Nation founder seed migration", () => {
  it("loads the dedicated discovery tables and owner-submitted Rely record", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain("insert into public.hack_nation_participants");
    expect(migration).toContain("insert into public.hack_nation_startup_candidates");
    expect(migration).toContain('"companyName":"ByteAsk"');
    expect(migration).toContain("'rely.business', 'Rely'");
    expect(migration).toContain("'Ignacio Estevo'");
  });
});
