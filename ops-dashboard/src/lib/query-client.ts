import { QueryClient } from "@tanstack/react-query";

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 3_000,
        refetchOnWindowFocus: true,
        retry: 1,
      },
    },
  });
}

/** @deprecated prefer LIVE_POLL / poll helpers */
export const LIVE_POLL_MS = 7_000;

/** Adaptive polling intervals (ms) */
export const POLL = {
  /** Calls actively in progress */
  HOT: 3_000,
  /** Campaigns running / ambient ops */
  WARM: 7_000,
  /** Idle dashboard */
  COLD: 30_000,
} as const;

export function isRunLive(status?: string | null, isCompleted?: boolean | null): boolean {
  if (isCompleted === false) return true;
  const s = String(status ?? "").toLowerCase();
  return s === "in_progress" || s === "pending" || s === "running";
}

/** Poll interval for a single run detail — stop when finished */
export function pollForRun(
  status?: string | null,
  isCompleted?: boolean | null,
): number | false {
  if (isCompleted === true) return false;
  if (isRunLive(status, isCompleted)) return POLL.HOT;
  return false;
}

/** Overview / list polling */
export function pollForOverview(opts: {
  hasLiveCalls?: boolean;
  hasActiveCampaigns?: boolean;
  hasInProgressRuns?: boolean;
}): number {
  if (opts.hasLiveCalls || opts.hasInProgressRuns) return POLL.HOT;
  if (opts.hasActiveCampaigns) return POLL.WARM;
  return POLL.COLD;
}

/** Workflow detail list polling */
export function pollForWorkflowList(hasInProgress: boolean): number {
  return hasInProgress ? POLL.HOT : POLL.WARM;
}
