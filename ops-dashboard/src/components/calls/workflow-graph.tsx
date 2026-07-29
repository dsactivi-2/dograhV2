import { useCallback, useMemo, useRef, useState } from "react";
import { Minus, Plus, Maximize2 } from "lucide-react";
import type { WorkflowDefinition } from "@/lib/dograh/client";
import type { WorkflowRun } from "@/lib/dograh/types";
import {
  extractToolCalls,
  extractVisitedNodeIds,
  getEdgeTakenKeys,
  normalizeGraphLayout,
} from "@/lib/dograh/node-trace";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NODE_W = 148;
const NODE_H = 44;

export function WorkflowGraph({
  definition,
  run,
}: {
  definition?: WorkflowDefinition | null;
  run?: WorkflowRun | null;
}) {
  const layout = useMemo(() => normalizeGraphLayout(definition), [definition]);
  const visited = useMemo(() => extractVisitedNodeIds(run), [run]);
  const takenEdges = useMemo(() => getEdgeTakenKeys(run), [run]);
  const toolCalls = useMemo(() => extractToolCalls(run), [run]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const dragRef = useRef<{
    active: boolean;
    moved: boolean;
    startX: number;
    startY: number;
    origTx: number;
    origTy: number;
  }>({ active: false, moved: false, startX: 0, startY: 0, origTx: 0, origTy: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);

  const nodeById = useMemo(() => {
    const m = new Map<string, (typeof layout.nodes)[number]>();
    for (const n of layout.nodes) m.set(n.id, n);
    return m;
  }, [layout.nodes]);

  const selected = selectedId ? nodeById.get(selectedId) : undefined;
  const selectedTools = toolCalls.filter((t) => t.nodeId === selectedId);
  const summary = selectedId
    ? definition?.node_summaries?.[selectedId]?.summary
    : undefined;

  const clampScale = (s: number) => Math.min(3, Math.max(0.25, s));

  const zoomBy = useCallback((factor: number, cx?: number, cy?: number) => {
    setScale((prev) => {
      const next = clampScale(prev * factor);
      if (cx != null && cy != null && viewportRef.current) {
        const rect = viewportRef.current.getBoundingClientRect();
        const px = cx - rect.left;
        const py = cy - rect.top;
        setTx((tx0) => px - ((px - tx0) * next) / prev);
        setTy((ty0) => py - ((py - ty0) * next) / prev);
      }
      return next;
    });
  }, []);

  const resetView = useCallback(() => {
    setScale(1);
    setTx(0);
    setTy(0);
  }, []);

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      zoomBy(factor, e.clientX, e.clientY);
    },
    [zoomBy],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = {
        active: true,
        moved: false,
        startX: e.clientX,
        startY: e.clientY,
        origTx: tx,
        origTy: ty,
      };
    },
    [tx, ty],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d.active) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    setTx(d.origTx + dx);
    setTy(d.origTy + dy);
  }, []);

  const onPointerUp = useCallback(() => {
    dragRef.current.active = false;
  }, []);

  if (layout.nodes.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Workflow graph</CardTitle>
          <CardDescription>No definition available for this workflow</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Workflow graph</CardTitle>
            <CardDescription>
              Scroll to zoom · drag to pan · click a node for details
              {visited.size > 0 ? ` · ${visited.size} nodes visited` : null}
            </CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => zoomBy(0.85)}
              aria-label="Zoom out"
            >
              <Minus className="size-3.5" />
            </Button>
            <span className="min-w-[3rem] text-center font-mono text-xs tabular-nums text-muted-foreground">
              {Math.round(scale * 100)}%
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => zoomBy(1.15)}
              aria-label="Zoom in"
            >
              <Plus className="size-3.5" />
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={resetView}>
              <Maximize2 className="size-3.5" />
              Reset
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          ref={viewportRef}
          className="relative h-[min(520px,70vh)] touch-none overflow-hidden rounded-lg border border-border bg-muted/20"
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{ cursor: "grab" }}
        >
          <div
            className="origin-top-left will-change-transform"
            style={{
              transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
              width: layout.width,
              height: layout.height,
            }}
          >
            <svg
              width={layout.width}
              height={layout.height}
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              className="block"
              role="img"
              aria-label="Workflow node graph"
            >
              {layout.edges.map((e, i) => {
                const s = nodeById.get(e.source);
                const t = nodeById.get(e.target);
                if (!s || !t) return null;
                const x1 = s.layoutX + NODE_W / 2;
                const y1 = s.layoutY + NODE_H / 2;
                const x2 = t.layoutX + NODE_W / 2;
                const y2 = t.layoutY + NODE_H / 2;
                const taken = takenEdges.has(`${e.source}->${e.target}`);
                const mx = (x1 + x2) / 2;
                const my = (y1 + y2) / 2;
                return (
                  <path
                    key={e.id ?? `${e.source}-${e.target}-${i}`}
                    d={`M ${x1} ${y1} Q ${mx} ${my - 20} ${x2} ${y2}`}
                    fill="none"
                    stroke={taken ? "var(--info)" : "var(--border-strong)"}
                    strokeWidth={taken ? 2.25 : 1.25}
                    strokeOpacity={taken ? 1 : 0.55}
                    markerEnd={taken ? "url(#arrow-taken)" : "url(#arrow)"}
                  />
                );
              })}

              <defs>
                <marker
                  id="arrow"
                  markerWidth="8"
                  markerHeight="8"
                  refX="6"
                  refY="3"
                  orient="auto"
                >
                  <path d="M0,0 L6,3 L0,6 Z" fill="var(--border-strong)" />
                </marker>
                <marker
                  id="arrow-taken"
                  markerWidth="8"
                  markerHeight="8"
                  refX="6"
                  refY="3"
                  orient="auto"
                >
                  <path d="M0,0 L6,3 L0,6 Z" fill="var(--info)" />
                </marker>
              </defs>

              {layout.nodes.map((n) => {
                const name = n.data?.name || n.type || n.id;
                const isVisited = visited.has(n.id);
                const isSelected = selectedId === n.id;
                const isGlobal = n.type === "globalNode";
                return (
                  <g
                    key={n.id}
                    transform={`translate(${n.layoutX}, ${n.layoutY})`}
                    className="cursor-pointer"
                    onClick={(ev) => {
                      if (dragRef.current.moved) {
                        ev.stopPropagation();
                        return;
                      }
                      setSelectedId(n.id);
                    }}
                    onPointerDown={(ev) => {
                      ev.stopPropagation();
                    }}
                  >
                    <rect
                      width={NODE_W}
                      height={NODE_H}
                      rx={8}
                      className={cn(
                        isSelected
                          ? "fill-primary stroke-primary"
                          : isVisited
                            ? "fill-card stroke-info"
                            : "fill-card stroke-border-strong",
                      )}
                      strokeWidth={isSelected || isVisited ? 2 : 1}
                      opacity={isGlobal ? 0.85 : 1}
                    />
                    {isVisited && !isSelected ? (
                      <circle cx={NODE_W - 10} cy={10} r={4} className="fill-info" />
                    ) : null}
                    <text
                      x={NODE_W / 2}
                      y={NODE_H / 2 + 1}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className={cn(
                        "text-[11px]",
                        isSelected ? "fill-primary-foreground" : "fill-foreground",
                      )}
                      style={{ fontFamily: "var(--font-sans)" }}
                    >
                      {truncate(String(name), 18)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm border-2 border-info bg-card" /> Visited
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm border border-border-strong bg-card" /> Not on path
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 bg-info" /> Edge taken
          </span>
        </div>

        {selected ? (
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">
                  {String(selected.data?.name || selected.id)}
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                  id {selected.id} · type {selected.type || "node"}
                  {visited.has(selected.id) ? " · visited" : " · not visited"}
                </div>
              </div>
              <Badge variant="secondary" className="font-normal">
                {selectedTools.length} tool call{selectedTools.length === 1 ? "" : "s"}
              </Badge>
            </div>
            {summary ? (
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{summary}</p>
            ) : null}
            {selected.data?.prompt ? (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
                  Node prompt (excerpt)
                </summary>
                <pre className="mt-2 max-h-40 overflow-auto rounded-md border border-border bg-muted/40 p-2 font-mono text-[11px] whitespace-pre-wrap">
                  {String(selected.data.prompt).slice(0, 1200)}
                  {String(selected.data.prompt).length > 1200 ? "…" : ""}
                </pre>
              </details>
            ) : null}
            {selectedTools.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {selectedTools.map((t) => (
                  <li key={t.id} className="rounded-md border border-border px-3 py-2 text-xs">
                    <div className="font-mono font-medium">{t.functionName}</div>
                    <div className="mt-0.5 text-muted-foreground">
                      {t.status}
                      {t.turn != null ? ` · turn ${t.turn}` : null}
                    </div>
                    {t.result != null ? (
                      <pre className="mt-1 overflow-auto font-mono text-[10px] text-muted-foreground">
                        {typeof t.result === "string" ? t.result : JSON.stringify(t.result)}
                      </pre>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Select a node to inspect summary, prompt, and tools.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
