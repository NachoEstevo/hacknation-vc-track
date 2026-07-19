/**
 * Deterministic contact-channel extraction — no model involved. Scans the
 * dossier markdown plus the candidate's seed links for direct ways to reach
 * a person (LinkedIn, GitHub, X) so the profile header always surfaces them,
 * even when the original card carried only press links.
 */

export type ContactNetwork = "linkedin" | "github" | "x";

export interface PersonLink {
  url: string;
  title: string;
  network: ContactNetwork | "other";
}

const NETWORK_ORDER: ContactNetwork[] = ["linkedin", "github", "x"];
const NETWORK_TITLE: Record<ContactNetwork, string> = {
  linkedin: "LinkedIn",
  github: "GitHub",
  x: "X",
};

/** GitHub root paths that are product pages, not user/org profiles. */
const GITHUB_NON_USERS = new Set([
  "about", "apps", "collections", "customer-stories", "enterprise", "explore",
  "features", "login", "marketplace", "orgs", "pricing", "search", "settings",
  "sponsors", "topics", "trending",
]);

/** X root paths that are app plumbing, not profile handles. */
const X_NON_HANDLES = new Set(["hashtag", "home", "i", "intent", "search", "share"]);

const URL_PATTERN = /https?:\/\/[^\s)\]"'<>]+/g;

function parseUrl(raw: string): URL | null {
  try {
    const url = new URL(raw.replace(/[).,;:!?]+$/, ""));
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function hostOf(url: URL): string {
  return url.hostname.replace(/^www\./, "").toLowerCase();
}

function normalized(url: URL): string {
  const path = url.pathname.replace(/\/+$/, "");
  return `https://${hostOf(url)}${path}`;
}

/**
 * Classifies a URL as a contact channel and reduces it to its canonical
 * profile root: a GitHub repo collapses to its owner, an X status to its
 * handle, twitter.com to x.com. Returns null for anything that is not a
 * direct way to reach a person.
 */
function contactOf(url: URL): { network: ContactNetwork; url: string } | null {
  const host = hostOf(url);
  const segments = url.pathname.split("/").filter(Boolean);

  if (host === "linkedin.com" || host.endsWith(".linkedin.com")) {
    if (segments.length < 2 || (segments[0] !== "in" && segments[0] !== "company")) return null;
    return { network: "linkedin", url: `https://linkedin.com/${segments[0]}/${segments[1]}` };
  }

  if (host === "github.com") {
    const owner = segments[0];
    if (!owner || GITHUB_NON_USERS.has(owner.toLowerCase())) return null;
    return { network: "github", url: `https://github.com/${owner}` };
  }

  if (host === "x.com" || host === "twitter.com") {
    const handle = segments[0];
    if (!handle || X_NON_HANDLES.has(handle.toLowerCase())) return null;
    return { network: "x", url: `https://x.com/${handle}` };
  }

  return null;
}

/**
 * The profile header's link row: direct contact channels first (LinkedIn,
 * GitHub, X — harvested from the dossier text and the seed links alike),
 * then the seed's remaining evidence links, deduplicated, capped at `max`.
 */
export function mergePersonLinks(
  seedLinks: readonly { url: string; title: string }[],
  dossierMarkdown: string,
  max = 8,
): PersonLink[] {
  const candidates = [
    ...seedLinks.map((link) => link.url),
    ...(dossierMarkdown.match(URL_PATTERN) ?? []),
  ];

  const contactsByNetwork = new Map<ContactNetwork, Map<string, PersonLink>>();
  for (const raw of candidates) {
    const url = parseUrl(raw);
    if (!url) continue;
    const contact = contactOf(url);
    if (!contact) continue;
    const byUrl = contactsByNetwork.get(contact.network) ?? new Map<string, PersonLink>();
    if (!byUrl.has(contact.url)) {
      byUrl.set(contact.url, { url: contact.url, title: NETWORK_TITLE[contact.network], network: contact.network });
    }
    contactsByNetwork.set(contact.network, byUrl);
  }

  const merged: PersonLink[] = [];
  const seen = new Set<string>();
  for (const network of NETWORK_ORDER) {
    // At most two per network: a person plus their company page, not a pile.
    for (const link of [...(contactsByNetwork.get(network)?.values() ?? [])].slice(0, 2)) {
      const parsed = parseUrl(link.url);
      if (!parsed) continue;
      seen.add(normalized(parsed));
      merged.push(link);
    }
  }

  for (const link of seedLinks) {
    const parsed = parseUrl(link.url);
    if (!parsed) continue;
    const key = normalized(parsed);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ url: link.url, title: link.title, network: "other" });
  }

  return merged.slice(0, max);
}
