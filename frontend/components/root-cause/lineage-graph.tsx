"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ArrowRight, Flag, MousePointerClick } from "lucide-react";
import { cn } from "@/lib/utils";
import { downloadText } from "@/components/lineage-agent/download";
import {
  CANVAS, CanvasActions, EdgeSample, GraphLegend, TOOLBAR, Toggle, ZoomControls, canvasBackground, edgeLayer, graphFrame, layerStyle,
  useCanvasView, useMovedNodes, useNodeDrag,
} from "@/components/lineage-agent/graph-canvas";
import { graphBounds, lineageOf, routeEdges } from "@/components/lineage-agent/graph-layout";
import { NoteChip } from "./atoms";
import { differenceClass, formatSigned, formatValue, numericDifference } from "./format";
import { rootCauseLineageToDrawIo } from "./lineage-drawio";
import { LINEAGE_NODE, TONE_COLORS, layoutLineage, type LineageEdge, type LineageNode, type Tone } from "./lineage-layout";
import type { Chain, FieldValue, RootCauseRow } from "./types";

const RESULT_COLOR = "#a78bfa";
const NO_CHAINS: Chain[] = [];
const TONE_LEGEND: Record<Tone, string> = {
  source: "Read by the new formula",
  origin: "Change a release note covers",
  uncovered: "Change no release note covers",
  carries: "Passes the change on",
};

type State = "anchor" | "up" | "down" | "dim" | "normal";

/** The part of a field in the deviation, as its card names it. */
function roleOf(node: LineageNode, output: string): string {
  if (node.tone === "source") return "Read by the new formula";
  if (node.tone === "origin" || node.tone === "uncovered") return node.kind === "rule" ? "New calculation" : "Changed input data";
  return node.id === output ? "Analysed field" : "Passes the change on";
}

/** Both values of a field as plain text ("80,000 → 90,000 (+10,000)"). */
function valueText(value: FieldValue | undefined): string {
  if (!value) return "";
  if (!value.in_a && !value.in_b) return "intermediate field, not stored";
  if (value.changed && value.in_a && value.in_b) {
    const difference = numericDifference(value.a, value.b);
    return `${formatValue(value.a)} → ${formatValue(value.b)}${difference ? ` (${formatSigned(difference)})` : ""}`;
  }
  if (value.changed && !value.in_a) return `new · ${formatValue(value.b)}`;
  return `${formatValue(value.in_b ? value.b : value.a)} · unchanged`;
}

export function InputPill() {
  return <span className="mt-px shrink-0 rounded-sm bg-[#f5c400] px-1 py-px text-[9px] font-bold uppercase tracking-wide text-[#0b0f15]">Input</span>;
}

/**
 * The compare run's lineage of one deviation as an interactive graph, in the style of the technical and content lineage
 * graphs: the fields from where the change starts (left) to the analysed field (right), each card with its part in the
 * change and both values; the input of the boss's rule carries the INPUT mark. Drag the background to pan, drag a field
 * to move it (kept for this position in this browser), scroll to zoom; a selected or hovered field lights up where its
 * change comes from (gold) and where it goes (blue). The details of the selected field are shown under the graph.
 * Only the release notes' chains are drawn unless the toggle adds the changes no release note covers.
 */
export function LineageGraph({ row, inputs, showNote, layoutKey, dataset, onFullscreenChange }: {
  row: RootCauseRow;
  /** The fields marked as the input (the computed ones, or the input the review set). */
  inputs: Set<string>;
  /** Whether a release note is still linked to the row (the review can remove one). */
  showNote: (label: string) => boolean;
  /** Identifies the run, field and position: fields the user moved keep their place for it (in this browser). */
  layoutKey: string;
  /** The compare run's dataset, named where a value comes from the input data. */
  dataset: string;
  onFullscreenChange?: (fullscreen: boolean) => void;
}) {
  const [withUncovered, setWithUncovered] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [hoverEdge, setHoverEdge] = useState<{ edge: LineageEdge; x: number; y: number } | null>(null);
  const values = row.values ?? {};
  const shown = row.chains ?? NO_CHAINS;
  const other = row.other_chains ?? NO_CHAINS;
  const chains = useMemo(() => (withUncovered && other.length ? [...shown, ...other] : shown), [withUncovered, shown, other]);

  const layout = useMemo(() => layoutLineage(chains), [chains]);
  const moved = useMovedNodes(`dataflow_rootcause_graph_positions:${layoutKey}`);
  const nodes = useMemo(
    () => layout.nodes.map((node) => (moved.positions[node.id] ? { ...node, ...moved.positions[node.id] } : node)),
    [layout.nodes, moved.positions],
  );
  const edges = useMemo(() => routeEdges(nodes, layout.links, LINEAGE_NODE), [nodes, layout.links]);
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const bounds = useMemo(() => graphBounds(nodes, LINEAGE_NODE), [nodes]);
  const view = useCanvasView(bounds, layout, () => setSelected(null));
  const drag = useNodeDrag(view.transform.k, moved, () => setHoverEdge(null));
  const { transform, fit } = view;
  const draggingNode = moved.dragging;
  const selectedId = selected && nodeById.has(selected) ? selected : null;

  // The dialog around the graph must not close on Escape while the graph is full screen.
  useEffect(() => {
    onFullscreenChange?.(view.fullscreen);
  }, [view.fullscreen, onFullscreenChange]);
  useEffect(() => () => onFullscreenChange?.(false), [onFullscreenChange]);

  // The inline height follows the graph, as the content lineage graph's does (full screen ignores it).
  const frame = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(element.getBoundingClientRect().width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const natural = useMemo(() => graphBounds(layout.nodes, LINEAGE_NODE), [layout.nodes]);
  const scale = width ? Math.min(1.15, (width - 24) / natural.width) : 1;
  const height = Math.round(Math.min(480, Math.max(330, natural.height * scale + 170)));

  const anchor = selectedId ?? draggingNode ?? hoverNode;
  const lineage = useMemo(() => (anchor ? lineageOf(edges, anchor) : null), [anchor, edges]);
  const nodeState = (id: string): State => {
    if (!anchor || !lineage) return "normal";
    if (id === anchor) return "anchor";
    if (lineage.up.has(id)) return "up";
    if (lineage.down.has(id)) return "down";
    return "dim";
  };
  const edgeState = (edge: LineageEdge): Exclude<State, "anchor"> => {
    if (!anchor || !lineage) return "normal";
    const upSet = new Set([...lineage.up, anchor]);
    const downSet = new Set([...lineage.down, anchor]);
    if (upSet.has(edge.to) && lineage.up.has(edge.from)) return "up";
    if (downSet.has(edge.from) && lineage.down.has(edge.to)) return "down";
    return "dim";
  };

  /** The release note named on an origin's card: its Jira ID, or that none covers the change. */
  const cardNote = (node: LineageNode): { text: string; covered: boolean } | null => {
    if (node.tone === "uncovered") return { text: "no release note", covered: false };
    if (node.tone === "origin" && node.chain?.note && showNote(node.chain.note)) return { text: node.chain.note, covered: true };
    return null;
  };

  const resetLayout = () => {
    moved.setPositions({});
    window.requestAnimationFrame(() => fit());
  };

  const title = `Lineage of ${row.output} · ${row.position}`;
  const exportDrawio = () => {
    const xml = rootCauseLineageToDrawIo(nodes, edges, {
      title,
      role: (node) => roleOf(node, row.output),
      values: (node) => valueText(values[node.id]),
      note: (node) => cardNote(node)?.text ?? "",
      isInput: (id) => inputs.has(id),
      isResult: (id) => id === row.output,
      legend: { covered: "covered by a release note", uncovered: "not covered by a release note", input: "first changed field in both runs", result: "analysed field" },
    });
    downloadText(xml, `rootcause-lineage-${row.position}-${row.output}.drawio`.replace(/[^\w.-]+/g, "_"), "application/xml");
  };

  const tones = (["source", "origin", "uncovered", "carries"] as const).filter((tone) => nodes.some((node) => node.tone === tone));
  const hasUncovered = edges.some((edge) => !edge.covered);
  const selectedNode = selectedId ? nodeById.get(selectedId) ?? null : null;

  return (
    <div>
      {/* No margin on the frame: in full screen (fixed, inset 12px) a margin would shorten it. */}
      <div ref={frame} data-rootcause-graph className={graphFrame(view.fullscreen, "")} style={view.fullscreen ? undefined : { height }}>
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div className={TOOLBAR}>
            <p className="mr-1 text-[13px] font-semibold text-white">{title}</p>
            {other.length ? (
              <Toggle active={withUncovered} onClick={() => setWithUncovered((value) => !value)} label={`Changes no release note covers (${other.length})`} />
            ) : null}
            <p className="hidden min-w-0 items-center gap-1.5 truncate text-[11.5px] text-[#8c96a8] lg:flex">
              <MousePointerClick className="h-3.5 w-3.5 shrink-0 text-[#f5c400]" />
              Compare run · click a field for its values and calculation
            </p>
            <CanvasActions
              moved={moved.moved}
              onReset={resetLayout}
              onDownload={exportDrawio}
              fullscreen={view.fullscreen}
              onFullscreen={() => view.setFullscreen((value) => !value)}
              labels={{ resetLayout: "Reset layout", drawio: "Download as draw.io", fullscreen: "Full screen", exitFullscreen: "Exit full screen" }}
            />
          </div>

          <div ref={view.viewport} className={CANVAS} style={canvasBackground(transform)} {...view.panHandlers} onPointerLeave={() => setHoverEdge(null)}>
            <div className="absolute left-0 top-0 origin-top-left" style={layerStyle(transform)}>
              <svg {...edgeLayer(bounds)}>
                <defs>
                  {[["normal", "#5b6676"], ["uncovered", "#c2566a"], ["up", "#f5c400"], ["down", "#38bdf8"], ["dim", "#2a313b"]].map(([id, color]) => (
                    <marker key={id} id={`rootcause-arrow-${id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                      <path d="M 0 1 L 9 5 L 0 9 z" fill={color} />
                    </marker>
                  ))}
                </defs>
                {edges.map((edge) => {
                  const state = edgeState(edge);
                  const color = state === "up" ? "#f5c400" : state === "down" ? "#38bdf8" : state === "dim" ? "#232a33" : edge.covered ? "#4b5563" : "#b4536a";
                  const marker = state === "normal" ? (edge.covered ? "normal" : "uncovered") : state;
                  return (
                    <g key={edge.id}>
                      <path
                        d={edge.path}
                        data-from={edge.from}
                        data-to={edge.to}
                        fill="none"
                        stroke={color}
                        strokeWidth={state === "up" || state === "down" ? 2.2 : 1.6}
                        strokeDasharray={edge.covered ? undefined : "6 4"}
                        strokeLinecap="round"
                        markerEnd={`url(#rootcause-arrow-${marker})`}
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
                <FieldCard
                  key={node.id}
                  node={node}
                  value={values[node.id]}
                  output={row.output}
                  isInput={inputs.has(node.id)}
                  note={cardNote(node)}
                  state={nodeState(node.id)}
                  selected={node.id === selectedId}
                  dragging={draggingNode === node.id}
                  handlers={drag.handlers(node)}
                  onClick={() => {
                    if (!drag.takeClick()) return;
                    setSelected((current) => (current === node.id ? null : node.id));
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") setSelected(node.id);
                    drag.nudge(event, node);
                  }}
                  onHover={(hovered) => setHoverNode(hovered ? node.id : null)}
                />
              ))}
            </div>

            {hoverEdge && (
              <div className="pointer-events-none absolute z-10 max-w-[340px] rounded-md border border-[#2c3440] bg-[#0b0f15]/95 px-3 py-2 shadow-xl backdrop-blur" style={{ left: hoverEdge.x + 14, top: hoverEdge.y + 14 }}>
                <p className="flex flex-wrap items-center gap-1.5 text-[11.5px] font-semibold text-white">
                  {hoverEdge.edge.from} <ArrowRight className="h-3 w-3 text-[#8c96a8]" /> {hoverEdge.edge.to}
                </p>
                <p className="mt-1 text-[11px] leading-5 text-[#aab3c2]">
                  {hoverEdge.edge.calculation
                    ? `New calculation of ${hoverEdge.edge.to}${hoverEdge.edge.chain.condition ? ` for ${hoverEdge.edge.chain.condition}` : ""}: the compare run now reads ${hoverEdge.edge.from}.`
                    : `${hoverEdge.edge.to} changes because ${hoverEdge.edge.from} changed.`}
                </p>
                {!hoverEdge.edge.covered ? (
                  <p className="mt-1 text-[10.5px] text-rose-300">Not covered by a release note</p>
                ) : hoverEdge.edge.chain.note && showNote(hoverEdge.edge.chain.note) ? (
                  <p className="mt-1 font-mono text-[10.5px] text-[#f5c400]">{hoverEdge.edge.chain.note}</p>
                ) : null}
              </div>
            )}

            <ZoomControls k={transform.k} onZoom={view.zoom} onFit={fit} labels={{ zoomIn: "Zoom in", zoomOut: "Zoom out", fit: "Fit to view" }} />

            {/* Kept clear of the zoom controls at the bottom right: a long legend wraps instead of covering them. */}
            <GraphLegend className="max-w-[calc(100%-4.75rem)]">
              {tones.map((tone) => (
                <span key={tone} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-[3px] rounded" style={{ background: TONE_COLORS[tone] }} />
                  {TONE_LEGEND[tone]}
                </span>
              ))}
              <span className="h-3 w-px bg-[#2a313c]" />
              <span className="flex items-center gap-1.5"><InputPill />first changed field in both runs</span>
              <span className="flex items-center gap-1.5"><Flag className="h-3 w-3" style={{ color: RESULT_COLOR }} />analysed field</span>
              {hasUncovered ? <EdgeSample label="not covered by a release note" dashed="6 4" color="#b4536a" /> : null}
            </GraphLegend>
          </div>
        </div>
      </div>

      <div data-rootcause-graph-details className="mt-3 rounded-lg border border-[#1f252e] bg-[#0d1218] px-4 py-3.5">
        {selectedNode ? (
          <FieldDetails
            node={selectedNode}
            row={row}
            value={values[selectedNode.id]}
            isInput={inputs.has(selectedNode.id)}
            dataset={dataset}
            showNote={showNote}
            to={layout.links.filter((link) => link.from === selectedNode.id).map((link) => link.to)}
            values={values}
            onClose={() => setSelected(null)}
          />
        ) : (
          <div className="space-y-2">
            {shown.map((chain, index) => <ChainSentence key={`${chain.origin}-${index}`} chain={chain} value={values[chain.origin]} dataset={dataset} showNote={showNote} />)}
            <p className="flex items-center gap-1.5 pt-0.5 text-[11.5px] text-[#687386]">
              <MousePointerClick className="h-3.5 w-3.5 shrink-0 text-[#f5c400]" />
              Click a field in the graph for its values and how the compare run calculates it.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** A field of the graph: its name, its part in the change (with the release note of a change that starts here) and
 *  both values; a field whose value did not change has a dashed border. */
function FieldCard({ node, value, output, isInput, note, state, selected, dragging, handlers, onClick, onKeyDown, onHover }: {
  node: LineageNode;
  value?: FieldValue;
  output: string;
  isInput: boolean;
  note: { text: string; covered: boolean } | null;
  state: State;
  selected: boolean;
  dragging: boolean;
  handlers: ReturnType<ReturnType<typeof useNodeDrag>["handlers"]>;
  onClick: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onHover: (hovered: boolean) => void;
}) {
  const color = TONE_COLORS[node.tone];
  const unchanged = value ? !value.changed : node.tone === "source";
  return (
    <div
      data-node
      data-field={node.id}
      data-tone={node.tone}
      role="button"
      tabIndex={0}
      aria-roledescription="movable field"
      aria-pressed={selected}
      {...handlers}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      className={cn(
        "absolute flex flex-col overflow-hidden rounded-lg border bg-[#0f141b] outline-none transition-[opacity,box-shadow,border-color] duration-200 focus-visible:ring-2 focus-visible:ring-[#f5c400]/60",
        dragging ? "cursor-grabbing shadow-[0_18px_44px_rgba(0,0,0,0.6)]" : "cursor-grab",
        unchanged && "border-dashed",
        state === "dim" ? "opacity-30" : "opacity-100",
        selected
          ? "border-[#f5c400] shadow-[0_0_0_3px_rgba(245,196,0,0.18),0_10px_30px_rgba(0,0,0,0.45)]"
          : state === "up"
            ? "border-[#f5c400]/50"
            : state === "down"
              ? "border-sky-400/50"
              : isInput
                ? "border-[#f5c400]/45 hover:border-[#f5c400]/75"
                : node.tone === "uncovered"
                  ? "border-rose-400/45 hover:border-rose-400/75"
                  : "border-[#2a313c] hover:border-[#4a5464]",
      )}
      style={{ left: node.x, top: node.y, width: LINEAGE_NODE.width, height: LINEAGE_NODE.height, zIndex: dragging ? 5 : undefined }}
    >
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: color }} />
      <div className="flex items-start gap-2 px-3 pt-2.5">
        <span className="line-clamp-2 min-w-0 flex-1 text-[12.5px] font-semibold leading-snug text-white [overflow-wrap:anywhere]" title={node.id}>{node.id}</span>
        {isInput ? <InputPill /> : null}
        {node.id === output ? <Flag className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: RESULT_COLOR }} aria-label="analysed field" /> : null}
      </div>
      <p className="mt-0.5 flex min-w-0 items-baseline gap-2 px-3 text-[10px]">
        <span data-role className="shrink-0 font-semibold uppercase tracking-wide" style={{ color }}>{roleOf(node, output)}</span>
        {note ? <span className={cn("min-w-0 truncate", note.covered ? "font-mono text-[#c9a400]" : "text-rose-300")}>{note.text}</span> : null}
      </p>
      <div data-values className="mt-auto flex min-w-0 items-baseline gap-2 px-3 pb-2.5 font-mono text-[11px]">
        <ValueLine value={value} />
      </div>
    </div>
  );
}

function ValueLine({ value }: { value?: FieldValue }) {
  if (!value) return null;
  // Computed by the code, but kept in neither run's results.
  if (!value.in_a && !value.in_b) return <span className="min-w-0 truncate text-[#8c96a8] [font-family:Inter,sans-serif]">intermediate field · not stored</span>;
  if (value.changed && value.in_a && value.in_b) {
    const difference = numericDifference(value.a, value.b);
    return (
      <>
        <span className="min-w-0 truncate text-[#8c96a8]">
          {formatValue(value.a)} <span aria-hidden="true">→</span> <span className="text-white">{formatValue(value.b)}</span>
        </span>
        {difference ? <span className={cn("ml-auto shrink-0 tabular-nums", differenceClass(difference))}>{formatSigned(difference)}</span> : null}
      </>
    );
  }
  if (value.changed && !value.in_a) {
    return <span className="min-w-0 truncate text-[#8c96a8]">new · <span className="text-white">{formatValue(value.b)}</span></span>;
  }
  return (
    <span className="min-w-0 truncate text-[#8c96a8]">
      {formatValue(value.in_b ? value.b : value.a)} <span className="text-[#5d6878]">· unchanged</span>
    </span>
  );
}

/** One change behind the deviation in a sentence: a new formula (what the compare run reads instead of what the base
 *  run read) or changed input data, with the release note that covers it. */
export function ChainSentence({ chain, value, dataset, showNote }: { chain: Chain; value?: FieldValue; dataset: string; showNote: (label: string) => boolean }) {
  const rule = chain.rule;
  const note = chain.covered && chain.note && showNote(chain.note) ? chain.note : null;
  return (
    <p className="flex items-start gap-2.5 text-[12.5px] leading-6 text-[#c9d1dc]">
      <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: chain.covered ? TONE_COLORS.origin : TONE_COLORS.uncovered }} />
      <span className="min-w-0">
        {chain.kind === "rule" && rule ? (
          <>
            New calculation of <span className="font-semibold text-white">{chain.origin}</span>
            {chain.condition ? <> for {chain.condition}</> : null}: the compare run takes it from {rule.compare.length ? rule.compare.join(" + ") : "no field"}
            {rule.base.length ? <>, the base run from {rule.base.join(" + ")}</> : <>, the base run from the input data</>}.
          </>
        ) : (
          <>
            <span className="font-semibold text-white">{chain.origin}</span> changed in the input data
            {value ? <>: {formatValue(value.a)} → {formatValue(value.b)}</> : null}
            {dataset ? <> (dataset „{dataset}“)</> : null}.
          </>
        )}
        {note ? (
          <span className="ml-1.5 inline-block align-middle"><NoteChip label={note} /></span>
        ) : !chain.covered ? (
          <span className="ml-1.5 text-rose-300">No release note covers this change.</span>
        ) : null}
      </span>
    </p>
  );
}

/** The selected field under the graph: both values, how the compare run calculates it and why it changed. */
function FieldDetails({ node, row, value, isInput, dataset, showNote, to, values, onClose }: {
  node: LineageNode;
  row: RootCauseRow;
  value?: FieldValue;
  isInput: boolean;
  dataset: string;
  showNote: (label: string) => boolean;
  /** The fields of the graph that read it. */
  to: string[];
  values: Record<string, FieldValue>;
  onClose: () => void;
}) {
  const color = TONE_COLORS[node.tone];
  const difference = value ? numericDifference(value.a, value.b) : null;
  const rule = value?.rule ?? null;
  const chain = node.chain;
  // Every changed field lies on a chain, drawn or not (the changes no release note covers can be hidden), so a field
  // the formula reads that has no changed value is the same in both runs.
  const changedFrom = rule ? rule.parents.filter((name) => values[name]?.changed) : [];
  const readBy = node.tone === "source" && to.length ? <> The new formula of {to.join(", ")} reads it{value && !value.changed ? "; its own value is the same in both runs" : ""}.</> : null;
  let how: ReactNode;
  if (chain && chain.kind === "rule" && chain.rule) {
    how = (
      <>
        <ChainSentence chain={chain} value={value} dataset={dataset} showNote={showNote} />
        <div className="grid gap-2.5 lg:grid-cols-2">
          <Code label="Compare run" line={rule?.line} code={rule?.code || chain.rule.compare_code} />
          <Code label="Base run" code={chain.rule.base_code} empty="takes it from the input data" />
        </div>
      </>
    );
  } else if (chain) {
    how = <ChainSentence chain={chain} value={value} dataset={dataset} showNote={showNote} />;
  } else if (rule) {
    how = (
      <>
        <p className="text-[12.5px] leading-6 text-[#c9d1dc]">
          The compare run calculates it from {rule.parents.length ? rule.parents.join(", ") : "constants"}
          {rule.conditions.length ? <> (the rule is chosen by {rule.conditions.join(", ")})</> : null}.
          {changedFrom.length ? (
            <> It changes because {changedFrom.join(" and ")} changed{rule.parents.length > changedFrom.length ? "; the other fields it reads are the same in both runs" : ""}.</>
          ) : null}
          {readBy}
        </p>
        <Code label="Compare run" line={rule.line} code={rule.code} />
      </>
    );
  } else {
    how = (
      <p className="text-[12.5px] leading-6 text-[#c9d1dc]">
        The value comes from the input data{dataset ? <> (dataset „{dataset}“)</> : null}.{readBy}
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="h-4 w-[3px] rounded" style={{ background: color }} />
        <span className="text-[14px] font-semibold text-white">{node.id}</span>
        {isInput ? <InputPill /> : null}
        {node.id === row.output ? <Flag className="h-3.5 w-3.5" style={{ color: RESULT_COLOR }} aria-label="analysed field" /> : null}
        <span className="text-[10.5px] font-semibold uppercase tracking-wide" style={{ color }}>{roleOf(node, row.output)}</span>
        <button type="button" onClick={onClose} className="ml-auto text-[11.5px] text-[#8c96a8] transition-colors hover:text-white">
          Back to all changes
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <MiniValue label="Base (A)" value={value ? (value.in_a ? formatValue(value.a) : "not in the base run") : "–"} />
        <MiniValue label="Compare (B)" value={value ? (value.in_b ? formatValue(value.b) : "not in the compare run") : "–"} />
        <MiniValue
          label="Difference (B − A)"
          value={difference !== null ? (difference === 0 ? "0" : formatSigned(difference)) : value?.changed ? "changed" : "unchanged"}
          className={difference !== null ? differenceClass(difference) : undefined}
        />
      </div>
      {value && !value.in_a && !value.in_b ? (
        <p className="text-[12px] text-[#8c96a8]">An intermediate field: both runs compute it, but neither keeps it in its results.</p>
      ) : null}
      <div className="space-y-2.5">{how}</div>
    </div>
  );
}

function MiniValue({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-md border border-[#1f252e] bg-[#0f141b] px-3 py-2">
      <p className="text-[10.5px] text-[#8c96a8]">{label}</p>
      <p className={cn("mt-0.5 truncate font-mono text-[13px] text-white", className)} title={value}>{value}</p>
    </div>
  );
}

function Code({ label, code, line, empty }: { label: string; code?: string; line?: number | null; empty?: string }) {
  if (!code && !empty) return null;
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-[#687386]">
        {label}
        {line ? <span className="ml-1.5 font-mono normal-case tracking-normal text-[#5d6878]">line {line}</span> : null}
      </p>
      {code ? (
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border border-[#1f252e] bg-[#080b10] px-3 py-2 font-mono text-[11.5px] leading-5 text-[#d6deeb]">{code}</pre>
      ) : (
        <p className="text-[12px] text-[#8c96a8]">{empty}</p>
      )}
    </div>
  );
}
