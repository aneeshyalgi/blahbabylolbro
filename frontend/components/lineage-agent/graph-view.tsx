"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, Database, FunctionSquare, Sigma, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { recallInTab, rememberInTab } from "@/lib/tab-memory";
import { ROLE_STYLES, TransformationBadge, type Verification } from "./atoms";
import { downloadText } from "./download";
import { lineageToDrawIo } from "./drawio";
import {
  CANVAS, CanvasActions, EdgeSample, GraphLegend, GraphSearch, TOOLBAR, Toggle, ZoomControls, canvasBackground, edgeLayer, graphFrame, layerStyle,
  useCanvasView, useMovedNodes, useNodeDrag,
} from "./graph-canvas";
import { NODE_HEIGHT, NODE_WIDTH, graphBounds, layoutGraph, lineageOf, lookupId, routeEdges, type GraphEdge, type GraphNode } from "./graph-layout";
import type { Model } from "./model";
import type { Focus } from "./types";

const VERIFICATION_COLORS: Record<Verification, string> = {
  verified: "#34d399",
  partial: "#fbbf24",
  discrepancy: "#fb7185",
  unprobed: "#64748b",
  passthrough: "#475569",
};

/** "Names only" in the toolbar: on by default; the choice holds while the app stays open. */
const NAMES_ONLY = "technical-lineage-agent.graph.names-only";

export function GraphView({ model, selected, onSelect, layoutKey }: {
  model: Model;
  /** The column or lookup table whose details are shown under the graph. */
  selected: Focus | null;
  onSelect: (focus: Focus | null) => void;
  /** Identifies the analysis: nodes the user moved keep their place for it (in this browser). */
  layoutKey?: string;
}) {
  const t = useTranslations("lineageAgent.graph");
  const tRoles = useTranslations("lineageAgent.roles");
  const tOps = useTranslations("lineageAgent.operations");
  const [showIsolated, setShowIsolated] = useState(false);
  // Names only: each node shows just its name; off, also its kind, role, operations and runtime check.
  const [namesOnly, setNamesOnly] = useState(() => recallInTab<boolean>(NAMES_ONLY) ?? true);
  const toggleNamesOnly = () => {
    const next = !namesOnly;
    setNamesOnly(next);
    rememberInTab(NAMES_ONLY, next);
  };
  const [query, setQuery] = useState("");
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [hoverEdge, setHoverEdge] = useState<{ edge: GraphEdge; x: number; y: number } | null>(null);
  // Nodes the user moved: their positions replace the automatic layout; the edges are routed to wherever they are.
  const moved = useMovedNodes(layoutKey ? `dataflow_lineage_graph_positions:${layoutKey}` : null);
  const internal = useRef(false);
  const select = (focus: Focus | null) => {
    internal.current = true;
    onSelect(focus);
  };
  const selectedId = selected ? (selected.kind === "lookup" ? lookupId(selected.name) : selected.name) : null;

  const layout = useMemo(
    () => layoutGraph(model.analysis, { showIsolated }),
    [model.analysis, showIsolated],
  );
  const nodes = useMemo(
    () => layout.nodes.map((node) => (moved.positions[node.id] ? { ...node, ...moved.positions[node.id] } : node)),
    [layout.nodes, moved.positions],
  );
  const edges = useMemo(() => routeEdges(nodes, layout.edges), [nodes, layout.edges]);
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const bounds = useMemo(() => graphBounds(nodes), [nodes]);
  const view = useCanvasView(bounds, layout, () => select(null));
  const drag = useNodeDrag(view.transform.k, moved, () => setHoverEdge(null));
  const { transform, fit } = view;
  const draggingNode = moved.dragging;

  const resetLayout = () => {
    moved.setPositions({});
    window.requestAnimationFrame(() => fit());
  };

  const focusNode = (id: string) => {
    const node = nodeById.get(id);
    if (node) view.focus(node.x, node.y, NODE_WIDTH, NODE_HEIGHT);
  };

  // A column selected elsewhere (the details, a finding) is brought into view; back to all columns shows the whole graph.
  useEffect(() => {
    if (internal.current) {
      internal.current = false;
      return;
    }
    if (!selectedId) {
      fit();
      return;
    }
    if (nodeById.has(selectedId)) {
      const timer = window.setTimeout(() => focusNode(selectedId), 80);
      return () => window.clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const anchor = selectedId ?? draggingNode ?? hoverNode;
  const lineage = useMemo(() => (anchor ? lineageOf(edges, anchor) : null), [anchor, edges]);
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return new Set<string>();
    return new Set(nodes.filter((node) => node.label.toLowerCase().includes(needle)).map((node) => node.id));
  }, [query, nodes]);

  const nodeState = (id: string): "anchor" | "up" | "down" | "dim" | "normal" => {
    if (!anchor || !lineage) return "normal";
    if (id === anchor) return "anchor";
    if (lineage.up.has(id)) return "up";
    if (lineage.down.has(id)) return "down";
    return "dim";
  };
  const edgeState = (edge: GraphEdge): "up" | "down" | "dim" | "normal" => {
    if (!anchor || !lineage) return "normal";
    const upSet = new Set([...lineage.up, anchor]);
    const downSet = new Set([...lineage.down, anchor]);
    if (upSet.has(edge.to) && lineage.up.has(edge.from)) return "up";
    if (downSet.has(edge.from) && lineage.down.has(edge.to)) return "down";
    return "dim";
  };

  const nodeColor = (node: GraphNode) => (node.kind === "lookup" ? "#a78bfa" : ROLE_STYLES[node.column!.role].bar);

  const exportDrawio = () => {
    const xml = lineageToDrawIo({ ...layout, nodes, edges }, t("drawioTitle"), (role) => tRoles(role), (size) => t("lookupNode", { count: size }));
    downloadText(xml, `technical-lineage-${model.result.code.filename.replace(/\.py$/, "")}.drawio`, "application/xml");
  };

  return (
    <div data-tour="lineage-graph" className={graphFrame(view.fullscreen)}>
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className={TOOLBAR}>
          <GraphSearch
            value={query}
            onChange={setQuery}
            onEnter={() => {
              const first = nodes.find((node) => matches.has(node.id));
              if (first) {
                select(first.kind === "column" ? { kind: "column", name: first.id } : { kind: "lookup", name: first.label });
                focusNode(first.id);
              }
            }}
            placeholder={t("search")}
          />
          <Toggle active={namesOnly} onClick={toggleNamesOnly} label={t("namesOnly")} />
          <Toggle active={showIsolated} onClick={() => setShowIsolated((value) => !value)} label={t("unconnected", { count: layout.hidden })} />
          <CanvasActions
            moved={moved.moved}
            onReset={resetLayout}
            onDownload={exportDrawio}
            fullscreen={view.fullscreen}
            onFullscreen={() => view.setFullscreen((value) => !value)}
            labels={{ resetLayout: t("resetLayout"), drawio: t("drawio"), fullscreen: t("fullscreen"), exitFullscreen: t("exitFullscreen") }}
          />
        </div>

        <div ref={view.viewport} className={CANVAS} style={canvasBackground(transform)} {...view.panHandlers} onPointerLeave={() => setHoverEdge(null)}>
          <div className="absolute left-0 top-0 origin-top-left" style={layerStyle(transform)}>
            <svg {...edgeLayer(bounds)}>
              <defs>
                {[["normal", "#5b6676"], ["up", "#f5c400"], ["down", "#38bdf8"], ["dim", "#2a313b"], ["lookup", "#a78bfa"], ["indirect", "#d9a441"]].map(([id, color]) => (
                  <marker key={id} id={`lineage-arrow-${id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M 0 1 L 9 5 L 0 9 z" fill={color} />
                  </marker>
                ))}
              </defs>
              {edges.map((edge) => {
                const state = edgeState(edge);
                const base = edge.kind === "lookup" ? "lookup" : edge.direct ? "normal" : "indirect";
                const color = state === "up" ? "#f5c400" : state === "down" ? "#38bdf8" : state === "dim" ? "#232a33" : base === "lookup" ? "#8b74d6" : base === "indirect" ? "#b98b33" : "#4b5563";
                const marker = state === "normal" ? base : state;
                return (
                  <g key={edge.id}>
                    <path
                      d={edge.path}
                      fill="none"
                      stroke={color}
                      strokeWidth={state === "up" || state === "down" ? 2.2 : 1.5}
                      strokeDasharray={edge.kind === "lookup" ? "2 4" : !edge.direct ? "6 4" : undefined}
                      markerEnd={`url(#lineage-arrow-${marker})`}
                      opacity={state === "dim" ? 0.55 : 1}
                      className="transition-[stroke,opacity] duration-200"
                    />
                    <path
                      d={edge.path}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={12}
                      style={{ pointerEvents: "stroke", cursor: "help" }}
                      onPointerEnter={(event) => {
                        if (draggingNode) return;
                        const rect = view.viewport.current?.getBoundingClientRect();
                        setHoverEdge({ edge, x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) });
                      }}
                      onPointerMove={(event) => {
                        if (draggingNode) return;
                        const rect = view.viewport.current?.getBoundingClientRect();
                        setHoverEdge({ edge, x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) });
                      }}
                      onPointerLeave={() => setHoverEdge(null)}
                    />
                  </g>
                );
              })}
            </svg>
            {nodes.map((node) => {
              const state = nodeState(node.id);
              const color = nodeColor(node);
              const isMatch = matches.has(node.id);
              const column = node.column;
              const isSelected = selectedId === node.id;
              const dragging = draggingNode === node.id;
              return (
                <div
                  key={node.id}
                  data-node
                  data-tour={node.kind === "column" && column?.role !== "passthrough" && column?.upstream.length ? "lineage-graph-node" : undefined}
                  role="button"
                  tabIndex={0}
                  aria-roledescription={t("movableNode")}
                  {...drag.handlers(node)}
                  onClick={() => {
                    if (!drag.takeClick()) return;
                    if (selectedId === node.id) select(null);
                    else select(node.kind === "column" ? { kind: "column", name: node.id } : { kind: "lookup", name: node.label });
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") select(node.kind === "column" ? { kind: "column", name: node.id } : { kind: "lookup", name: node.label });
                    drag.nudge(event, node);
                  }}
                  onPointerEnter={() => setHoverNode(node.id)}
                  onPointerLeave={() => setHoverNode(null)}
                  className={cn(
                    "absolute overflow-hidden rounded-lg border bg-[#0f141b] outline-none transition-[opacity,box-shadow,border-color] duration-200 focus-visible:ring-2 focus-visible:ring-[#f5c400]/60",
                    dragging ? "cursor-grabbing shadow-[0_18px_44px_rgba(0,0,0,0.6)]" : "cursor-grab",
                    node.kind === "lookup" && "border-dashed bg-[#130f1d]",
                    state === "dim" ? "opacity-30" : "opacity-100",
                    isSelected
                      ? "border-[#f5c400] shadow-[0_0_0_3px_rgba(245,196,0,0.18),0_10px_30px_rgba(0,0,0,0.45)]"
                      : state === "up"
                        ? "border-[#f5c400]/50"
                        : state === "down"
                          ? "border-sky-400/50"
                          : "border-[#2a313c] hover:border-[#4a5464]",
                    isMatch && "ring-2 ring-[#f5c400]/70",
                  )}
                  style={{ left: node.x, top: node.y, width: NODE_WIDTH, height: NODE_HEIGHT, zIndex: dragging ? 5 : undefined }}
                >
                  <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: color }} />
                  {namesOnly ? (
                    <div data-names-only className="flex h-full items-center px-3.5">
                      <span className="line-clamp-2 min-w-0 flex-1 font-mono text-[13px] font-medium leading-snug text-white [overflow-wrap:anywhere]" title={node.label}>
                        {node.label}
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 px-3 pt-2.5">
                        <NodeIcon node={node} color={color} />
                        <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] font-medium text-white" title={node.label}>
                          {node.label}
                        </span>
                        {node.kind === "column" && <MiniVerification status={model.verification(node.id)} />}
                      </div>
                      <div className="mt-1.5 flex items-center gap-1 overflow-hidden px-3">
                        {node.kind === "lookup" ? (
                          <span className="text-[10px] uppercase tracking-wide text-violet-300/90">{t("lookupNode", { count: node.lookup?.size ?? 0 })}</span>
                        ) : (
                          <>
                            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide" style={{ color: ROLE_STYLES[column!.role].bar }}>
                              {tRoles(column!.role)}
                            </span>
                            {column!.operations.filter((operation) => operation !== "cast" || column!.role === "cast").slice(0, 2).map((operation) => (
                              <span key={operation} className="truncate rounded bg-[#1a212c] px-1 text-[10px] text-[#9aa4b4]">
                                {tOps.has(operation) ? tOps(operation) : operation}
                              </span>
                            ))}
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {hoverEdge && (
            <div className="pointer-events-none absolute z-10 max-w-[320px] rounded-md border border-[#2c3440] bg-[#0b0f15]/95 px-3 py-2 shadow-xl backdrop-blur" style={{ left: hoverEdge.x + 14, top: hoverEdge.y + 14 }}>
              <p className="flex items-center gap-1.5 font-mono text-[11.5px] text-white">
                {hoverEdge.edge.from.replace(/^lookup:/, "")} <ArrowRight className="h-3 w-3 text-[#8c96a8]" /> {hoverEdge.edge.to}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {hoverEdge.edge.transformations.map((item) => <TransformationBadge key={`${item.type}${item.subtype}`} transformation={item} />)}
              </div>
              {hoverEdge.edge.lines.length > 0 && <p className="mt-1.5 font-mono text-[10.5px] text-[#f5c400]">{hoverEdge.edge.lines.map((line) => `L${line}`).join(" · ")}</p>}
              {hoverEdge.edge.historical && <p className="mt-1 text-[10.5px] text-amber-300">{t("historical")}</p>}
            </div>
          )}

          <ZoomControls k={transform.k} onZoom={view.zoom} onFit={fit} labels={{ zoomIn: t("zoomIn"), zoomOut: t("zoomOut"), fit: t("fit") }} />

          <GraphLegend>
            {(["passthrough", "cast", "enriched", "overwritten", "created"] as const).map((role) => (
              <span key={role} className="flex items-center gap-1.5">
                <span className="h-2.5 w-[3px] rounded" style={{ background: ROLE_STYLES[role].bar }} />
                {tRoles(role)}
              </span>
            ))}
            <span className="h-3 w-px bg-[#2a313c]" />
            <EdgeSample label={t("legend.direct")} />
            <EdgeSample label={t("legend.indirect")} dashed="6 4" color="#b98b33" />
            <EdgeSample label={t("legend.lookup")} dashed="2 4" color="#8b74d6" />
          </GraphLegend>
        </div>
      </div>
    </div>
  );
}

function NodeIcon({ node, color }: { node: GraphNode; color: string }) {
  const className = "h-3.5 w-3.5 shrink-0";
  if (node.kind === "lookup") return <Table2 className={className} style={{ color }} />;
  const role = node.column!.role;
  if (role === "passthrough" || role === "dropped") return <Database className={className} style={{ color }} />;
  if (role === "created" || role === "renamed") return <FunctionSquare className={className} style={{ color }} />;
  return <Sigma className={className} style={{ color }} />;
}

function MiniVerification({ status }: { status: Verification }) {
  const t = useTranslations("lineageAgent.verification");
  if (status === "passthrough" || status === "unprobed") return null;
  const color = VERIFICATION_COLORS[status];
  return (
    <span title={t(status)} className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border" style={{ borderColor: `${color}66`, background: `${color}1a` }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
    </span>
  );
}
