import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Search } from "lucide-react";
import type { WorkflowRun } from "@/lib/dograh/types";
import { getRunCost, getRunDisposition, getRunDuration, getRunPhone } from "@/lib/dograh/mock";
import { humanizeDisposition } from "@/lib/dograh/stats";
import { RunStatusBadge } from "./state-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  cn,
  downloadCsv,
  formatCost,
  formatDateTime,
  formatDuration,
} from "@/lib/utils";

export interface RunsTableState {
  page: number;
  limit: number;
  status: string;
  phone: string;
  disposition: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
}

interface RunsTableProps {
  campaignId?: number;
  workflowId: number;
  runs: WorkflowRun[];
  totalCount: number;
  totalPages: number;
  isLoading?: boolean;
  isFetching?: boolean;
  state: RunsTableState;
  onChange: (patch: Partial<RunsTableState>) => void;
  dispositions?: string[];
  mode?: "campaign" | "workflow";
}

export function RunsTable({
  campaignId,
  workflowId,
  runs,
  totalCount,
  totalPages,
  isLoading,
  isFetching,
  state,
  onChange,
  dispositions = [],
  mode,
}: RunsTableProps) {
  const [localPhone, setLocalPhone] = useState(state.phone);
  const linkMode = mode ?? (campaignId != null ? "campaign" : "workflow");

  const columns = useMemo<ColumnDef<WorkflowRun>[]>(
    () => [
      {
        id: "run",
        header: "Run",
        cell: ({ row }) => {
          const phone = getRunPhone(row.original);
          const label =
            phone && phone !== "—"
              ? phone
              : row.original.name || `#${row.original.id}`;
          return (
            <div>
              <span className="font-mono text-sm font-medium tabular-nums">{label}</span>
              {row.original.name && phone && phone !== "—" ? (
                <div className="text-[11px] text-muted-foreground">{row.original.name}</div>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <RunStatusBadge
            status={
              row.original.status ??
              (row.original.is_completed ? "completed" : "pending")
            }
          />
        ),
      },
      {
        id: "disposition",
        header: "Disposition",
        cell: ({ row }) => {
          const d = getRunDisposition(row.original);
          return (
            <span className="text-sm text-muted-foreground">
              {d === "—" ? "—" : humanizeDisposition(d)}
            </span>
          );
        },
      },
      {
        id: "duration",
        header: () => (
          <SortHeader
            label="Duration"
            active={state.sortBy === "duration"}
            order={state.sortOrder}
            onClick={() =>
              onChange({
                sortBy: "duration",
                sortOrder:
                  state.sortBy === "duration" && state.sortOrder === "desc" ? "asc" : "desc",
              })
            }
          />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-sm tabular-nums">
            {formatDuration(getRunDuration(row.original))}
          </span>
        ),
      },
      {
        id: "started",
        header: () => (
          <SortHeader
            label="Started"
            active={state.sortBy === "created_at"}
            order={state.sortOrder}
            onClick={() =>
              onChange({
                sortBy: "created_at",
                sortOrder:
                  state.sortBy === "created_at" && state.sortOrder === "desc" ? "asc" : "desc",
              })
            }
          />
        ),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatDateTime(row.original.started_at ?? row.original.created_at)}
          </span>
        ),
      },
      {
        id: "cost",
        header: () => (
          <SortHeader
            label="Cost"
            active={state.sortBy === "cost"}
            order={state.sortOrder}
            onClick={() =>
              onChange({
                sortBy: "cost",
                sortOrder: state.sortBy === "cost" && state.sortOrder === "desc" ? "asc" : "desc",
              })
            }
          />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-sm tabular-nums">
            {formatCost(getRunCost(row.original), row.original.cost_info?.currency ?? "USD")}
          </span>
        ),
      },
    ],
    [state.sortBy, state.sortOrder, onChange],
  );

  const table = useReactTable({
    data: runs,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
  });

  const exportCsv = () => {
    const rows = runs.map((r) => ({
      id: r.id,
      name: r.name ?? "",
      phone: getRunPhone(r),
      status: r.status ?? "",
      disposition: getRunDisposition(r),
      duration_seconds: getRunDuration(r),
      started_at: r.started_at ?? r.created_at,
      cost: getRunCost(r),
      currency: r.cost_info?.currency ?? "USD",
    }));
    downloadCsv(`workflow-${workflowId}-runs-page-${state.page}.csv`, rows);
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Calls</CardTitle>
          <CardDescription>
            {totalCount.toLocaleString()} runs
            {isFetching && !isLoading ? " · refreshing…" : null}
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={runs.length === 0}>
          <Download className="size-3.5" />
          Export CSV
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <form
            className="relative min-w-0 flex-1 sm:max-w-xs"
            onSubmit={(e) => {
              e.preventDefault();
              onChange({ phone: localPhone, page: 1 });
            }}
          >
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={localPhone}
              onChange={(e) => setLocalPhone(e.target.value)}
              placeholder="Search phone or name…"
              className="pl-9"
            />
          </form>
          <Select
            value={state.status || "all"}
            onValueChange={(v) => onChange({ status: v === "all" ? "" : v, page: 1 })}
          >
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={state.disposition || "all"}
            onValueChange={(v) => onChange({ disposition: v === "all" ? "" : v, page: 1 })}
          >
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Disposition" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All dispositions</SelectItem>
              {dispositions.map((d) => (
                <SelectItem key={d} value={d}>
                  {humanizeDisposition(d)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border bg-muted/40">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => (
                    <th
                      key={h.id}
                      className="px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                    >
                      {h.isPlaceholder
                        ? null
                        : flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      {columns.map((_, j) => (
                        <td key={j} className="px-3 py-3">
                          <Skeleton className="h-4 w-24" />
                        </td>
                      ))}
                    </tr>
                  ))
                : table.getRowModel().rows.length === 0
                  ? (
                    <tr>
                      <td
                        colSpan={columns.length}
                        className="px-3 py-12 text-center text-sm text-muted-foreground"
                      >
                        No runs match the current filters
                      </td>
                    </tr>
                    )
                  : (
                      table.getRowModel().rows.map((row) => (
                        <tr
                          key={row.id}
                          className="border-b border-border last:border-0 transition-colors hover:bg-muted/40"
                        >
                          {row.getVisibleCells().map((cell) => (
                            <td key={cell.id} className="px-3 py-2.5">
                              {linkMode === "workflow" ? (
                                <Link
                                  to="/workflows/$workflowId/runs/$runId"
                                  params={{
                                    workflowId: String(workflowId),
                                    runId: String(row.original.id),
                                  }}
                                  className="block"
                                >
                                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                </Link>
                              ) : (
                                <Link
                                  to="/campaigns/$campaignId/runs/$runId"
                                  params={{
                                    campaignId: String(campaignId ?? workflowId),
                                    runId: String(row.original.id),
                                  }}
                                  search={{ workflowId }}
                                  className="block"
                                >
                                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                </Link>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            Page {state.page} of {Math.max(totalPages, 1)}
          </p>
          <div className="flex items-center gap-2">
            <Select
              value={String(state.limit)}
              onValueChange={(v) => onChange({ limit: Number(v), page: 1 })}
            >
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[25, 50, 100].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} / page
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              disabled={state.page <= 1}
              onClick={() => onChange({ page: state.page - 1 })}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={state.page >= totalPages}
              onClick={() => onChange({ page: state.page + 1 })}
            >
              Next
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SortHeader({
  label,
  active,
  order,
  onClick,
}: {
  label: string;
  active: boolean;
  order: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-foreground",
        active ? "text-foreground" : "text-muted-foreground",
      )}
    >
      {label}
      {active ? (
        order === "asc" ? (
          <ArrowUp className="size-3" />
        ) : (
          <ArrowDown className="size-3" />
        )
      ) : (
        <ArrowUpDown className="size-3 opacity-50" />
      )}
    </button>
  );
}

void (0 as unknown as SortingState);
