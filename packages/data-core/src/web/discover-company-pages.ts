import { load } from "cheerio";

const PRIORITIES = ["about", "team", "company", "founder", "leadership", "people"];

export function discoverCompanyPages(html: string, homeUrl: URL): string[] {
  const $ = load(html);
  const candidates = new Map<string, number>();
  $("a[href]").each((_index, element) => {
    try {
      const url = new URL($(element).attr("href") ?? "", homeUrl);
      if (url.origin !== homeUrl.origin || !["http:", "https:"].includes(url.protocol)) return;
      url.hash = "";
      const haystack = `${url.pathname} ${$(element).text()}`.toLowerCase();
      const score = PRIORITIES.findIndex((word) => haystack.includes(word));
      if (score < 0) return;
      const value = url.toString();
      candidates.set(value, Math.min(candidates.get(value) ?? 99, score));
    } catch {
      // Ignore malformed links.
    }
  });
  return [...candidates.entries()]
    .sort(([a, aScore], [b, bScore]) => aScore - bScore || a.length - b.length)
    .slice(0, 3)
    .map(([url]) => url);
}
