"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, Crosshair, Flag, FlaskConical, MousePointerClick } from "lucide-react";
import { cn } from "@/lib/utils";
import { recallInTab, rememberInTab } from "@/lib/tab-memory";
import { downloadText } from "@/components/lineage-agent/download";
import {
  CANVAS, CanvasActions, EdgeSample, GraphLegend, GraphSearch, TOOLBAR, Toggle, ZoomControls, canvasBackground, edgeLayer, graphFrame, layerStyle,
  useCanvasView, useMovedNodes, useNodeDrag,
} from "@/components/lineage-agent/graph-canvas";
import { graphBounds, lineageOf, routeEdges } from "@/components/lineage-agent/graph-layout";
import { ROLE_COLORS, ReachBar } from "./atoms";
import { flowToDrawIo } from "./flow-drawio";
import { FLOW_NODE, layoutFlow, type FlowEdge, type FlowNode } from "./flow-layout";
import type { LinkKind, Model } from "./model";

export const LINK_COLORS: Record<LinkKind, string> = { value: "#34d399", decides: "#fbbf24", impact: "#f472b6" };
export const LINK_DASH: Record<LinkKind, string | undefined> = { value: undefined, decides: "7 5", impact: "2 5" };

/** "Names only" in the toolbar: on by default; the choice holds while the app stays open. */
const NAMES_ONLY = "content-lineage-agent.graph.names-only";

/**
 * The content lineage as an interactive graph, in the style of the technical lineage graph: the followed field on the
 * left, one column per step of the calculation; each field card names its step, so the step goes along when a field is
 * moved. Drag the background to pan, drag a field to move it (kept for the analysis in this browser), scroll to zoom.
 * A selected field lights up how the followed field reaches it (gold) and where its content goes on (blue); hovering
 * a field previews the same.
 */
export function FlowGraph({ model, layoutKey, selected, onSelect }: {
  model: Model;
  /** Identifies the analysis: fields the user moved keep their place for it (in this browser). */
  layoutKey: string;
  /** The field whose details are shown below the graph (the followed field when nothing else is selected). */
  selected: string;
  onSelect: (column: string) => void;
}) {
  const t = useTranslations("contentLineageAgent.lineage");
  const tGraph = useTranslations("contentLineageAgent.lineage.graph");
  const tLegend = useTranslations("contentLineageAgent.lineage.legend");
  const [query, setQuery] = useState("");
  // Names only: each field shows just its name; off, also its step, column, end flag and the records it reaches.
  const [namesOnly, setNamesOnly] = useState(() => recallInTab<boolean>(NAMES_ONLY) ?? true);
  const toggleNamesOnly = () => {
    const next = !namesOnly;
    setNamesOnly(next);
    rememberInTab(NAMES_ONLY, next);
  };
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [hoverEdge, setHoverEdge] = useState<{ edge: FlowEdge; x: number; y: number } | null>(null);
  const moved = useMovedNodes(`dataflow_content_graph_positions:${layoutKey}`);
  const internal = useRef(false);
  const select = (column: string) => {
    internal.current = true;
    onSelect(column);
  };
  // The followed field is the resting state: nothing is highlighted then.
  const selectedId = selected !== model.field && model.flowBy.has(selected) ? selected : null;
  const field = model.termName(model.field);

  const layout = useMemo(() => layoutFlow(model), [model]);
  const nodes = useMemo(
    () => layout.nodes.map((node) => (moved.positions[node.id] ? { ...node, ...moved.positions[node.id] } : node)),
    [layout.nodes, moved.positions],
  );
  const edges = useMemo(() => routeEdges(nodes, layout.links, FLOW_NODE), [nodes, layout.links]);
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const bounds = useMemo(() => graphBounds(nodes, FLOW_NODE), [nodes]);
  const view = useCanvasView(bounds, layout, () => select(model.field));
  const drag = useNodeDrag(view.transform.k, moved, () => setHoverEdge(null));
  const { transform, fit } = view;
  const draggingNode = moved.dragging;

  // The inline height follows the graph: tall enough to show it across the full width, at most as tall as the
  // technical graph (full screen ignores it).
  const frame = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(element.getBoundingClientRect().width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const natural = useMemo(() => graphBounds(layout.nodes, FLOW_NODE), [layout.nodes]);
  const scale = width ? Math.min(1.15, (width - 24) / natural.width) : 1;
  const height = Math.round(Math.min(560, Math.max(400, natural.height * scale + 170)));

  const resetLayout = () => {
    moved.setPositions({});
    window.requestAnimationFrame(() => fit());
  };

  const focusNode = (id: string) => {
    const node = nodeById.get(id);
    if (node) view.focus(node.x, node.y, FLOW_NODE.width, FLOW_NODE.height);
  };

  // A field selected elsewhere (the details, the tour) is brought into view; back to the followed field shows the
  // whole graph.
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
    return new Set(nodes.filter((node) => `${model.termName(node.id)} ${node.id}`.toLowerCase().includes(needle)).map((node) => node.id));
  }, [query, nodes, model]);

  const nodeState = (id: string): "anchor" | "up" | "down" | "dim" | "normal" => {
    if (!anchor || !lineage) return "normal";
    if (id === anchor) return "anchor";
    if (lineage.up.has(id)) return "up";
    if (lineage.down.has(id)) return "down";
    return "dim";
  };
  const edgeState = (edge: FlowEdge): "up" | "down" | "dim" | "normal" => {
    if (!anchor || !lineage) return "normal";
    const upSet = new Set([...lineage.up, anchor]);
    const downSet = new Set([...lineage.down, anchor]);
    if (upSet.has(edge.to) && lineage.up.has(edge.from)) return "up";
    if (downSet.has(edge.from) && lineage.down.has(edge.to)) return "down";
    return "dim";
  };

  // The step of a field, as in its details: the followed field, a next field (its rule reads the followed field), or
  // the step further down.
  const stepLabel = (node: FlowNode) => (node.tone === "start" ? t("column.start") : node.tone === "next" ? t("column.next") : t("column.step", { level: node.level }));

  const exportDrawio = () => {
    const xml = flowToDrawIo(model, nodes, edges, {
      title: tGraph("drawioTitle", { field }),
      step: stepLabel,
      records: (reached, total) => t("card.records", { reached, total }),
      values: (count) => t("card.values", { count }),
      legend: { value: tLegend("value"), decides: tLegend("decides"), impact: tLegend("impact"), end: tLegend("end") },
    });
    downloadText(xml, `content-lineage-${model.field.replace(/[^\w-]+/g, "_")}.drawio`, "application/xml");
  };

  return (
    <div ref={frame} data-tour="content-lineage" className={graphFrame(view.fullscreen, "")} style={view.fullscreen ? undefined : { height }}>
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className={TOOLBAR}>
          <p className="mr-1 text-[13px] font-semibold text-white">{t("diagramTitle", { field })}</p>
          <GraphSearch
            value={query}
            onChange={setQuery}
            onEnter={() => {
              const first = nodes.find((node) => matches.has(node.id));
              if (first) {
                select(first.id);
                focusNode(first.id);
              }
            }}
            placeholder={tGraph("search")}
          />
          <Toggle active={namesOnly} onClick={toggleNamesOnly} label={tGraph("namesOnly")} />
          <p className="hidden min-w-0 items-center gap-1.5 truncate text-[11.5px] text-[#8c96a8] xl:flex">
            <MousePointerClick className="h-3.5 w-3.5 shrink-0 text-[#f5c400]" />
            {t("diagramHint", { field })}
          </p>
          <CanvasActions
            moved={moved.moved}
            onReset={resetLayout}
            onDownload={exportDrawio}
            fullscreen={view.fullscreen}
            onFullscreen={() => view.setFullscreen((value) => !value)}
            labels={{ resetLayout: tGraph("resetLayout"), drawio: tGraph("drawio"), fullscreen: tGraph("fullscreen"), exitFullscreen: tGraph("exitFullscreen") }}
          />
        </div>

        <div ref={view.viewport} className={CANVAS} style={canvasBackground(transform)} {...view.panHandlers} onPointerLeave={() => setHoverEdge(null)}>
          <div className="absolute left-0 top-0 origin-top-left" style={layerStyle(transform)}>
            <svg {...edgeLayer(bounds)}>
              <defs>
                {[...(["value", "decides", "impact"] as const).map((kind) => [kind, LINK_COLORS[kind]]), ["up", "#f5c400"], ["down", "#38bdf8"], ["dim", "#2a313b"]].map(([id, color]) => (
                  <marker key={id} id={`content-arrow-${id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M 0 1 L 9 5 L 0 9 z" fill={color} />
                  </marker>
                ))}
              </defs>
              {edges.map((edge) => {
                const state = edgeState(edge);
                const color = state === "up" ? "#f5c400" : state === "down" ? "#38bdf8" : state === "dim" ? "#232a33" : LINK_COLORS[edge.kind];
                return (
                  <g key={edge.id}>
                    <path
                      d={edge.path}
                      data-from={edge.from}
                      data-to={edge.to}
                      fill="none"
                      stroke={color}
                      strokeWidth={state === "up" || state === "down" ? 2.2 : 1.6}
                      strokeDasharray={LINK_DASH[edge.kind]}
                      strokeLinecap="round"
                      markerEnd={`url(#content-arrow-${state === "normal" ? edge.kind : state})`}
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
            {nodes.map((node) => (
              <FieldNode
                key={node.id}
                model={model}
                node={node}
                step={stepLabel(node)}
                namesOnly={namesOnly}
                state={nodeState(node.id)}
                selected={node.id === selectedId}
                match={matches.has(node.id)}
                dragging={draggingNode === node.id}
                roleDescription={tGraph("movableNode")}
                handlers={drag.handlers(node)}
                onClick={() => {
                  if (!drag.takeClick()) return;
                  select(node.id === selectedId || node.id === model.field ? model.field : node.id);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") select(node.id);
                  drag.nudge(event, node);
                }}
                onHover={(hovered) => setHoverNode(hovered ? node.id : null)}
              />
            ))}
          </div>

          {hoverEdge && (
            <div className="pointer-events-none absolute z-10 max-w-[320px] rounded-md border border-[#2c3440] bg-[#0b0f15]/95 px-3 py-2 shadow-xl backdrop-blur" style={{ left: hoverEdge.x + 14, top: hoverEdge.y + 14 }}>
              <p className="flex flex-wrap items-center gap-1.5 text-[11.5px] font-semibold text-white">
                {model.termName(hoverEdge.edge.from)} <ArrowRight className="h-3 w-3 text-[#8c96a8]" /> {model.termName(hoverEdge.edge.to)}
              </p>
              <p className="mt-1 font-mono text-[10.5px] text-[#687386]">{hoverEdge.edge.from} → {hoverEdge.edge.to}</p>
              <p className="mt-1.5 text-[11px]" style={{ color: LINK_COLORS[hoverEdge.edge.kind] }}>{tLegend(hoverEdge.edge.kind)}</p>
            </div>
          )}

          <ZoomControls k={transform.k} onZoom={view.zoom} onFit={fit} labels={{ zoomIn: tGraph("zoomIn"), zoomOut: tGraph("zoomOut"), fit: tGraph("fit") }} />

          <GraphLegend>
            {(["value", "decides", "impact"] as const).map((kind) => (
              <EdgeSample key={kind} label={tLegend(kind)} dashed={LINK_DASH[kind]} color={LINK_COLORS[kind]} />
            ))}
            {/* The flag is on the cards only when they show more than the names. */}
            {!namesOnly ? <span className="flex items-center gap-1.5"><Flag className="h-3 w-3 text-[#f5c400]" />{tLegend("end")}</span> : null}
          </GraphLegend>
        </div>
      </div>
    </div>
  );
}

/** A field of the graph: its business name, its step and technical column (as a technical node shows its role), and
 *  how many records the followed field reaches there (for the followed field itself: how many values it has). With
 *  "names only", just the business name. */
function FieldNode({ model, node, step, namesOnly, state, selected, match, dragging, roleDescription, handlers, onClick, onKeyDown, onHover }: {
  model: Model;
  node: FlowNode;
  step: string;
  namesOnly: boolean;
  state: "anchor" | "up" | "down" | "dim" | "normal";
  selected: boolean;
  match: boolean;
  dragging: boolean;
  roleDescription: string;
  handlers: ReturnType<ReturnType<typeof useNodeDrag>["handlers"]>;
  onClick: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  onHover: (hovered: boolean) => void;
}) {
  const t = useTranslations("contentLineageAgent.lineage");
  const start = node.id === model.field;
  const flow = model.flowBy.get(node.id);
  const impact = flow?.evidence === "impact";
  const values = model.result.scope.categorical ? model.result.scope.values.length : 0;
  const color = ROLE_COLORS[node.tone];
  return (
    <div
      data-node
      data-field={node.id}
      data-tour={start ? "content-lineage-start" : flow?.direct ? "content-lineage-next" : undefined}
      role="button"
      tabIndex={0}
      aria-roledescription={roleDescription}
      aria-pressed={selected}
      {...handlers}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      className={cn(
        "absolute flex flex-col overflow-hidden rounded-lg border bg-[#0f141b] outline-none transition-[opacity,box-shadow,border-color] duration-200 focus-visible:ring-2 focus-visible:ring-[#f5c400]/60",
        dragging ? "cursor-grabbing shadow-[0_18px_44px_rgba(0,0,0,0.6)]" : "cursor-grab",
        impact && "border-dashed",
        state === "dim" ? "opacity-30" : "opacity-100",
        selected
          ? "border-[#f5c400] shadow-[0_0_0_3px_rgba(245,196,0,0.18),0_10px_30px_rgba(0,0,0,0.45)]"
          : state === "up"
            ? "border-[#f5c400]/50"
            : state === "down"
              ? "border-sky-400/50"
              : start
                ? "border-[#f5c400]/45 hover:border-[#f5c400]/75"
                : impact
                  ? "border-pink-400/50 hover:border-pink-400/80"
                  : "border-[#2a313c] hover:border-[#4a5464]",
        match && "ring-2 ring-[#f5c400]/70",
      )}
      style={{ left: node.x, top: node.y, width: FLOW_NODE.width, height: FLOW_NODE.height, zIndex: dragging ? 5 : undefined }}
    >
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: color }} />
      {namesOnly ? (
        <div data-names-only className="flex h-full items-center px-3.5">
          <span className="line-clamp-3 min-w-0 flex-1 text-[13px] font-semibold leading-snug text-white [overflow-wrap:anywhere]" title={`${model.termName(node.id)} · ${node.id}`}>{model.termName(node.id)}</span>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-2 px-3 pt-2.5">
            {start && <Crosshair className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color }} />}
            <span className="line-clamp-2 min-w-0 flex-1 text-[12.5px] font-semibold leading-snug text-white [overflow-wrap:anywhere]" title={model.termName(node.id)}>{model.termName(node.id)}</span>
            {flow?.end && <Flag className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#f5c400]" />}
            {impact && <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pink-300" />}
          </div>
          <p className="mt-0.5 flex min-w-0 items-baseline gap-2 px-3 text-[10px]">
            <span data-step className="shrink-0 font-semibold uppercase tracking-wide" style={{ color }}>{step}</span>
            <span className="min-w-0 truncate font-mono text-[#687386]" title={node.id}>{node.id}</span>
          </p>
          <div className="mt-auto flex items-center gap-2 px-3 pb-2.5">
            {flow ? (
              <>
                <ReachBar records={flow.records} height={4} className="flex-1" />
                <span className="shrink-0 text-[10px] tabular-nums text-[#8c96a8]">{t("card.records", { reached: flow.records.reached, total: flow.records.total })}</span>
              </>
            ) : values > 0 ? (
              <span className="text-[10.5px] text-[#8c96a8]">{t("card.values", { count: values })}</span>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
