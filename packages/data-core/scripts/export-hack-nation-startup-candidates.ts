import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  selectHackNationStartupCandidates,
  type HackNationPublicPerson,
} from "../src/hack-nation/startup-candidates.js";

const peopleEndpoint = "https://projects.hack-nation.ai/.netlify/functions/bff-public-people-v2?limit=5000";
const profilesEndpoint = "https://projects.hack-nation.ai/.netlify/functions/bff-public-profiles-v2";
const outputPath = resolve(process.cwd(), "../../data/source/hack-nation-startup-research-candidates.json");

interface PublicPeopleResponse {
  data?: { people?: HackNationPublicPerson[] };
}

interface PublicProfilesResponse {
  data?: HackNationPublicPerson[];
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Hack-Nation public request failed: ${response.status} for ${url}`);
  return (await response.json()) as T;
}

const peoplePayload = await fetchJson<PublicPeopleResponse>(peopleEndpoint);
const people = peoplePayload.data?.people;
if (!Array.isArray(people)) throw new Error("Hack-Nation public people response did not contain data.people");

const candidateIds = selectHackNationStartupCandidates(people).map((candidate) => candidate.sourceUserId);
const profiles = new Map<string, HackNationPublicPerson>();

for (let index = 0; index < candidateIds.length; index += 100) {
  const userIds = candidateIds.slice(index, index + 100);
  const query = new URLSearchParams({ userIds: userIds.join(","), limit: String(userIds.length) });
  const payload = await fetchJson<PublicProfilesResponse>(`${profilesEndpoint}?${query}`);
  for (const profile of payload.data ?? []) {
    if (profile.user_id) profiles.set(profile.user_id, profile);
  }
}

const candidates = selectHackNationStartupCandidates(
  people.map((person) => ({ ...person, ...profiles.get(person.user_id ?? "") })),
);
const artifact = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: {
    name: "Hack-Nation public people directory and public profile endpoint",
    peopleEndpoint,
    profilesEndpoint,
    retrievedProfileCount: people.length,
    access: "public",
  },
  selection: {
    minimumProfileCompleteness: 5,
    requiredStartupSignals: ["founder", "ceo", "startup", "entrepreneur", "business_owner"],
    excludedSignals: ["generic building or developer language without a startup-role signal"],
  },
  candidateCount: candidates.length,
  candidates,
};

await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
console.log(`Wrote ${candidates.length} research candidates to ${outputPath}`);
