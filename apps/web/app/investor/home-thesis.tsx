"use client";

import { useRouter } from "next/navigation";
import { ArrowUp, ArrowUpRight, Check, ChevronDown, Globe, Layers3, Search, Users } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useWorkspace } from "@/components/workspace-provider";
import {
  DEFAULT_TARGET_CANDIDATES,
  TARGET_CANDIDATE_OPTIONS,
  type SearchDataSource,
  type SearchGeography,
} from "@/lib/search";
import styles from "./page.module.css";

const DATA_SOURCE_OPTIONS: readonly {
  value: SearchDataSource;
  label: string;
  enabled: boolean;
}[] = [
  { value: "undr_engine", label: "undr engine", enabled: true },
  { value: "web_search", label: "Web search", enabled: true },
  { value: "hack_nation", label: "HackNation", enabled: true },
  { value: "internal_catalog", label: "Internal catalog", enabled: false },
  { value: "registered_founders", label: "Registered founders", enabled: false },
  { value: "github", label: "GitHub", enabled: false },
];

const ALL_LOCATIONS: SearchGeography = { kind: "all", label: "All locations" };

const GEOGRAPHY_REGIONS: readonly SearchGeography[] = [
  { kind: "region", label: "Latin America" },
  { kind: "region", label: "North America" },
  { kind: "region", label: "Europe" },
  { kind: "region", label: "Asia" },
  { kind: "region", label: "Africa" },
  { kind: "region", label: "Middle East" },
  { kind: "region", label: "Oceania" },
];

const GEOGRAPHY_COUNTRIES: readonly SearchGeography[] = [
  "Argentina", "Australia", "Austria", "Bangladesh", "Belgium", "Bolivia",
  "Brazil", "Bulgaria", "Canada", "Chile", "China", "Colombia", "Costa Rica",
  "Croatia", "Czech Republic", "Denmark", "Dominican Republic", "Ecuador",
  "Egypt", "El Salvador", "Estonia", "Finland", "France", "Germany", "Ghana",
  "Greece", "Guatemala", "Honduras", "Hong Kong", "Hungary", "Iceland",
  "India", "Indonesia", "Ireland", "Israel", "Italy", "Japan", "Kenya",
  "Latvia", "Lithuania", "Luxembourg", "Malaysia", "Mexico", "Morocco",
  "Netherlands", "New Zealand", "Nigeria", "Norway", "Pakistan", "Panama",
  "Paraguay", "Peru", "Philippines", "Poland", "Portugal", "Romania",
  "Rwanda", "Saudi Arabia", "Senegal", "Serbia", "Singapore", "Slovakia",
  "Slovenia", "South Africa", "South Korea", "Spain", "Sweden", "Switzerland",
  "Taiwan", "Thailand", "Turkey", "Ukraine", "United Arab Emirates",
  "United Kingdom", "United States", "Uruguay", "Venezuela", "Vietnam",
].map((label) => ({ kind: "country", label }));

/** Accent- and case-insensitive contains-match, so "peru" or "Perú" both find "Peru". */
function matchesQuery(label: string, query: string): boolean {
  const normalize = (value: string) =>
    value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return normalize(label).includes(normalize(query.trim()));
}

/** First name for the greeting: the Settings-edited profile name wins over the server-provided fallback. */
export function HomeGreetingName({ fallback }: { fallback: string }) {
  const { profileName, hasHydrated } = useWorkspace();
  const name = (hasHydrated && profileName) || fallback;
  return <>{name.split(" ")[0]}</>;
}

/** Chip that opens a small listbox menu; closes on outside click or Escape. */
function ChipMenu({
  icon,
  label,
  menuLabel,
  children,
  open,
  onToggle,
  onClose,
}: {
  icon: ReactNode;
  label: string;
  menuLabel: string;
  children: ReactNode;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!(event.target instanceof Node)) return;
      if (wrapRef.current?.contains(event.target)) return;
      onClose();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  return (
    <div className={styles.scopeChipWrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.scopeChip}
        onClick={onToggle}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {icon}
        {label}
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open ? (
        <ul className={styles.scopeMenu} role="listbox" aria-label={menuLabel}>
          {children}
        </ul>
      ) : null}
    </div>
  );
}

function GeographyOption({
  option,
  selected,
  onSelect,
}: {
  option: SearchGeography;
  selected: boolean;
  onSelect: (option: SearchGeography) => void;
}) {
  return (
    <li>
      <button
        type="button"
        role="option"
        aria-selected={selected}
        className={styles.scopeMenuOption}
        onClick={() => onSelect(option)}
      >
        <span>{option.label}</span>
        {selected ? <Check size={13} aria-hidden="true" /> : null}
      </button>
    </li>
  );
}

/** The Pencil `Search Box`, compact: one input line + a bar with data source, location, thesis link, send. */
export function HomeSearchComposer(_props: { fallbackQuery?: string }) {
  const router = useRouter();
  const { startSearchSession, searchSessionError } = useWorkspace();
  const [error, setError] = useState("");
  const [openMenu, setOpenMenu] = useState<"source" | "geography" | "count" | null>(null);
  const [dataSource, setDataSource] = useState<SearchDataSource>("undr_engine");
  const [geography, setGeography] = useState<SearchGeography>(ALL_LOCATIONS);
  const [targetCandidates, setTargetCandidates] = useState<number>(DEFAULT_TARGET_CANDIDATES);
  const [geoQuery, setGeoQuery] = useState("");

  const sourceLabel =
    DATA_SOURCE_OPTIONS.find((option) => option.value === dataSource)?.label ?? "undr engine";

  const hasGeoQuery = geoQuery.trim().length > 0;
  const filteredRegions = hasGeoQuery
    ? GEOGRAPHY_REGIONS.filter((option) => matchesQuery(option.label, geoQuery))
    : GEOGRAPHY_REGIONS;
  const filteredCountries = hasGeoQuery
    ? GEOGRAPHY_COUNTRIES.filter((option) => matchesQuery(option.label, geoQuery))
    : GEOGRAPHY_COUNTRIES;
  const showAllLocations = !hasGeoQuery || matchesQuery(ALL_LOCATIONS.label, geoQuery);

  function selectGeography(option: SearchGeography) {
    setGeography(option);
    setGeoQuery("");
    setOpenMenu(null);
  }

  function closeGeographyMenu() {
    setGeoQuery("");
    setOpenMenu(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const brief = String(new FormData(event.currentTarget).get("brief") ?? "");
    if (!startSearchSession({ query: brief, source: "home", dataSource, geography, targetCandidates })) {
      setError(searchSessionError ?? "Private session storage could not open this exploration.");
      return;
    }
    router.push("/investor/search");
  }

  return (
    <form className={styles.searchBox} onSubmit={submit}>
      <div className={styles.inputArea}>
        <label className="sr-only" htmlFor="investor-query">Sourcing query</label>
        <input
          id="investor-query"
          name="brief"
          type="text"
          minLength={3}
          maxLength={1000}
          required
          placeholder="Describe the founders, teams, or projects you want to investigate…"
        />
      </div>
      <div className={styles.boxBar}>
        <ChipMenu
          icon={<Layers3 size={13} aria-hidden="true" />}
          label={sourceLabel}
          menuLabel="Data source"
          open={openMenu === "source"}
          onToggle={() => setOpenMenu((menu) => (menu === "source" ? null : "source"))}
          onClose={() => setOpenMenu(null)}
        >
          {DATA_SOURCE_OPTIONS.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={option.value === dataSource}
                className={styles.scopeMenuOption}
                disabled={!option.enabled}
                onClick={() => {
                  setDataSource(option.value);
                  setOpenMenu(null);
                }}
              >
                <span>{option.label}</span>
                {option.value === dataSource ? (
                  <Check size={13} aria-hidden="true" />
                ) : !option.enabled ? (
                  <span className={styles.menuSoon}>Soon</span>
                ) : null}
              </button>
            </li>
          ))}
        </ChipMenu>
        <ChipMenu
          icon={<Globe size={13} aria-hidden="true" />}
          label={geography.label}
          menuLabel="Location"
          open={openMenu === "geography"}
          onToggle={() => {
            setGeoQuery("");
            setOpenMenu((menu) => (menu === "geography" ? null : "geography"));
          }}
          onClose={closeGeographyMenu}
        >
          <li className={styles.menuSearch} role="presentation">
            <Search size={13} aria-hidden="true" />
            <input
              type="text"
              value={geoQuery}
              onChange={(event) => setGeoQuery(event.target.value)}
              placeholder="Search country or region…"
              aria-label="Search country or region"
              autoFocus
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                // Enter picks the first match instead of submitting the brief form.
                event.preventDefault();
                const first = filteredRegions[0] ?? filteredCountries[0];
                if (first) selectGeography(first);
              }}
            />
          </li>
          {showAllLocations ? (
            <GeographyOption
              option={ALL_LOCATIONS}
              selected={geography.kind === "all"}
              onSelect={selectGeography}
            />
          ) : null}
          {filteredRegions.length > 0 ? (
            <li className={styles.menuHeading} role="presentation">Regions</li>
          ) : null}
          {filteredRegions.map((option) => (
            <GeographyOption
              key={option.label}
              option={option}
              selected={geography.label === option.label}
              onSelect={selectGeography}
            />
          ))}
          {filteredCountries.length > 0 ? (
            <li className={styles.menuHeading} role="presentation">Countries</li>
          ) : null}
          {filteredCountries.map((option) => (
            <GeographyOption
              key={option.label}
              option={option}
              selected={geography.label === option.label}
              onSelect={selectGeography}
            />
          ))}
          {!showAllLocations && filteredRegions.length === 0 && filteredCountries.length === 0 ? (
            <li className={styles.menuEmpty} role="presentation">
              No places match “{geoQuery.trim()}”.
            </li>
          ) : null}
        </ChipMenu>
        <ChipMenu
          icon={<Users size={13} aria-hidden="true" />}
          label={`${targetCandidates} candidate${targetCandidates === 1 ? "" : "s"}`}
          menuLabel="How many candidates"
          open={openMenu === "count"}
          onToggle={() => setOpenMenu((menu) => (menu === "count" ? null : "count"))}
          onClose={() => setOpenMenu(null)}
        >
          {TARGET_CANDIDATE_OPTIONS.map((option) => (
            <li key={option}>
              <button
                type="button"
                role="option"
                aria-selected={option === targetCandidates}
                className={styles.scopeMenuOption}
                onClick={() => {
                  setTargetCandidates(option);
                  setOpenMenu(null);
                }}
              >
                <span>{option} candidate{option === 1 ? "" : "s"}</span>
                {option === targetCandidates ? <Check size={13} aria-hidden="true" /> : null}
              </button>
            </li>
          ))}
        </ChipMenu>
        <span className={styles.barSpacer} aria-hidden="true" />
        <button type="submit" className={styles.sendButton} aria-label="Run search">
          <ArrowUp size={17} aria-hidden="true" />
        </button>
      </div>
      {error ? <p role="alert" aria-live="assertive" className={styles.formError}>{error}</p> : null}
    </form>
  );
}

/** The Pencil `Example Queries` list: one row per starter sourcing brief. */
export function HomeSearchExamples({
  examples,
}: {
  examples: readonly { label: string; query: string }[];
}) {
  const router = useRouter();
  const { startSearchSession, searchSessionError } = useWorkspace();
  const [error, setError] = useState("");

  function openExample(example: { label: string; query: string }) {
    if (!startSearchSession({ query: example.query, source: "example", sourceId: example.label })) {
      setError(searchSessionError ?? "Private session storage could not open this example.");
      return;
    }
    router.push("/investor/search");
  }

  return (
    <div className={styles.examples} aria-label="Example searches">
      {examples.map((example) => (
        <button
          key={example.label}
          type="button"
          className={styles.exampleRow}
          onClick={() => openExample(example)}
        >
          <Search size={14} aria-hidden="true" />
          <span>{example.query}</span>
          <ArrowUpRight size={13} aria-hidden="true" />
        </button>
      ))}
      {error ? <p role="alert" aria-live="assertive" className={styles.formError}>{error}</p> : null}
    </div>
  );
}
