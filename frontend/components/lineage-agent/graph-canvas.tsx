"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Download, Maximize2, Minimize2, Minus, Plus, RotateCcw, ScanSearch, Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The interactive canvas shared by the lineage graphs (technical and content lineage): pan by dragging the background,
 * zoom with the wheel or the buttons, fit, full screen, nodes that can be moved (kept per analysis in this browser),
 * and the toolbar, zoom and legend pieces, so both graphs look and behave the same.
 */

/** Pan and zoom: a graph point p appears at p × k + (x, y). */
export type Transform = { x: number; y: number; k: number };
export type Positions = Record<string, { x: number; y: number }>;
export type Bounds = { x: number; y: number; width: number; height: number };

/** Room around the nodes for edge curves and loops (the edge layer must cover them to stay hoverable). */
export const EDGE_MARGIN = 160;

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

/** Nodes the user moved: their positions replace the automatic layout. The arrangement is saved once a move has
 *  ended (and cleared by Reset layout). */
export function useMovedNodes(storageKey: string | null) {
  const [positions, setPositions] = useState<Positions>(() => readPositions(storageKey));
  const [dragging, setDragging] = useState<string | null>(null);
  useEffect(() => {
    if (!dragging) writePositions(storageKey, positions);
  }, [dragging, positions, storageKey]);
  return { positions, setPositions, dragging, setDragging, moved: Object.keys(positions).length > 0 };
}

export type MovedNodes = ReturnType<typeof useMovedNodes>;

/**
 * The view of a canvas: fit (on layout changes, resizes and full screen — never while nodes are moved), zoom around
 * the cursor or the centre, focus on a box, and panning by dragging the background; a click on the background that
 * did not pan calls `onBackgroundClick`.
 */
export function useCanvasView(bounds: Bounds, layout: unknown, onBackgroundClick: () => void) {
  const viewport = useRef<HTMLDivElement | null>(null);
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, k: 1 });
  const [fullscreen, setFullscreen] = useState(false);
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;
  const backgroundClick = useRef(onBackgroundClick);
  backgroundClick.current = onBackgroundClick;
  const pan = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);

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

  const zoom = useCallback((factor: number) => {
    const element = viewport.current;
    if (!element) return;
    const { width, height } = element.getBoundingClientRect();
    setTransform((current) => {
      const k = Math.min(2.5, Math.max(0.15, current.k * factor));
      return { k, x: width / 2 - ((width / 2 - current.x) * k) / current.k, y: height / 2 - ((height / 2 - current.y) * k) / current.k };
    });
  }, []);

  /** Centres a box of the graph (a node), zooming in to at least 80 %. */
  const focus = useCallback((x: number, y: number, width: number, height: number) => {
    const element = viewport.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    setTransform((current) => {
      const k = Math.max(current.k, 0.8);
      return { k, x: rect.width / 2 - (x + width / 2) * k, y: rect.height / 2 - (y + height / 2) * k };
    });
  }, []);

  const panHandlers = {
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
      if ((event.target as HTMLElement).closest("[data-node]")) return;
      pan.current = { x: event.clientX, y: event.clientY, tx: transform.x, ty: transform.y, moved: false };
      (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => {
      const current = pan.current;
      if (!current) return;
      const dx = event.clientX - current.x;
      const dy = event.clientY - current.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) current.moved = true;
      setTransform((value) => ({ ...value, x: current.tx + dx, y: current.ty + dy }));
    },
    onPointerUp: () => {
      const current = pan.current;
      pan.current = null;
      if (current && !current.moved) backgroundClick.current();
    },
  };

  return { viewport, transform, fit, zoom, focus, fullscreen, setFullscreen, panHandlers };
}

/**
 * Moving nodes: a press that travels more than a few pixels drags the node, a press that stays put is a click (the
 * click that ends a drag does not select: ask `takeClick`). Arrow keys nudge a focused node.
 */
export function useNodeDrag(k: number, moved: MovedNodes, onDragStart?: () => void) {
  const drag = useRef<{ id: string; pointerX: number; pointerY: number; x: number; y: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const { setPositions, setDragging } = moved;

  const end = () => {
    const current = drag.current;
    drag.current = null;
    if (!current?.moved) return;
    suppressClick.current = true;
    setDragging(null);
  };

  const handlers = (node: { id: string; x: number; y: number }) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      suppressClick.current = false;
      drag.current = { id: node.id, pointerX: event.clientX, pointerY: event.clientY, x: node.x, y: node.y, moved: false };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      const current = drag.current;
      if (!current) return;
      const travelled = Math.abs(event.clientX - current.pointerX) + Math.abs(event.clientY - current.pointerY);
      if (!current.moved && travelled < 4) return;
      if (!current.moved) {
        current.moved = true;
        setDragging(current.id);
        onDragStart?.();
      }
      const x = Math.round(current.x + (event.clientX - current.pointerX) / k);
      const y = Math.round(current.y + (event.clientY - current.pointerY) / k);
      setPositions((value) => ({ ...value, [current.id]: { x, y } }));
    },
    onPointerUp: end,
    onPointerCancel: end,
  });

  /** False for the click that ends a drag (it must not select). */
  const takeClick = () => {
    if (!suppressClick.current) return true;
    suppressClick.current = false;
    return false;
  };

  /** Arrow keys move a focused node by 10 px (40 px with Shift). */
  const nudge = (event: { key: string; shiftKey: boolean; preventDefault: () => void }, node: { id: string; x: number; y: number }) => {
    const step = event.shiftKey ? 40 : 10;
    const delta = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, [number, number]>)[event.key];
    if (!delta) return;
    event.preventDefault();
    setPositions((value) => ({ ...value, [node.id]: { x: node.x + delta[0], y: node.y + delta[1] } }));
  };

  return { handlers, takeClick, nudge };
}

/** The frame of a graph: inline with its own height, or full screen. */
export function graphFrame(fullscreen: boolean, height = "h-[560px]") {
  return cn(
    "flex overflow-hidden rounded-lg border border-[#252a33] bg-[#090c11]",
    fullscreen ? "fixed inset-3 z-50 shadow-[0_30px_120px_rgba(0,0,0,0.75)]" : `relative ${height}`,
  );
}

export const TOOLBAR = "flex flex-wrap items-center gap-2 border-b border-[#1f252e] bg-[#0b0f15] px-3 py-2";
export const CANVAS = "relative flex-1 cursor-grab touch-none select-none overflow-hidden active:cursor-grabbing";

/** The dotted background that pans and zooms with the graph. */
export function canvasBackground(transform: Transform): CSSProperties {
  return {
    backgroundImage: "radial-gradient(circle, rgba(148,163,184,0.10) 1px, transparent 1px)",
    backgroundSize: `${22 * transform.k}px ${22 * transform.k}px`,
    backgroundPosition: `${transform.x}px ${transform.y}px`,
  };
}

/** The layer that carries the graph (edges and nodes), positioned by the transform. */
export function layerStyle(transform: Transform): CSSProperties {
  return { transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})` };
}

/** The SVG that holds the edges: it covers the nodes and the room around them for curves and loops. */
export function edgeLayer(bounds: Bounds) {
  return {
    width: bounds.width + 2 * EDGE_MARGIN,
    height: bounds.height + 2 * EDGE_MARGIN,
    viewBox: `${bounds.x - EDGE_MARGIN} ${bounds.y - EDGE_MARGIN} ${bounds.width + 2 * EDGE_MARGIN} ${bounds.height + 2 * EDGE_MARGIN}`,
    className: "absolute overflow-visible",
    style: { left: bounds.x - EDGE_MARGIN, top: bounds.y - EDGE_MARGIN },
  };
}

export function GraphSearch({ value, onChange, onEnter, placeholder }: { value: string; onChange: (value: string) => void; onEnter: () => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#5d6878]" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onEnter();
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-8 w-48 rounded-md border border-[#252a33] bg-[#0f141b] pl-8 pr-2 text-[12px] text-white outline-none placeholder:text-[#5d6878] focus:border-[#f5c400]/50"
      />
    </div>
  );
}

/** Reset layout, draw.io download and full screen, at the right of the toolbar. */
export function CanvasActions({ moved, onReset, onDownload, fullscreen, onFullscreen, labels }: {
  moved: boolean;
  onReset: () => void;
  onDownload: () => void;
  fullscreen: boolean;
  onFullscreen: () => void;
  labels: { resetLayout: string; drawio: string; fullscreen: string; exitFullscreen: string };
}) {
  return (
    <div className="ml-auto flex items-center gap-1">
      <IconButton label={labels.resetLayout} onClick={onReset} disabled={!moved}><RotateCcw className="h-3.5 w-3.5" /></IconButton>
      <IconButton label={labels.drawio} onClick={onDownload}><Download className="h-3.5 w-3.5" /></IconButton>
      <IconButton label={fullscreen ? labels.exitFullscreen : labels.fullscreen} onClick={onFullscreen}>
        {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
      </IconButton>
    </div>
  );
}

export function ZoomControls({ k, onZoom, onFit, labels }: { k: number; onZoom: (factor: number) => void; onFit: () => void; labels: { zoomIn: string; zoomOut: string; fit: string } }) {
  return (
    <div className="absolute bottom-3 right-3 flex flex-col items-center gap-1 rounded-md border border-[#1f252e] bg-[#0b0f15]/90 p-1 backdrop-blur" onPointerDown={(event) => event.stopPropagation()}>
      <IconButton label={labels.zoomIn} onClick={() => onZoom(1.25)}><Plus className="h-3.5 w-3.5" /></IconButton>
      <span className="py-0.5 text-center text-[10px] tabular-nums text-[#8c96a8]">{Math.round(k * 100)}%</span>
      <IconButton label={labels.zoomOut} onClick={() => onZoom(1 / 1.25)}><Minus className="h-3.5 w-3.5" /></IconButton>
      <IconButton label={labels.fit} onClick={onFit}><ScanSearch className="h-3.5 w-3.5" /></IconButton>
    </div>
  );
}

export function GraphLegend({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("pointer-events-none absolute bottom-3 left-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-md border border-[#1f252e] bg-[#0b0f15]/90 px-3 py-2 text-[10.5px] text-[#9aa4b4] backdrop-blur", className)}>
      {children}
    </div>
  );
}

export function Toggle({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
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

export function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} disabled={disabled} className="flex h-8 w-8 items-center justify-center rounded-md border border-[#252a33] text-[#aab3c2] transition-colors hover:border-[#f5c400]/40 hover:text-[#f5c400] disabled:pointer-events-none disabled:opacity-35">
      {children}
    </button>
  );
}

export function EdgeSample({ label, dashed, color = "#6b7280" }: { label: string; dashed?: string; color?: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke={color} strokeWidth="1.6" strokeDasharray={dashed} /></svg>
      {label}
    </span>
  );
}
