"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, Database, Download, FunctionSquare, Maximize2, Minimize2, Minus, Plus, RotateCcw, ScanSearch, Search, Sigma, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROLE_STYLES, TransformationBadge, type Verification } from "./atoms";
import { downloadText } from "./download";
import { lineageToDrawIo } from "./drawio";
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

type Transform = { x: number; y: number; k: number };
type Positions = Record<string, { x: number; y: number }>;

/** Room around the nodes for edge curves and loops (the edge layer must cover them to stay hoverable). */
const EDGE_MARGIN = 160;

function readPositions(key: string | null): Positions {
  if (!key) return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as Positions) : {};
  } catch {
    return {};
  }
}

function writePositions(key: string | null, positions: Positions) {
  if (!key) return;
  try {
    if (Object.keys(positions).length) localStorage.setItem(key, JSON.stringify(positions));
    else localStorage.removeItem(key);
  } catch {
    // Storage unavailable: the arrangement lasts for this visit only.
  }
}

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
  const [showLookups, setShowLookups] = useState(true);
  const [showIndirect, setShowIndirect] = useState(true);
  const [showIsolated, setShowIsolated] = useState(false);
  const [colorMode, setColorMode] = useState<"role" | "verification">("role");
  const [query, setQuery] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [hoverEdge, setHoverEdge] = useState<{ edge: GraphEdge; x: number; y: number } | null>(null);
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, k: 1 });
  const viewport = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);
  // Nodes the user moved: their positions replace the automatic layout; the edges are routed to wherever they are.
  const storageKey = layoutKey ? `dataflow_lineage_graph_positions:${layoutKey}` : null;
  const [positions, setPositions] = useState<Positions>(() => readPositions(storageKey));
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const nodeDrag = useRef<{ id: string; pointerX: number; pointerY: number; x: number; y: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const internal = useRef(false);
  const select = (focus: Focus | null) => {
    internal.current = true;
    onSelect(focus);
  };
  const selectedId = selected ? (selected.kind === "lookup" ? lookupId(selected.name) : selected.name) : null;

  const layout = useMemo(
    () => layoutGraph(model.analysis, { showLookups, showIndirect, showIsolated }),
    [model.analysis, showLookups, showIndirect, showIsolated],
  );
  const nodes = useMemo(
    () => layout.nodes.map((node) => (positions[node.id] ? { ...node, ...positions[node.id] } : node)),
    [layout.nodes, positions],
  );
  const edges = useMemo(() => routeEdges(nodes, layout.edges), [nodes, layout.edges]);
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const bounds = useMemo(() => graphBounds(nodes), [nodes]);
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;
  const moved = Object.keys(positions).length > 0;

  // Fits the current arrangement; it runs on layout changes and resizes, never while nodes are being moved.
  const fit = useCallback(() => {
    const element = viewport.current;
    if (!element) return;
    const { width, height } = element.getBoundingClientRect();
    if (!width || !height) return;
    const box = boundsRef.current;
    const k = Math.min(1.15, Math.max(0.2, Math.min((width - 24) / box.width, (height - 24) / box.height)));
    setTransform({ k, x: (width - box.width * k) / 2 - box.x * k, y: (height - box.height * k) / 2 - box.y * k });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  // The arrangement is saved once a move has ended (and cleared by Reset layout).
  useEffect(() => {
    if (!draggingNode) writePositions(storageKey, positions);
  }, [draggingNode, positions, storageKey]);

  const resetLayout = () => {
    setPositions({});
    window.requestAnimationFrame(() => fit());
  };

  useEffect(() => {
    fit();
  }, [fit, fullscreen]);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(() => fit());
    observer.observe(element);
    return () => observer.disconnect();
  }, [fit]);

  // Wheel zoom around the cursor (a native listener: React's wheel listener is passive).
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const mx = event.clientX - rect.left;
      const my = event.clientY - rect.top;
      setTransform((current) => {
        const k = Math.min(2.5, Math.max(0.15, current.k * Math.exp(-event.deltaY * 0.0015)));
        return { k, x: mx - ((mx - current.x) * k) / current.k, y: my - ((my - current.y) * k) / current.k };
      });
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setFullscreen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  const zoom = (factor: number) => {
    const element = viewport.current;
    if (!element) return;
    const { width, height } = element.getBoundingClientRect();
    setTransform((current) => {
      const k = Math.min(2.5, Math.max(0.15, current.k * factor));
      return { k, x: width / 2 - ((width / 2 - current.x) * k) / current.k, y: height / 2 - ((height / 2 - current.y) * k) / current.k };
    });
  };

  const focusNode = useCallback(
    (id: string) => {
      const node = nodeById.get(id);
      const element = viewport.current;
      if (!node || !element) return;
      const { width, height } = element.getBoundingClientRect();
      setTransform((current) => {
        const k = Math.max(current.k, 0.8);
        return { k, x: width / 2 - (node.x + NODE_WIDTH / 2) * k, y: height / 2 - (node.y + NODE_HEIGHT / 2) * k };
      });
    },
    [nodeById],
  );

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

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("[data-node]")) return;
    drag.current = { x: event.clientX, y: event.clientY, tx: transform.x, ty: transform.y, moved: false };
    (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) current.moved = true;
    setTransform((value) => ({ ...value, x: current.tx + dx, y: current.ty + dy }));
  };
  const onPointerUp = () => {
    const current = drag.current;
    drag.current = null;
    if (current && !current.moved) select(null);
  };

  // Moving a node: a press that travels more than a few pixels drags it; a press that stays put is a click.
  const onNodePointerDown = (event: ReactPointerEvent<HTMLDivElement>, node: GraphNode) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    suppressClick.current = false;
    nodeDrag.current = { id: node.id, pointerX: event.clientX, pointerY: event.clientY, x: node.x, y: node.y, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onNodePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = nodeDrag.current;
    if (!current) return;
    const travelled = Math.abs(event.clientX - current.pointerX) + Math.abs(event.clientY - current.pointerY);
    if (!current.moved && travelled < 4) return;
    if (!current.moved) {
      current.moved = true;
      setDraggingNode(current.id);
      setHoverEdge(null);
    }
    const x = Math.round(current.x + (event.clientX - current.pointerX) / transform.k);
    const y = Math.round(current.y + (event.clientY - current.pointerY) / transform.k);
    setPositions((value) => ({ ...value, [current.id]: { x, y } }));
  };
  const onNodePointerUp = () => {
    const current = nodeDrag.current;
    nodeDrag.current = null;
    if (!current?.moved) return;
    suppressClick.current = true;
    setDraggingNode(null);
  };
  const moveNode = (node: GraphNode, dx: number, dy: number) => setPositions((value) => ({ ...value, [node.id]: { x: node.x + dx, y: node.y + dy } }));

  const nodeColor = (node: GraphNode) => {
    if (node.kind === "lookup") return "#a78bfa";
    return colorMode === "role" ? ROLE_STYLES[node.column!.role].bar : VERIFICATION_COLORS[model.verification(node.id)];
  };

  const exportDrawio = () => {
    const xml = lineageToDrawIo({ ...layout, nodes, edges }, t("drawioTitle"), (role) => tRoles(role), (size) => t("lookupNode", { count: size }));
    downloadText(xml, `technical-lineage-${model.result.code.filename.replace(/\.py$/, "")}.drawio`, "application/xml");
  };

  return (
    <div
      data-tour="lineage-graph"
      className={cn(
        "flex overflow-hidden rounded-lg border border-[#252a33] bg-[#090c11]",
        fullscreen ? "fixed inset-3 z-50 shadow-[0_30px_120px_rgba(0,0,0,0.75)]" : "relative h-[560px]",
      )}
    >
      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[#1f252e] bg-[#0b0f15] px-3 py-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#5d6878]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  const first = nodes.find((node) => matches.has(node.id));
                  if (first) {
                    select(first.kind === "column" ? { kind: "column", name: first.id } : { kind: "lookup", name: first.label });
                    focusNode(first.id);
                  }
                }
              }}
              placeholder={t("search")}
              className="h-8 w-48 rounded-md border border-[#252a33] bg-[#0f141b] pl-8 pr-2 text-[12px] text-white outline-none placeholder:text-[#5d6878] focus:border-[#f5c400]/50"
            />
          </div>
          <Toggle active={showLookups} onClick={() => setShowLookups((value) => !value)} label={t("lookups")} />
          <Toggle active={showIndirect} onClick={() => setShowIndirect((value) => !value)} label={t("indirect")} />
          <Toggle active={showIsolated} onClick={() => setShowIsolated((value) => !value)} label={t("unconnected", { count: layout.hidden })} />
          <div className="ml-1 flex overflow-hidden rounded-md border border-[#252a33]">
            {(["role", "verification"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setColorMode(mode)}
                className={cn("px-2.5 py-1.5 text-[11.5px]", colorMode === mode ? "bg-[#f5c400]/15 text-[#f5c400]" : "text-[#8c96a8] hover:text-white")}
              >
                {t(`color.${mode}`)}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1">
            <IconButton label={t("resetLayout")} onClick={resetLayout} disabled={!moved}><RotateCcw className="h-3.5 w-3.5" /></IconButton>
            <IconButton label={t("drawio")} onClick={exportDrawio}><Download className="h-3.5 w-3.5" /></IconButton>
            <IconButton label={fullscreen ? t("exitFullscreen") : t("fullscreen")} onClick={() => setFullscreen((value) => !value)}>
              {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </IconButton>
          </div>
        </div>

        {/* Canvas */}
        <div
          ref={viewport}
          className="relative flex-1 cursor-grab touch-none select-none overflow-hidden active:cursor-grabbing"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(148,163,184,0.10) 1px, transparent 1px)",
            backgroundSize: `${22 * transform.k}px ${22 * transform.k}px`,
            backgroundPosition: `${transform.x}px ${transform.y}px`,
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => setHoverEdge(null)}
        >
          <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})` }}>
            <svg
              width={bounds.width + 2 * EDGE_MARGIN}
              height={bounds.height + 2 * EDGE_MARGIN}
              viewBox={`${bounds.x - EDGE_MARGIN} ${bounds.y - EDGE_MARGIN} ${bounds.width + 2 * EDGE_MARGIN} ${bounds.height + 2 * EDGE_MARGIN}`}
              className="absolute overflow-visible"
              style={{ left: bounds.x - EDGE_MARGIN, top: bounds.y - EDGE_MARGIN }}
            >
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
                        const rect = viewport.current?.getBoundingClientRect();
                        setHoverEdge({ edge, x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) });
                      }}
                      onPointerMove={(event) => {
                        if (draggingNode) return;
                        const rect = viewport.current?.getBoundingClientRect();
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
                  onPointerDown={(event) => onNodePointerDown(event, node)}
                  onPointerMove={onNodePointerMove}
                  onPointerUp={onNodePointerUp}
                  onPointerCancel={onNodePointerUp}
                  onClick={() => {
                    // The click that ends a drag does not select.
                    if (suppressClick.current) {
                      suppressClick.current = false;
                      return;
                    }
                    if (selectedId === node.id) select(null);
                    else select(node.kind === "column" ? { kind: "column", name: node.id } : { kind: "lookup", name: node.label });
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") select(node.kind === "column" ? { kind: "column", name: node.id } : { kind: "lookup", name: node.label });
                    const step = event.shiftKey ? 40 : 10;
                    const delta = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, [number, number]>)[event.key];
                    if (delta) {
                      event.preventDefault();
                      moveNode(node, delta[0], delta[1]);
                    }
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

          {/* Zoom controls */}
          <div className="absolute bottom-3 right-3 flex flex-col items-center gap-1 rounded-md border border-[#1f252e] bg-[#0b0f15]/90 p-1 backdrop-blur" onPointerDown={(event) => event.stopPropagation()}>
            <IconButton label={t("zoomIn")} onClick={() => zoom(1.25)}><Plus className="h-3.5 w-3.5" /></IconButton>
            <span className="py-0.5 text-center text-[10px] tabular-nums text-[#8c96a8]">{Math.round(transform.k * 100)}%</span>
            <IconButton label={t("zoomOut")} onClick={() => zoom(1 / 1.25)}><Minus className="h-3.5 w-3.5" /></IconButton>
            <IconButton label={t("fit")} onClick={fit}><ScanSearch className="h-3.5 w-3.5" /></IconButton>
          </div>

          {/* Legend */}
          <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-md border border-[#1f252e] bg-[#0b0f15]/90 px-3 py-2 text-[10.5px] text-[#9aa4b4] backdrop-blur">
            {colorMode === "role"
              ? (["passthrough", "cast", "enriched", "overwritten", "created"] as const).map((role) => (
                  <span key={role} className="flex items-center gap-1.5">
                    <span className="h-2.5 w-[3px] rounded" style={{ background: ROLE_STYLES[role].bar }} />
                    {tRoles(role)}
                  </span>
                ))
              : (["verified", "partial", "discrepancy", "passthrough"] as const).map((status) => (
                  <span key={status} className="flex items-center gap-1.5">
                    <span className="h-2.5 w-[3px] rounded" style={{ background: VERIFICATION_COLORS[status] }} />
                    {t(`legend.${status}`)}
                  </span>
                ))}
            <span className="h-3 w-px bg-[#2a313c]" />
            <EdgeSample label={t("legend.direct")} />
            <EdgeSample label={t("legend.indirect")} dashed="6 4" color="#b98b33" />
            <EdgeSample label={t("legend.lookup")} dashed="2 4" color="#8b74d6" />
          </div>
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

function Toggle({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11.5px] transition-colors",
        active ? "border-[#f5c400]/35 bg-[#f5c400]/10 text-[#f5c400]" : "border-[#252a33] text-[#8c96a8] hover:text-white",
      )}
      aria-pressed={active}
    >
      <span className={cn("h-2 w-2 rounded-sm border", active ? "border-[#f5c400] bg-[#f5c400]" : "border-[#5d6878]")} />
      {label}
    </button>
  );
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} disabled={disabled} className="flex h-8 w-8 items-center justify-center rounded-md border border-[#252a33] text-[#aab3c2] transition-colors hover:border-[#f5c400]/40 hover:text-[#f5c400] disabled:pointer-events-none disabled:opacity-35">
      {children}
    </button>
  );
}

function EdgeSample({ label, dashed, color = "#6b7280" }: { label: string; dashed?: string; color?: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke={color} strokeWidth="1.6" strokeDasharray={dashed} /></svg>
      {label}
    </span>
  );
}
