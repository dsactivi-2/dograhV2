import type { CampaignStats, DispositionBucket, WorkflowRun } from "./types";
import { getRunCost, getRunDisposition, getRunDuration } from "./mock";

export function computeStatsFromRuns(runs: WorkflowRun[]): CampaignStats {
  const totalCalls = runs.length;
  let completed = 0;
  let failed = 0;
  let inProgress = 0;
  let pending = 0;
  let durationSum = 0;
  let durationN = 0;
  let costSum = 0;
  const dispMap = new Map<string, number>();

  for (const r of runs) {
    const status = r.status ?? (r.is_completed ? "completed" : "pending");
    if (status === "completed") completed += 1;
    else if (status === "failed") failed += 1;
    else if (status === "in_progress") inProgress += 1;
    else pending += 1;

    const d = getRunDuration(r);
    if (d > 0) {
      durationSum += d;
      durationN += 1;
    }
    costSum += getRunCost(r);

    const disp = getRunDisposition(r);
    if (disp && disp !== "—") {
      dispMap.set(disp, (dispMap.get(disp) ?? 0) + 1);
    }
  }

  const dispositions: DispositionBucket[] = [...dispMap.entries()]
    .map(([disposition, count]) => ({
      disposition,
      count,
      percentage: totalCalls > 0 ? (count / totalCalls) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const finished = completed + failed;
  const successRate = finished > 0 ? (completed / finished) * 100 : 0;

  return {
    totalCalls,
    completed,
    failed,
    inProgress,
    pending,
    successRate,
    avgDuration: durationN > 0 ? durationSum / durationN : 0,
    totalCost: costSum,
    avgCost: totalCalls > 0 ? costSum / totalCalls : 0,
    dispositions,
  };
}

export function humanizeDisposition(value: string): string {
  if (!value || value === "—") return "Unknown";
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
