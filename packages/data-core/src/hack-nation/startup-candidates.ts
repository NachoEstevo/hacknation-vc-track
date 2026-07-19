export interface HackNationPublicPerson {
  user_id?: string;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  avatar_url?: string | null;
  university?: string | null;
  field_of_study?: string | null;
  academic_degree?: string | null;
  professional_situation?: string | null;
  tagline?: string | null;
  country?: string | null;
  city?: string | null;
  github_url?: string | null;
  linkedin_url?: string | null;
}

export interface HackNationStartupResearchCandidate {
  sourceUserId: string;
  publicProfileUrl: string;
  fullName: string;
  displayName: string | null;
  profileCompleteness: number;
  startupSignals: string[];
  profile: {
    professionalSituation: string | null;
    tagline: string | null;
    university: string | null;
    fieldOfStudy: string | null;
    academicDegree: string | null;
    location: string | null;
    githubUrl: string | null;
    linkedinUrl: string | null;
  };
  researchStatus: "queued";
  researchInstructions: string;
}

const startupSignalPatterns: Array<[string, RegExp]> = [
  ["founder", /\b(?:co[- ]?)?founder\b/i],
  ["ceo", /\bceo\b|chief executive officer/i],
  ["startup", /\bstart[- ]?up\b/i],
  ["entrepreneur", /\bentrepreneur\b/i],
  ["business_owner", /\bbusiness owner\b/i],
];

const meaningful = (value: string | null | undefined): value is string =>
  typeof value === "string" && value.trim().length > 0;

export function personFullName(person: HackNationPublicPerson): string | null {
  const name = [person.first_name, person.last_name]
    .filter(meaningful)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (name) return name;
  if (meaningful(person.display_name) && person.display_name.trim() !== "(removed account)") {
    return person.display_name.trim();
  }
  return null;
}

export function profileCompleteness(person: HackNationPublicPerson): number {
  return [
    person.university,
    person.field_of_study,
    person.academic_degree,
    person.professional_situation,
    person.tagline,
    person.country,
    person.city,
  ].filter(meaningful).length;
}

export function startupSignals(person: HackNationPublicPerson): string[] {
  const searchableText = [person.professional_situation, person.tagline]
    .filter(meaningful)
    .join(" ");

  return startupSignalPatterns
    .filter(([, pattern]) => pattern.test(searchableText))
    .map(([signal]) => signal);
}

export function selectHackNationStartupCandidates(
  people: HackNationPublicPerson[],
): HackNationStartupResearchCandidate[] {
  return people
    .map((person) => {
      const fullName = personFullName(person);
      const completeness = profileCompleteness(person);
      const signals = startupSignals(person);
      if (!person.user_id || !fullName || completeness < 5 || signals.length === 0) return null;

      return {
        sourceUserId: person.user_id,
        publicProfileUrl: `https://projects.hack-nation.ai/#/profile/${person.user_id}`,
        fullName,
        displayName: meaningful(person.display_name) ? person.display_name.trim() : null,
        profileCompleteness: completeness,
        startupSignals: signals,
        profile: {
          professionalSituation: meaningful(person.professional_situation)
            ? person.professional_situation.trim()
            : null,
          tagline: meaningful(person.tagline) ? person.tagline.trim() : null,
          university: meaningful(person.university) ? person.university.trim() : null,
          fieldOfStudy: meaningful(person.field_of_study) ? person.field_of_study.trim() : null,
          academicDegree: meaningful(person.academic_degree) ? person.academic_degree.trim() : null,
          location: [person.city, person.country].filter(meaningful).join(", ") || null,
          githubUrl: meaningful(person.github_url) ? person.github_url.trim() : null,
          linkedinUrl: meaningful(person.linkedin_url) ? person.linkedin_url.trim() : null,
        },
        researchStatus: "queued" as const,
        researchInstructions:
          "Identify a current startup or company explicitly associated with this person. Use only public sources, cite URLs, and leave the company unresolved when identity or affiliation is ambiguous. Prefer the linked GitHub and LinkedIn profiles when available. Do not infer a company from a job title alone.",
      };
    })
    .filter((candidate): candidate is HackNationStartupResearchCandidate => candidate !== null)
    .sort((left, right) => left.fullName.localeCompare(right.fullName));
}
