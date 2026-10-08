"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowRight, BookOpen, Download, FileText, Maximize2, Minimize2, Minus, Move, Plus, RotateCcw, ScanSearch, Search, ShieldCheck, TriangleAlert, Wand2, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Highlighted, shortHeading } from "@/components/regulation-matcher/atoms";
import {
  EYEBROW, Formula, KIND_COLORS, KindBadge, KindIcon, LineChip, ORIGIN_COLORS, ProvisionChip, ShareBar, TermChip, VERDICT_COLORS, VerdictBadge, useNumbers,
} from "./atoms";
import { downloadText } from "@/components/lineage-agent/download";
import { contentLineageToDrawIo } from "./drawio";
import { graphBounds, layoutGraph, lineageOf, provisionId, routeEdges, ruleId, termId, type GraphEdge, type GraphNode } from "./graph-layout";
import { provisionKey, type Model } from "./model";
import type { Navigator, Selection } from "./types";

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

const selectionId = (selection: Selection) =>
  !selection ? null : selection.kind === "term" ? termId(selection.id) : selection.kind === "rule" ? ruleId(selection.id) : provisionId(selection.id);

const EDGE_STYLES: Record<GraphEdge["kind"], { color: string; dash?: string; width: number }> = {
  value: { color: "#4b5563", width: 1.5 },
  selector: { color: "#b98b33", dash: "6 4", width: 1.4 },
  derives: { color: "#7c6bc4", width: 1.7 },
  regulation: { color: "#c2703a", dash: "3 4", width: 1.4 },
};

export function GraphView({ model, selected, onSelect, nav, layoutKey }: {
  model: Model;
  selected: Selection;
  onSelect: (selection: Selection) => void;
  nav: Navigator;
  /** Identifies the analysis: nodes the user moved keep their place for it (in this browser). */
  layoutKey?: string;
}) {
  const t = useTranslations("contentLineageAgent.graph");
  const numbers = useNumbers();
  const [showRules, setShowRules] = useState(true);
  const [showRegulation, setShowRegulation] = useState(true);
  const [showSelectors, setShowSelectors] = useState(true);
  const [query, setQuery] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [hoverEdge, setHoverEdge] = useState<{ edge: GraphEdge; x: number; y: number } | null>(null);
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, k: 1 });
  const viewport = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);
  const storageKey = layoutKey ? `dataflow_content_lineage_graph_positions:${layoutKey}` : null;
  const [positions, setPositions] = useState<Positions>(() => readPositions(storageKey));
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const nodeDrag = useRef<{ id: string; pointerX: number; pointerY: number; x: number; y: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const internal = useRef(false);
  const select = (selection: Selection) => {
    internal.current = true;
    onSelect(selection);
  };

  const layout = useMemo(() => layoutGraph(model, { showRules, showRegulation, showSelectors }), [model, showRules, showRegulation, showSelectors]);
  const nodes = useMemo(() => layout.nodes.map((item) => (positions[item.id] ? { ...item, ...positions[item.id] } : item)), [layout.nodes, positions]);
  const edges = useMemo(() => routeEdges(nodes, layout.edges), [nodes, layout.edges]);
  const nodeById = useMemo(() => new Map(nodes.map((item) => [item.id, item])), [nodes]);
  const bounds = useMemo(() => graphBounds(nodes), [nodes]);
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;
  const moved = Object.keys(positions).length > 0;

  const fit = useCallback(() => {
    const element = viewport.current;
    if (!element) return;
    const { width, height } = element.getBoundingClientRect();
    if (!width || !height) return;
    const box = boundsRef.current;
    const k = Math.min(1.1, Math.max(0.2, Math.min((width - 24) / box.width, (height - 24) / box.height)));
    setTransform({ k, x: (width - box.width * k) / 2 - box.x * k, y: (height - box.height * k) / 2 - box.y * k });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

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

  const focusNode = useCallback((id: string) => {
    const item = nodeById.get(id);
    const element = viewport.current;
    if (!item || !element) return;
    const { width, height } = element.getBoundingClientRect();
    setTransform((current) => {
      const k = Math.max(current.k, 0.8);
      return { k, x: width / 2 - (item.x + item.width / 2) * k, y: height / 2 - (item.y + item.height / 2) * k };
    });
  }, [nodeById]);

  // A term or rule selected in another view is brought into view.
  const selectedId = selectionId(selected);
  useEffect(() => {
    if (internal.current) {
      internal.current = false;
      return;
    }
    if (selectedId && nodeById.has(selectedId)) {
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
    return new Set(nodes.filter((item) => label(model, item).toLowerCase().includes(needle) || item.ref.toLowerCase().includes(needle)).map((item) => item.id));
  }, [query, nodes, model]);

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
  const onNodePointerDown = (event: ReactPointerEvent<HTMLDivElement>, item: GraphNode) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    suppressClick.current = false;
    nodeDrag.current = { id: item.id, pointerX: event.clientX, pointerY: event.clientY, x: item.x, y: item.y, moved: false };
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
  const moveNode = (item: GraphNode, dx: number, dy: number) => setPositions((value) => ({ ...value, [item.id]: { x: item.x + dx, y: item.y + dy } }));
  const selectionOf = (item: GraphNode): Selection => ({ kind: item.kind, id: item.ref });

  const exportDrawio = () => {
    const xml = contentLineageToDrawIo({ ...layout, nodes, edges }, model, t("drawioTitle"), {
      figure: t("legend.figure"), concept: t("legend.concept"), source: t("legend.source"),
      cases: (count) => t("cases", { count }),
    });
    downloadText(xml, `content-lineage-${model.result.code.filename.replace(/\.py$/, "")}.drawio`, "application/xml");
  };

  return (
    <div
      data-tour="content-graph"
      className={cn(
        "flex overflow-hidden rounded-lg border border-[#252a33] bg-[#090c11]",
        fullscreen ? "fixed inset-3 z-50 shadow-[0_30px_120px_rgba(0,0,0,0.75)]" : "relative h-[calc(100vh-345px)] min-h-[600px]",
      )}
    >
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-[#1f252e] bg-[#0b0f15] px-3 py-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#5d6878]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                const first = nodes.find((item) => matches.has(item.id));
                if (first) {
                  select(selectionOf(first));
                  focusNode(first.id);
                }
              }}
              placeholder={t("search")}
              className="h-8 w-48 rounded-md border border-[#252a33] bg-[#0f141b] pl-8 pr-2 text-[12px] text-white outline-none placeholder:text-[#5d6878] focus:border-[#f5c400]/50"
            />
          </div>
          <Toggle active={showRules} onClick={() => setShowRules((value) => !value)} label={t("rules")} color={KIND_COLORS.rule} />
          <Toggle active={showRegulation} onClick={() => setShowRegulation((value) => !value)} label={t("regulation", { count: model.provisions.length })} color={KIND_COLORS.provision} disabled={!model.provisions.length} />
          <Toggle active={showSelectors} onClick={() => setShowSelectors((value) => !value)} label={t("selectors")} color="#d9a441" />
          {layout.hidden > 0 && <span className="text-[11px] text-[#687386]">{t("hidden", { count: layout.hidden })}</span>}
          <div className="ml-auto flex items-center gap-1">
            <IconButton label={t("resetLayout")} onClick={resetLayout} disabled={!moved}><RotateCcw className="h-3.5 w-3.5" /></IconButton>
            <IconButton label={t("drawio")} onClick={exportDrawio}><Download className="h-3.5 w-3.5" /></IconButton>
            <IconButton label={fullscreen ? t("exitFullscreen") : t("fullscreen")} onClick={() => setFullscreen((value) => !value)}>
              {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </IconButton>
          </div>
        </div>

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
                {[["value", "#6b7280"], ["selector", "#d9a441"], ["derives", "#8b7ad6"], ["regulation", "#e08a4c"], ["up", "#f5c400"], ["down", "#38bdf8"], ["dim", "#2a313b"]].map(([id, color]) => (
                  <marker key={id} id={`content-arrow-${id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M 0 1 L 9 5 L 0 9 z" fill={color} />
                  </marker>
                ))}
              </defs>
              {edges.map((edge) => {
                const state = edgeState(edge);
                const style = EDGE_STYLES[edge.kind];
                const color = state === "up" ? "#f5c400" : state === "down" ? "#38bdf8" : state === "dim" ? "#232a33" : style.color;
                return (
                  <g key={edge.id}>
                    <path
                      d={edge.path}
                      fill="none"
                      stroke={color}
                      strokeWidth={state === "up" || state === "down" ? style.width + 0.8 : style.width}
                      strokeDasharray={style.dash}
                      markerEnd={`url(#content-arrow-${state === "normal" ? edge.kind : state})`}
                      opacity={state === "dim" ? 0.5 : 1}
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
            {nodes.map((item) => {
              const state = nodeState(item.id);
              const isSelected = selectedId === item.id;
              const dragging = draggingNode === item.id;
              return (
                <div
                  key={item.id}
                  data-node={item.kind}
                  data-ref={item.ref}
                  data-tour={item.kind === "term" && model.figures[0] === item.ref ? "content-graph-figure" : item.kind === "rule" ? "content-graph-rule" : item.kind === "provision" ? "content-graph-provision" : undefined}
                  role="button"
                  tabIndex={0}
                  aria-roledescription={t("movableNode")}
                  aria-label={label(model, item)}
                  onPointerDown={(event) => onNodePointerDown(event, item)}
                  onPointerMove={onNodePointerMove}
                  onPointerUp={onNodePointerUp}
                  onPointerCancel={onNodePointerUp}
                  onClick={() => {
                    if (suppressClick.current) {
                      suppressClick.current = false;
                      return;
                    }
                    select(isSelected ? null : selectionOf(item));
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") select(selectionOf(item));
                    const step = event.shiftKey ? 40 : 10;
                    const delta = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, [number, number]>)[event.key];
                    if (delta) {
                      event.preventDefault();
                      moveNode(item, delta[0], delta[1]);
                    }
                  }}
                  onPointerEnter={() => setHoverNode(item.id)}
                  onPointerLeave={() => setHoverNode(null)}
                  className={cn(
                    "absolute overflow-hidden border outline-none transition-[opacity,box-shadow,border-color] duration-200 focus-visible:ring-2 focus-visible:ring-[#f5c400]/60",
                    item.kind === "rule" ? "rounded-full bg-[#120f1c]" : item.kind === "provision" ? "rounded-md bg-[#17110b]" : "rounded-lg bg-[#0f141b]",
                    dragging ? "cursor-grabbing shadow-[0_18px_44px_rgba(0,0,0,0.6)]" : "cursor-grab",
                    state === "dim" ? "opacity-30" : "opacity-100",
                    isSelected
                      ? "border-[#f5c400] shadow-[0_0_0_3px_rgba(245,196,0,0.18),0_10px_30px_rgba(0,0,0,0.45)]"
                      : state === "up"
                        ? "border-[#f5c400]/50"
                        : state === "down"
                          ? "border-sky-400/50"
                          : item.kind === "term" && model.figures.includes(item.ref)
                            ? "border-[#f5c400]/45 hover:border-[#f5c400]/70"
                            : item.kind === "provision"
                              ? "border-orange-400/30 hover:border-orange-300/60"
                              : item.kind === "rule"
                                ? "border-violet-400/30 hover:border-violet-300/60"
                                : "border-[#2a313c] hover:border-[#4a5464]",
                    matches.has(item.id) && "ring-2 ring-[#f5c400]/70",
                  )}
                  style={{ left: item.x, top: item.y, width: item.width, height: item.height, zIndex: dragging ? 5 : undefined }}
                >
                  {item.kind === "term" && <TermNode model={model} column={item.ref} numbers={numbers} />}
                  {item.kind === "rule" && <RuleNode model={model} rule={item.ref} />}
                  {item.kind === "provision" && <ProvisionNode model={model} provisionKey={item.ref} />}
                </div>
              );
            })}
          </div>

          {hoverEdge && <EdgeTip model={model} edge={hoverEdge.edge} x={hoverEdge.x} y={hoverEdge.y} />}

          <div className="absolute bottom-3 right-3 flex flex-col items-center gap-1 rounded-md border border-[#1f252e] bg-[#0b0f15]/90 p-1 backdrop-blur" onPointerDown={(event) => event.stopPropagation()}>
            <IconButton label={t("zoomIn")} onClick={() => zoom(1.25)}><Plus className="h-3.5 w-3.5" /></IconButton>
            <span className="py-0.5 text-center text-[10px] tabular-nums text-[#8c96a8]">{Math.round(transform.k * 100)}%</span>
            <IconButton label={t("zoomOut")} onClick={() => zoom(1 / 1.25)}><Minus className="h-3.5 w-3.5" /></IconButton>
            <IconButton label={t("fit")} onClick={fit}><ScanSearch className="h-3.5 w-3.5" /></IconButton>
          </div>

          <div className="pointer-events-none absolute bottom-3 left-3 flex max-w-[calc(100%-90px)] flex-wrap items-center gap-x-4 gap-y-1.5 rounded-md border border-[#1f252e] bg-[#0b0f15]/90 px-3 py-2 text-[10.5px] text-[#9aa4b4] backdrop-blur">
            {(["figure", "concept", "source"] as const).map((kind) => (
              <span key={kind} className="flex items-center gap-1.5"><KindIcon kind={kind} className="h-3 w-3" />{t(`legend.${kind}`)}</span>
            ))}
            {showRules && <span className="flex items-center gap-1.5"><KindIcon kind="rule" className="h-3 w-3" />{t("legend.rule")}</span>}
            {showRegulation && model.provisions.length > 0 && <span className="flex items-center gap-1.5"><KindIcon kind="provision" className="h-3 w-3" />{t("legend.provision")}</span>}
            <span className="h-3 w-px bg-[#2a313c]" />
            <EdgeSample label={t("legend.value")} color={EDGE_STYLES.value.color} />
            {showSelectors && <EdgeSample label={t("legend.selector")} color={EDGE_STYLES.selector.color} dashed={EDGE_STYLES.selector.dash} />}
            {showRegulation && model.provisions.length > 0 && <EdgeSample label={t("legend.regulationEdge")} color={EDGE_STYLES.regulation.color} dashed={EDGE_STYLES.regulation.dash} />}
            <span className="h-3 w-px bg-[#2a313c]" />
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: ORIGIN_COLORS.delivered }} />{t("legend.delivered")}</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: ORIGIN_COLORS.derived[0] }} />{t("legend.derived")}</span>
          </div>
        </div>
      </div>

      <aside className="flex w-[360px] shrink-0 flex-col overflow-y-auto border-l border-[#1f252e] bg-[#0b0f15]">
        {selected?.kind === "term" && model.termBy.has(selected.id) ? (
          <TermInspector model={model} column={selected.id} nav={nav} onSelect={select} onClose={() => select(null)} />
        ) : selected?.kind === "rule" && model.ruleBy.has(selected.id) ? (
          <RuleInspector model={model} rule={selected.id} nav={nav} onSelect={select} onClose={() => select(null)} />
        ) : selected?.kind === "provision" && model.provisionBy.has(selected.id) ? (
          <ProvisionInspector model={model} provisionKey={selected.id} nav={nav} onSelect={select} onClose={() => select(null)} />
        ) : (
          <div className="space-y-5 p-4">
            <div>
              <p className={EYEBROW}>{t("about")}</p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-[#aab3c2]">{t("aboutBody")}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <MiniStat label={t("stats.terms")} value={model.result.terms.length} />
              <MiniStat label={t("stats.rules")} value={model.result.rules.length} />
              <MiniStat label={t("stats.cases")} value={model.result.rules.reduce((sum, rule) => sum + rule.cases.length, 0)} />
              <MiniStat label={t("stats.provisions")} value={model.provisions.length} />
            </div>
            <div className="space-y-2 text-[12px] text-[#8c96a8]">
              <p className="flex items-start gap-2"><Wand2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#f5c400]" />{t("tipSelect")}</p>
              <p className="flex items-start gap-2"><ScanSearch className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#f5c400]" />{t("tipNavigate")}</p>
              <p className="flex items-start gap-2"><Move className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#f5c400]" />{t("tipMove")}</p>
            </div>
            {model.figures.map((figure) => (
              <button key={figure} type="button" onClick={() => select({ kind: "term", id: figure })} className="flex w-full items-center gap-2 rounded-md border border-[#f5c400]/30 bg-[#f5c400]/[0.06] px-3 py-2 text-left text-[12.5px] text-[#f5c400] transition-colors hover:bg-[#f5c400]/12">
                <KindIcon kind="figure" />
                <span className="min-w-0 flex-1 truncate">{model.termName(figure)}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}

function label(model: Model, item: GraphNode): string {
  if (item.kind === "term") return model.termName(item.ref);
  if (item.kind === "rule") return model.ruleName(item.ref);
  return model.provisionBy.get(item.ref)?.link.reference ?? item.ref;
}

function TermNode({ model, column, numbers }: { model: Model; column: string; numbers: ReturnType<typeof useNumbers> }) {
  const t = useTranslations("contentLineageAgent.graph");
  const term = model.termBy.get(column)!;
  const color = KIND_COLORS[term.kind];
  const composition = term.composition;
  const figure = term.kind === "figure" ? model.result.figures[column] : null;
  return (
    <>
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: color }} />
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <KindIcon kind={term.kind} />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-white" title={model.termName(column)}>{model.termName(column)}</span>
        {figure?.numeric && figure.total !== null && <span className="shrink-0 font-mono text-[11px] tabular-nums text-[#f5c400]">{numbers.compact(figure.total)}</span>}
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 px-3">
        <span className="truncate font-mono text-[10.5px] text-[#687386]">{column}</span>
        {term.classifier && <span className="shrink-0 rounded bg-[#d9a441]/12 px-1 text-[9.5px] uppercase tracking-wide text-[#d9a441]">{t("classifier")}</span>}
      </div>
      <div className="absolute inset-x-3 bottom-2.5">
        {composition ? (
          <ShareBar
            height={4}
            parts={[
              { value: composition.delivered.records, color: ORIGIN_COLORS.delivered, label: t("tip.delivered", { count: composition.delivered.records }) },
              { value: composition.derived, color: ORIGIN_COLORS.derived[0], label: t("tip.derived", { count: composition.derived }) },
              { value: composition.missing, color: ORIGIN_COLORS.missing, label: t("tip.missing", { count: composition.missing }) },
            ]}
          />
        ) : term.profile ? (
          <ShareBar height={4} parts={[{ value: term.profile.non_null, color: ORIGIN_COLORS.delivered, label: t("tip.filled", { filled: term.profile.non_null, total: term.profile.total }) }, { value: term.profile.total - term.profile.non_null, color: "#2a313c" }]} />
        ) : null}
      </div>
    </>
  );
}

function RuleNode({ model, rule }: { model: Model; rule: string }) {
  const t = useTranslations("contentLineageAgent.graph");
  const item = model.ruleBy.get(rule)!;
  const assessment = model.assessment(rule);
  return (
    <div className="flex h-full items-center gap-2 px-4">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-violet-400/40 bg-violet-400/10 font-mono text-[10px] font-semibold text-violet-200">{rule}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-semibold text-[#ece8ff]" title={model.ruleName(rule)}>{model.ruleName(rule)}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-[#9d95c9]">
          {t("cases", { count: item.cases.length })}
          {assessment && assessment.verdict !== "not_covered" && (
            <span className="inline-flex items-center gap-1" title={assessment.verdict}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: VERDICT_COLORS[assessment.verdict] }} />
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

function ProvisionNode({ model, provisionKey }: { model: Model; provisionKey: string }) {
  const provision = model.provisionBy.get(provisionKey)!;
  return (
    <>
      <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: VERDICT_COLORS[provision.verdict] }} />
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <FileText className="h-3.5 w-3.5 shrink-0 text-orange-300" />
        <span className="rounded bg-orange-400/15 px-1 font-mono text-[9.5px] font-semibold uppercase text-orange-200">{provision.link.regulation}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] font-semibold text-orange-50">{provision.link.reference}</span>
      </div>
      <p className="mt-1 truncate px-3 text-[11px] text-[#c9b8a6]" title={provision.link.title}>{provision.link.title}</p>
    </>
  );
}

function EdgeTip({ model, edge, x, y }: { model: Model; edge: GraphEdge; x: number; y: number }) {
  const t = useTranslations("contentLineageAgent.graph");
  const name = (id: string) => {
    const [kind, ...rest] = id.split(":");
    const ref = rest.join(":");
    if (kind === "term") return model.termName(ref);
    if (kind === "rule") return model.ruleName(ref);
    return model.provisionBy.get(ref)?.link.reference ?? ref;
  };
  const rule = edge.rule ? model.ruleBy.get(edge.rule) : null;
  const column = edge.from.startsWith("term:") ? edge.from.slice(5) : null;
  const cases = rule && column ? rule.cases.filter((item) => item.inputs.includes(column) || item.selectors.includes(column)) : [];
  return (
    <div className="pointer-events-none absolute z-10 max-w-[340px] rounded-md border border-[#2c3440] bg-[#0b0f15]/95 px-3 py-2 shadow-xl backdrop-blur" style={{ left: x + 14, top: y + 14 }}>
      <p className="flex items-center gap-1.5 text-[11.5px] text-white">
        {name(edge.from)} <ArrowRight className="h-3 w-3 text-[#8c96a8]" /> {name(edge.to)}
      </p>
      <p className="mt-1 text-[11px] text-[#aab3c2]">{t(`edge.${edge.kind}`)}{edge.relation ? ` · ${t(`relation.${edge.relation}`)}` : ""}</p>
      {rule && edge.kind !== "derives" && <p className="mt-1 text-[11px] text-violet-200">{rule.id} · {model.ruleName(rule.id)}</p>}
      {cases.length > 0 && cases.length < rule!.cases.length && (
        <p className="mt-1 text-[10.5px] text-[#8c96a8]">{t("edge.inCases", { cases: cases.map((item) => model.caseLabel(item.id)).join(", ") })}</p>
      )}
    </div>
  );
}

function InspectorHeader({ eyebrow, title, subtitle, badges, onClose }: { eyebrow: string; title: ReactNode; subtitle?: ReactNode; badges?: ReactNode; onClose: () => void }) {
  const t = useTranslations("contentLineageAgent.graph");
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className={EYEBROW}>{eyebrow}</p>
        <p className="mt-1 text-[15px] font-semibold leading-snug text-white">{title}</p>
        {subtitle && <p className="mt-0.5 break-all font-mono text-[11px] text-[#687386]">{subtitle}</p>}
        {badges && <div className="mt-2 flex flex-wrap gap-1.5">{badges}</div>}
      </div>
      <button type="button" onClick={onClose} className="rounded p-1 text-[#687386] hover:text-white" aria-label={t("close")}>
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function TermInspector({ model, column, nav, onSelect, onClose }: { model: Model; column: string; nav: Navigator; onSelect: (selection: Selection) => void; onClose: () => void }) {
  const t = useTranslations("contentLineageAgent.graph");
  const numbers = useNumbers();
  const term = model.termBy.get(column)!;
  const rule = model.ruleOfColumn.get(column);
  const composition = term.composition;
  const figure = model.result.figures[column];
  const assessment = rule ? model.assessment(rule.id) : undefined;
  return (
    <div className="space-y-4 p-4">
      <InspectorHeader
        eyebrow={t("businessTerm")}
        title={model.termName(column)}
        subtitle={column}
        badges={<><KindBadge kind={term.kind} classifier={term.classifier} />{assessment && <VerdictBadge verdict={assessment.verdict} />}</>}
        onClose={onClose}
      />
      {model.definition(column) && <p className="text-[12.5px] leading-relaxed text-[#c9d1dd]">{model.definition(column)}</p>}
      {figure && (
        <div className="rounded-md border border-[#f5c400]/25 bg-[#f5c400]/[0.05] p-3">
          <p className={EYEBROW}>{t("reported")}</p>
          <p className="mt-1 font-mono text-[20px] font-semibold tabular-nums text-[#f5c400]">{figure.numeric ? numbers.amount(figure.total) : t("records", { count: figure.present })}</p>
          <p className="mt-0.5 text-[11.5px] text-[#aab3c2]">{t("figureLine", { present: figure.present, records: figure.records, paths: figure.paths.length + (figure.other_paths?.count ?? 0) })}</p>
          <button type="button" onClick={() => nav.openTerm(column, "figures")} className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-[#f5c400] hover:underline">
            {t("openFigure")} <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {composition && (
        <div>
          <p className={EYEBROW}>{t("content")}</p>
          <ShareBar
            className="mt-2"
            height={8}
            parts={[
              { value: composition.delivered.records, color: ORIGIN_COLORS.delivered },
              ...(rule?.cases ?? []).map((item, index) => ({ value: item.records, color: ORIGIN_COLORS.derived[index % ORIGIN_COLORS.derived.length] })),
              { value: composition.missing, color: ORIGIN_COLORS.missing },
            ]}
          />
          <ul className="mt-2 space-y-1 text-[11.5px]">
            {composition.delivered.records > 0 && (
              <li className="flex items-center gap-2"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: ORIGIN_COLORS.delivered }} /><span className="flex-1 text-[#c9d1dd]">{t("deliveredBySource")}</span><span className="tabular-nums text-[#8c96a8]">{composition.delivered.records}</span></li>
            )}
            {(rule?.cases ?? []).map((item, index) => item.records > 0 && (
              <li key={item.id} className="flex items-center gap-2"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: ORIGIN_COLORS.derived[index % ORIGIN_COLORS.derived.length] }} /><span className="min-w-0 flex-1 truncate text-[#c9d1dd]">{model.caseLabel(item.id)}</span><span className="tabular-nums text-[#8c96a8]">{item.records}</span></li>
            ))}
            {composition.missing > 0 && (
              <li className="flex items-center gap-2"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: ORIGIN_COLORS.missing }} /><span className="flex-1 text-rose-200">{t("missing")}</span><span className="tabular-nums text-rose-300">{composition.missing}</span></li>
            )}
          </ul>
        </div>
      )}
      {!composition && term.profile && (
        <div>
          <p className={EYEBROW}>{t("sourceData")}</p>
          <p className="mt-1.5 text-[12px] text-[#aab3c2]">{t("filled", { filled: term.profile.non_null, total: term.profile.total })}</p>
          {term.profile.values.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">{term.profile.values.map((value) => <span key={value} className="rounded border border-[#2c3440] bg-[#121821] px-1.5 py-[1px] font-mono text-[10.5px] text-[#dbe2ec]">{value}</span>)}</div>
          )}
        </div>
      )}
      {term.nulled && (
        <p className="flex items-start gap-2 rounded-md border border-amber-400/30 bg-amber-400/[0.06] p-2.5 text-[11.5px] text-amber-100">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
          {t("nulled", { count: term.nulled.count, examples: term.nulled.examples.map((value) => `"${String(value).trim()}"`).join(", ") })}
        </p>
      )}
      {rule && (
        <button type="button" onClick={() => onSelect({ kind: "rule", id: rule.id })} className="w-full rounded-md border border-violet-400/25 bg-violet-400/[0.05] p-3 text-left transition-colors hover:border-violet-300/50">
          <p className={cn(EYEBROW, "text-violet-300/80")}>{t("derivedBy")}</p>
          <p className="mt-1 text-[12.5px] font-semibold text-[#ece8ff]">{rule.id} · {model.ruleName(rule.id)}</p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-[#b8b2d6]">{model.ruleStatement(rule.id)}</p>
        </button>
      )}
      {term.inputs.length > 0 && (
        <div>
          <p className={EYEBROW}>{t("builtFrom")}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">{term.inputs.map((name) => <TermChip key={name} model={model} column={name} onClick={(target) => onSelect({ kind: "term", id: target })} />)}</div>
        </div>
      )}
      {term.used_by.length > 0 && (
        <div>
          <p className={EYEBROW}>{t("usedBy")}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">{term.used_by.map((name) => <TermChip key={name} model={model} column={name} onClick={(target) => onSelect({ kind: "term", id: target })} />)}</div>
        </div>
      )}
      {assessment && assessment.links.length > 0 && (
        <div>
          <p className={EYEBROW}>{t("regulatoryBasis")}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {assessment.links.map((link, index) => <ProvisionChip key={`${link.reference}-${index}`} reference={link.reference} regulation={link.regulation} onClick={() => onSelect({ kind: "provision", id: provisionKey(link) })} />)}
          </div>
        </div>
      )}
      <button type="button" onClick={() => nav.openTerm(column, "glossary")} className="flex w-full items-center justify-center gap-2 rounded-md border border-[#f5c400]/40 bg-[#f5c400]/10 px-3 py-2 text-[12.5px] font-semibold text-[#f5c400] transition-colors hover:bg-[#f5c400]/20">
        <BookOpen className="h-3.5 w-3.5" />
        {t("openGlossary")}
      </button>
    </div>
  );
}

function RuleInspector({ model, rule, nav, onSelect, onClose }: { model: Model; rule: string; nav: Navigator; onSelect: (selection: Selection) => void; onClose: () => void }) {
  const t = useTranslations("contentLineageAgent.graph");
  const numbers = useNumbers();
  const item = model.ruleBy.get(rule)!;
  const assessment = model.assessment(rule);
  const composition = model.termBy.get(item.column)?.composition;
  const total = composition?.total_records ?? 0;
  return (
    <div className="space-y-4 p-4">
      <InspectorHeader
        eyebrow={t("businessRule", { id: rule })}
        title={model.ruleName(rule)}
        badges={<>{assessment && <VerdictBadge verdict={assessment.verdict} />}</>}
        onClose={onClose}
      />
      <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-[#8c96a8]">
        {t("derives")} <TermChip model={model} column={item.column} onClick={(target) => onSelect({ kind: "term", id: target })} />
      </div>
      {model.ruleStatement(rule) && <p className="text-[12.5px] leading-relaxed text-[#c9d1dd]">{model.ruleStatement(rule)}</p>}
      <div>
        <p className={EYEBROW}>{t("casesTitle", { count: item.cases.length })}</p>
        <ol className="mt-2 space-y-2">
          {item.cases.map((entry, index) => (
            <li key={entry.id} className="rounded-md border border-[#1f252e] bg-[#0f141b] p-2.5">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full" style={{ background: ORIGIN_COLORS.derived[index % ORIGIN_COLORS.derived.length] }} />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold text-white">{model.caseLabel(entry.id)}</p>
                  {model.caseDescription(entry.id) && <p className="mt-0.5 text-[11.5px] leading-relaxed text-[#aab3c2]">{model.caseDescription(entry.id)}</p>}
                  {entry.condition && <div className="mt-1.5 rounded border border-[#1f252e] bg-[#080b10] px-2 py-1"><Formula text={entry.condition} className="text-[10.5px] leading-[1.7]" /></div>}
                  <p className="mt-1.5 text-[11px] text-[#8c96a8]">
                    {t("caseRecords", { count: entry.records, share: numbers.share(entry.records, total) })}
                    {entry.amount !== null && entry.records > 0 && <> · <span className="font-mono tabular-nums">{numbers.amount(entry.amount)}</span></>}
                  </p>
                  {entry.lookup && (
                    <table className="mt-2 w-full text-[11px]">
                      <tbody>
                        {entry.keys.map((key) => (
                          <tr key={key.key} className="border-t border-[#1a2029]">
                            <td className="py-1 pr-2 font-mono text-[#dbe2ec]">{key.key}</td>
                            <td className={cn("py-1 pr-2 font-mono", key.mapped ? "text-[#f5c400]" : "text-rose-300")}>{key.mapped ? numbers.parameter(key.value, model.percentTable(entry.id)) : t("noParameter")}</td>
                            <td className="py-1 text-right tabular-nums text-[#8c96a8]">{key.records || key.unmapped_rows || 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                <LineChip line={entry.line} end={entry.end_line} />
              </div>
            </li>
          ))}
        </ol>
      </div>
      {assessment && assessment.links.length > 0 && (
        <div>
          <p className={EYEBROW}>{t("regulatoryBasis")}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {assessment.links.map((link, index) => <ProvisionChip key={`${link.reference}-${index}`} reference={link.reference} regulation={link.regulation} onClick={() => onSelect({ kind: "provision", id: provisionKey(link) })} />)}
          </div>
        </div>
      )}
      <button type="button" onClick={() => nav.openRule(rule, "regulation")} className="flex w-full items-center justify-center gap-2 rounded-md border border-orange-400/35 bg-orange-400/[0.08] px-3 py-2 text-[12.5px] font-semibold text-orange-200 transition-colors hover:bg-orange-400/15">
        <ShieldCheck className="h-3.5 w-3.5" />
        {t("openAssessment")}
      </button>
    </div>
  );
}

function ProvisionInspector({ model, provisionKey, nav, onSelect, onClose }: { model: Model; provisionKey: string; nav: Navigator; onSelect: (selection: Selection) => void; onClose: () => void }) {
  const t = useTranslations("contentLineageAgent.graph");
  const provision = model.provisionBy.get(provisionKey)!;
  const link = provision.link;
  return (
    <div className="space-y-4 p-4">
      <InspectorHeader
        eyebrow={t("provision")}
        title={<span className="font-mono">{link.regulation} {link.reference}</span>}
        subtitle={undefined}
        badges={<VerdictBadge verdict={provision.verdict} />}
        onClose={onClose}
      />
      <div>
        <p className="text-[12.5px] font-medium text-[#f1e3d3]">{link.title}</p>
        {link.path.length > 0 && <p className="mt-0.5 text-[11px] text-[#687386]">{link.path.map(shortHeading).join(" › ")}</p>}
      </div>
      {provision.rules.map((entry) => {
        const assessment = model.assessment(entry.rule)!;
        const ruleLink = assessment.links[entry.index];
        return (
          <div key={`${entry.rule}-${entry.index}`} className="space-y-2 rounded-md border border-[#1f252e] bg-[#0f141b] p-3">
            <button type="button" onClick={() => onSelect({ kind: "rule", id: entry.rule })} className="text-left text-[12px] font-semibold text-violet-200 hover:underline">
              {entry.rule} · {model.ruleName(entry.rule)}
            </button>
            <p className="text-[10.5px] uppercase tracking-wide text-orange-300/80">{t(`relation.${entry.relation}`)}</p>
            {model.regulationText(entry.rule).links[entry.index] && <p className="text-[11.5px] leading-relaxed text-[#c9d1dd]">{model.regulationText(entry.rule).links[entry.index]}</p>}
            {ruleLink && (
              <blockquote className="rounded border-l-2 border-orange-400/60 bg-orange-400/[0.05] px-2.5 py-1.5 text-[11.5px] italic leading-relaxed text-[#f1e3d3]">
                “{ruleLink.quote}”
                <span className="mt-1 block not-italic text-[10px] text-emerald-300">{ruleLink.quote_status === "verified" ? t("quoteVerified") : t("quoteRepaired")}</span>
              </blockquote>
            )}
          </div>
        );
      })}
      <div className="max-h-[220px] overflow-y-auto rounded-md border border-[#1f252e] bg-[#080b10] p-2.5 text-[11.5px] leading-relaxed text-[#aab3c2]">
        <Highlighted text={link.text} highlights={provision.rules.flatMap((entry) => model.assessment(entry.rule)?.links[entry.index]?.highlights ?? [])} />
      </div>
      <button type="button" onClick={() => nav.openProvision(provisionKey)} className="flex w-full items-center justify-center gap-2 rounded-md border border-orange-400/35 bg-orange-400/[0.08] px-3 py-2 text-[12.5px] font-semibold text-orange-200 transition-colors hover:bg-orange-400/15">
        <FileText className="h-3.5 w-3.5" />
        {t("readProvision")}
      </button>
    </div>
  );
}

function Toggle({ active, onClick, label: text, color, disabled }: { active: boolean; onClick: () => void; label: string; color: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11.5px] transition-colors disabled:opacity-40",
        active ? "border-[#f5c400]/35 bg-[#f5c400]/10 text-[#f5c400]" : "border-[#252a33] text-[#8c96a8] hover:text-white",
      )}
      aria-pressed={active}
    >
      <span className="h-2 w-2 rounded-sm border" style={{ borderColor: active ? color : "#5d6878", background: active ? color : "transparent" }} />
      {text}
    </button>
  );
}

function IconButton({ label: text, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" title={text} aria-label={text} onClick={onClick} disabled={disabled} className="flex h-8 w-8 items-center justify-center rounded-md border border-[#252a33] text-[#aab3c2] transition-colors hover:border-[#f5c400]/40 hover:text-[#f5c400] disabled:pointer-events-none disabled:opacity-35">
      {children}
    </button>
  );
}

function EdgeSample({ label: text, dashed, color }: { label: string; dashed?: string; color: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke={color} strokeWidth="1.6" strokeDasharray={dashed} /></svg>
      {text}
    </span>
  );
}

function MiniStat({ label: text, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-[#1f252e] bg-[#0f141b] px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-[#687386]">{text}</p>
      <p className="mt-0.5 text-[18px] font-semibold tabular-nums text-white">{value}</p>
    </div>
  );
}
