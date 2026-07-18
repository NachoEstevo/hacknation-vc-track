"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  isActiveThesis,
  isSearchCriterion,
  type ActiveThesis,
  type SearchCriterion,
} from "@/lib/domain";
import { writeJsonAtomically } from "@/lib/browser/atomic-storage";
import {
  createSearchSession,
  isSearchSession,
  searchFingerprint,
  type NewSearchSession,
  type SearchSession,
} from "@/lib/search";

export const PIPELINE_STAGES = [
  "discovered",
  "reviewing",
  "contacted",
  "diligence",
  "advancing",
  "passed",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export interface PipelineItem {
  projectId: string;
  stage: PipelineStage;
  note?: string;
  addedAt: string;
  updatedAt: string;
}

export interface SavedSearch {
  id: string;
  label: string;
  query: string;
  criteria?: SearchCriterion[];
  createdAt: string;
  updatedAt: string;
}

export interface NewSavedSearch {
  id?: string;
  label?: string;
  query: string;
  criteria?: SearchCriterion[];
}

interface WorkspaceState {
  activeThesis: ActiveThesis | null;
  pipelineItems: PipelineItem[];
  compareIds: string[];
  savedSearches: SavedSearch[];
  sidebarCollapsed: boolean;
}

export type WorkspaceMutationResult = "saved" | "no_change" | "failed";
export type CompareToggleResult = "added" | "removed" | "limit" | "failed";

export interface WorkspaceContextValue extends WorkspaceState {
  hasHydrated: boolean;
  pendingBrief: string;
  searchSession: SearchSession | null;
  searchSessionStorageAvailable: boolean | null;
  searchSessionError: string | null;
  storageAvailable: boolean | null;
  persistenceError: string | null;
  compareLimit: number;
  pipelineIds: string[];
  isAtCompareLimit: boolean;
  addToPipeline: (
    project:
      | string
      | { projectId: string; stage?: PipelineStage; note?: string },
  ) => WorkspaceMutationResult;
  removeFromPipeline: (projectId: string) => WorkspaceMutationResult;
  movePipelineItem: (projectId: string, stage: PipelineStage) => WorkspaceMutationResult;
  updatePipelineNote: (projectId: string, note: string) => WorkspaceMutationResult;
  isInPipeline: (projectId: string) => boolean;
  toggleCompare: (projectId: string) => CompareToggleResult;
  addToCompare: (projectId: string) => WorkspaceMutationResult;
  removeFromCompare: (projectId: string) => WorkspaceMutationResult;
  clearCompare: () => WorkspaceMutationResult;
  isComparing: (projectId: string) => boolean;
  saveSearch: (search: NewSavedSearch | string) => string;
  saveActiveThesis: (thesis: ActiveThesis) => boolean;
  savePendingBrief: (brief: string) => boolean;
  clearPendingBrief: () => void;
  startSearchSession: (session: NewSearchSession) => boolean;
  clearSearchSession: () => boolean;
  removeSavedSearch: (searchId: string) => WorkspaceMutationResult;
  setSidebarCollapsed: (collapsed: boolean) => WorkspaceMutationResult;
  toggleSidebarCollapsed: () => WorkspaceMutationResult;
  resetDemoState: () => boolean;
}

const STORAGE_KEY = "undr.workspace.v1";
const PENDING_BRIEF_KEY = "undr.pending-brief.v1";
const SEARCH_SESSION_KEY = "undr.search-session.v1";
const COMPARE_LIMIT = 3;
const VALID_PIPELINE_STAGES = new Set<string>(PIPELINE_STAGES);

function freshState(): WorkspaceState {
  return {
    activeThesis: null,
    pipelineItems: [],
    compareIds: [],
    savedSearches: [],
    sidebarCollapsed: false,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function storedCriteria(value: unknown): SearchCriterion[] | undefined | null {
  if (value === undefined) return undefined;
  const candidate = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.criteria)
      ? value.criteria
      : null;
  if (!candidate || !candidate.every(isSearchCriterion)) return null;
  return [...candidate];
}

function normalizeStoredState(value: unknown): WorkspaceState | null {
  if (!isRecord(value)) return null;

  const activeThesis = value.activeThesis === undefined || value.activeThesis === null
    ? null
    : isActiveThesis(value.activeThesis)
      ? value.activeThesis
      : undefined;
  if (activeThesis === undefined) return null;

  const now = new Date().toISOString();
  const pipelineItems: PipelineItem[] = Array.isArray(value.pipelineItems)
    ? value.pipelineItems.flatMap((entry) => {
        if (!isRecord(entry)) return [];
        const projectId = stringValue(entry.projectId);
        const stage = stringValue(entry.stage);
        if (!projectId || !stage || !VALID_PIPELINE_STAGES.has(stage)) return [];
        return [{
          projectId,
          stage: stage as PipelineStage,
          note: stringValue(entry.note) ?? undefined,
          addedAt: stringValue(entry.addedAt) ?? now,
          updatedAt: stringValue(entry.updatedAt) ?? now,
        }];
      })
    : [];

  const compareIds = Array.isArray(value.compareIds)
    ? Array.from(new Set(value.compareIds.filter((id): id is string => Boolean(stringValue(id)))))
        .slice(0, COMPARE_LIMIT)
    : [];

  const savedSearches: SavedSearch[] = Array.isArray(value.savedSearches)
    ? value.savedSearches.flatMap((entry) => {
        if (!isRecord(entry)) return [];
        const id = stringValue(entry.id);
        const query = stringValue(entry.query);
        if (!id || !query) return [];
        const criteria = storedCriteria(entry.criteria);
        if (criteria === null) return [];
        return [{
          id,
          query,
          label: stringValue(entry.label) ?? query,
          criteria,
          createdAt: stringValue(entry.createdAt) ?? now,
          updatedAt: stringValue(entry.updatedAt) ?? now,
        }];
      })
    : [];

  return {
    activeThesis,
    pipelineItems,
    compareIds,
    savedSearches,
    sidebarCollapsed: value.sidebarCollapsed === true,
  };
}

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WorkspaceState>(freshState);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [pendingBrief, setPendingBrief] = useState("");
  const [searchSession, setSearchSession] = useState<SearchSession | null>(null);
  const [searchSessionStorageAvailable, setSearchSessionStorageAvailable] = useState<boolean | null>(null);
  const [searchSessionError, setSearchSessionError] = useState<string | null>(null);
  const [storageAvailable, setStorageAvailable] = useState<boolean | null>(null);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const stateRef = useRef(state);
  const persistenceBlockedRef = useRef(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    let storedState: WorkspaceState | null = null;
    let storedPendingBrief = "";
    let storedSearchSession: SearchSession | null = null;
    let hydratedSearchSessionStorageAvailable = true;
    let hydratedSearchSessionError: string | null = null;
    let hydrationStorageAvailable = true;
    let hydrationError: string | null = null;
    try {
      const serialized = window.localStorage.getItem(STORAGE_KEY);
      if (serialized) {
        try {
          storedState = normalizeStoredState(JSON.parse(serialized));
        } catch {
          storedState = null;
        }
        if (!storedState) {
          persistenceBlockedRef.current = true;
          hydrationStorageAvailable = false;
          hydrationError = "Saved browser data could not be validated. It was left untouched, and new changes will not overwrite it until you reset local state.";
        }
      }
    } catch {
      persistenceBlockedRef.current = true;
      hydrationStorageAvailable = false;
      hydrationError = "Browser storage is unavailable, so workspace changes cannot be saved.";
    }
    try {
      storedPendingBrief = window.sessionStorage.getItem(PENDING_BRIEF_KEY)?.trim().slice(0, 1000) ?? "";
    } catch {
      // The landing flow reports session-storage failures when a brief is submitted.
    }
    try {
      const serializedSearch = window.sessionStorage.getItem(SEARCH_SESSION_KEY);
      if (serializedSearch) {
        try {
          const parsed: unknown = JSON.parse(serializedSearch);
          if (isSearchSession(parsed)) storedSearchSession = parsed;
          else hydratedSearchSessionError = "The saved search session could not be validated. Discover will use the starter search until a new exploration is opened.";
        } catch {
          hydratedSearchSessionError = "The saved search session could not be validated. Discover will use the starter search until a new exploration is opened.";
        }
      }
    } catch {
      hydratedSearchSessionStorageAvailable = false;
      hydratedSearchSessionError = "Private session storage is unavailable. Search text will not be placed in the URL, so a new exploration cannot be carried between pages.";
    }

    const timer = window.setTimeout(() => {
      if (storedState) setState(storedState);
      setPendingBrief(storedPendingBrief);
      setSearchSession(storedSearchSession);
      setSearchSessionStorageAvailable(hydratedSearchSessionStorageAvailable);
      setSearchSessionError(hydratedSearchSessionError);
      setStorageAvailable(hydrationStorageAvailable);
      setPersistenceError(hydrationError);
      setHasHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    function syncAcrossTabs(event: StorageEvent) {
      if (event.key !== STORAGE_KEY) return;
      if (!event.newValue) {
        persistenceBlockedRef.current = false;
        setStorageAvailable(true);
        setPersistenceError(null);
        setState(freshState());
        return;
      }
      try {
        const normalized = normalizeStoredState(JSON.parse(event.newValue));
        if (normalized) {
          persistenceBlockedRef.current = false;
          setStorageAvailable(true);
          setPersistenceError(null);
          setState(normalized);
        } else {
          persistenceBlockedRef.current = true;
          setPersistenceError(
            "Another tab wrote browser data that could not be validated. This tab will not overwrite it.",
          );
        }
      } catch {
        persistenceBlockedRef.current = true;
        setPersistenceError(
          "Another tab wrote browser data that could not be validated. This tab will not overwrite it.",
        );
      }
    }

    window.addEventListener("storage", syncAcrossTabs);
    return () => window.removeEventListener("storage", syncAcrossTabs);
  }, []);

  const commitWorkspaceState = useCallback((
    buildNext: (current: WorkspaceState) => WorkspaceState,
    failureMessage: string,
  ): WorkspaceMutationResult => {
    if (
      !hasHydrated
      || storageAvailable !== true
      || persistenceBlockedRef.current
      || persistenceError
    ) {
      return "failed";
    }

    const current = stateRef.current;
    const next = buildNext(current);
    if (next === current) return "no_change";

    const persisted = writeJsonAtomically(window.localStorage, STORAGE_KEY, next);
    if (!persisted.ok) {
      persistenceBlockedRef.current = true;
      setStorageAvailable(false);
      setPersistenceError(failureMessage);
      return "failed";
    }

    stateRef.current = next;
    setState(next);
    return "saved";
  }, [hasHydrated, persistenceError, storageAvailable]);

  const addToPipeline = useCallback<WorkspaceContextValue["addToPipeline"]>((project) => {
    const input = typeof project === "string" ? { projectId: project } : project;
    const projectId = input.projectId.trim();
    if (!projectId) return "failed";

    return commitWorkspaceState((current) => {
      if (current.pipelineItems.some((item) => item.projectId === projectId)) return current;
      const timestamp = new Date().toISOString();
      return {
        ...current,
        pipelineItems: [{
          projectId,
          stage: input.stage ?? "discovered",
          note: input.note?.trim() || undefined,
          addedAt: timestamp,
          updatedAt: timestamp,
        }, ...current.pipelineItems],
      };
    }, "Browser storage could not add this project to the pipeline. Nothing was saved.");
  }, [commitWorkspaceState]);

  const removeFromPipeline = useCallback((projectId: string) => {
    return commitWorkspaceState((current) => {
      if (!current.pipelineItems.some((item) => item.projectId === projectId)) return current;
      return {
        ...current,
        pipelineItems: current.pipelineItems.filter((item) => item.projectId !== projectId),
      };
    }, "Browser storage could not remove this project from the pipeline. Nothing changed.");
  }, [commitWorkspaceState]);

  const movePipelineItem = useCallback((projectId: string, stage: PipelineStage) => {
    if (!VALID_PIPELINE_STAGES.has(stage)) return "failed";
    return commitWorkspaceState((current) => {
      const item = current.pipelineItems.find((candidate) => candidate.projectId === projectId);
      if (!item || item.stage === stage) return current;
      return {
        ...current,
        pipelineItems: current.pipelineItems.map((candidate) => candidate.projectId === projectId
          ? { ...candidate, stage, updatedAt: new Date().toISOString() }
          : candidate),
      };
    }, "Browser storage could not move this pipeline item. Its previous stage was kept.");
  }, [commitWorkspaceState]);

  const updatePipelineNote = useCallback((projectId: string, note: string) => {
    const normalizedNote = note.trim() || undefined;
    return commitWorkspaceState((current) => {
      const item = current.pipelineItems.find((candidate) => candidate.projectId === projectId);
      if (!item || item.note === normalizedNote) return current;
      return {
        ...current,
        pipelineItems: current.pipelineItems.map((candidate) => candidate.projectId === projectId
          ? { ...candidate, note: normalizedNote, updatedAt: new Date().toISOString() }
          : candidate),
      };
    }, "Browser storage could not save this private note. The previous note was kept.");
  }, [commitWorkspaceState]);

  const isInPipeline = useCallback(
    (projectId: string) => state.pipelineItems.some((item) => item.projectId === projectId),
    [state.pipelineItems],
  );

  const toggleCompare = useCallback((projectId: string): CompareToggleResult => {
    const normalizedId = projectId.trim();
    if (!normalizedId) return "failed";

    if (stateRef.current.compareIds.includes(normalizedId)) {
      const result = commitWorkspaceState((current) => ({
        ...current,
        compareIds: current.compareIds.filter((id) => id !== normalizedId),
      }), "Browser storage could not remove this project from comparison. Nothing changed.");
      return result === "saved" ? "removed" : result === "no_change" ? "removed" : "failed";
    }
    if (stateRef.current.compareIds.length >= COMPARE_LIMIT) return "limit";
    const result = commitWorkspaceState((current) => current.compareIds.includes(normalizedId)
      ? current
      : { ...current, compareIds: [...current.compareIds, normalizedId].slice(0, COMPARE_LIMIT) },
    "Browser storage could not add this project to comparison. Nothing was saved.");
    return result === "saved" ? "added" : result === "no_change" ? "added" : "failed";
  }, [commitWorkspaceState]);

  const addToCompare = useCallback((projectId: string) => {
    const normalizedId = projectId.trim();
    if (!normalizedId) return "failed";
    return commitWorkspaceState((current) => {
      if (current.compareIds.includes(normalizedId) || current.compareIds.length >= COMPARE_LIMIT) return current;
      return { ...current, compareIds: [...current.compareIds, normalizedId] };
    }, "Browser storage could not add this project to comparison. Nothing was saved.");
  }, [commitWorkspaceState]);

  const removeFromCompare = useCallback((projectId: string) => {
    return commitWorkspaceState((current) => {
      if (!current.compareIds.includes(projectId)) return current;
      return { ...current, compareIds: current.compareIds.filter((id) => id !== projectId) };
    }, "Browser storage could not remove this project from comparison. Nothing changed.");
  }, [commitWorkspaceState]);

  const clearCompare = useCallback(() => {
    return commitWorkspaceState(
      (current) => current.compareIds.length ? { ...current, compareIds: [] } : current,
      "Browser storage could not clear the comparison. Nothing changed.",
    );
  }, [commitWorkspaceState]);

  const isComparing = useCallback(
    (projectId: string) => state.compareIds.includes(projectId),
    [state.compareIds],
  );

  const saveSearch = useCallback((search: NewSavedSearch | string) => {
    const input: NewSavedSearch = typeof search === "string" ? { query: search } : search;
    const query = input.query.trim();
    if (!query) return "";
    if (input.criteria !== undefined && !input.criteria.every(isSearchCriterion)) return "";
    const now = new Date().toISOString();
    const requestedId = input.id?.trim() || "";
    const currentState = stateRef.current;
    const matching = currentState.savedSearches.find((item) =>
      requestedId
        ? item.id === requestedId
        : searchFingerprint(item.query, item.criteria) === searchFingerprint(query, input.criteria),
    );
    const savedId = (matching?.id ?? requestedId) || createId("search");
    const currentMatch = currentState.savedSearches.find((item) => item.id === savedId);
    const nextSearch: SavedSearch = {
      id: savedId,
      query,
      label: input.label?.trim() || currentMatch?.label || matching?.label || query,
      criteria: input.criteria ?? currentMatch?.criteria ?? matching?.criteria,
      createdAt: currentMatch?.createdAt ?? matching?.createdAt ?? now,
      updatedAt: now,
    };
    const result = commitWorkspaceState((current) => ({
      ...current,
      savedSearches: [
        nextSearch,
        ...current.savedSearches.filter((item) => item.id !== savedId),
      ],
    }), "Browser storage could not save this exploration. It was not recorded as a saved search.");

    return result === "saved" ? savedId : "";
  }, [commitWorkspaceState]);

  const removeSavedSearch = useCallback((searchId: string) => {
    return commitWorkspaceState((current) => {
      if (!current.savedSearches.some((search) => search.id === searchId)) return current;
      return {
        ...current,
        savedSearches: current.savedSearches.filter((search) => search.id !== searchId),
      };
    }, "Browser storage could not remove this saved search. Nothing changed.");
  }, [commitWorkspaceState]);

  const saveActiveThesis = useCallback((thesis: ActiveThesis): boolean => {
    if (!isActiveThesis(thesis)) return false;
    return commitWorkspaceState(
      (current) => ({ ...current, activeThesis: thesis }),
      "Browser storage could not save this thesis. It was not recorded as your active sourcing lens.",
    ) === "saved";
  }, [commitWorkspaceState]);

  const savePendingBrief = useCallback((brief: string): boolean => {
    const normalized = brief.trim().replace(/\s+/g, " ").slice(0, 1000);
    if (!normalized) return false;
    try {
      window.sessionStorage.setItem(PENDING_BRIEF_KEY, normalized);
      setPendingBrief(normalized);
      return true;
    } catch {
      return false;
    }
  }, []);

  const clearPendingBrief = useCallback(() => {
    try {
      window.sessionStorage.removeItem(PENDING_BRIEF_KEY);
      setPendingBrief("");
    } catch {
      // Keep the in-memory value so the UI does not claim that it was cleared.
    }
  }, []);

  const startSearchSession = useCallback((input: NewSearchSession): boolean => {
    let session: SearchSession;
    try {
      session = createSearchSession(input);
    } catch {
      setSearchSessionError("The exploration could not be validated and was not opened.");
      return false;
    }

    const persisted = writeJsonAtomically(window.sessionStorage, SEARCH_SESSION_KEY, session);
    if (!persisted.ok) {
      setSearchSessionStorageAvailable(false);
      setSearchSessionError(
        "Private session storage is unavailable. The sourcing brief was kept out of the URL and the exploration was not opened.",
      );
      return false;
    }

    setSearchSessionStorageAvailable(true);
    setSearchSessionError(null);
    setSearchSession(session);
    return true;
  }, []);

  const clearSearchSession = useCallback((): boolean => {
    try {
      window.sessionStorage.removeItem(SEARCH_SESSION_KEY);
      setSearchSession(null);
      setSearchSessionStorageAvailable(true);
      setSearchSessionError(null);
      return true;
    } catch {
      setSearchSessionStorageAvailable(false);
      setSearchSessionError("Private session storage could not clear the previous exploration.");
      return false;
    }
  }, []);

  const setSidebarCollapsed = useCallback((sidebarCollapsed: boolean) => {
    return commitWorkspaceState(
      (current) => current.sidebarCollapsed === sidebarCollapsed
        ? current
        : { ...current, sidebarCollapsed },
      "Browser storage could not save the navigation preference.",
    );
  }, [commitWorkspaceState]);

  const toggleSidebarCollapsed = useCallback(() => {
    return commitWorkspaceState(
      (current) => ({ ...current, sidebarCollapsed: !current.sidebarCollapsed }),
      "Browser storage could not save the navigation preference.",
    );
  }, [commitWorkspaceState]);

  const resetDemoState = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      persistenceBlockedRef.current = false;
      setStorageAvailable(true);
      setPersistenceError(null);
      const nextState = freshState();
      stateRef.current = nextState;
      setState(nextState);
      return true;
    } catch {
      persistenceBlockedRef.current = true;
      setStorageAvailable(false);
      setPersistenceError(
        "Browser storage could not clear local workspace data. No saved data was removed.",
      );
      return false;
    }
  }, []);

  const contextValue = useMemo<WorkspaceContextValue>(() => ({
    ...state,
    hasHydrated,
    pendingBrief,
    searchSession,
    searchSessionStorageAvailable,
    searchSessionError,
    storageAvailable,
    persistenceError,
    compareLimit: COMPARE_LIMIT,
    pipelineIds: state.pipelineItems.map((item) => item.projectId),
    isAtCompareLimit: state.compareIds.length >= COMPARE_LIMIT,
    addToPipeline,
    removeFromPipeline,
    movePipelineItem,
    updatePipelineNote,
    isInPipeline,
    toggleCompare,
    addToCompare,
    removeFromCompare,
    clearCompare,
    isComparing,
    saveSearch,
    saveActiveThesis,
    savePendingBrief,
    clearPendingBrief,
    startSearchSession,
    clearSearchSession,
    removeSavedSearch,
    setSidebarCollapsed,
    toggleSidebarCollapsed,
    resetDemoState,
  }), [
    state,
    hasHydrated,
    pendingBrief,
    searchSession,
    searchSessionStorageAvailable,
    searchSessionError,
    storageAvailable,
    persistenceError,
    addToPipeline,
    removeFromPipeline,
    movePipelineItem,
    updatePipelineNote,
    isInPipeline,
    toggleCompare,
    addToCompare,
    removeFromCompare,
    clearCompare,
    isComparing,
    saveSearch,
    saveActiveThesis,
    savePendingBrief,
    clearPendingBrief,
    startSearchSession,
    clearSearchSession,
    removeSavedSearch,
    setSidebarCollapsed,
    toggleSidebarCollapsed,
    resetDemoState,
  ]);

  return (
    <WorkspaceContext.Provider value={contextValue}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used inside a WorkspaceProvider");
  }
  return context;
}
