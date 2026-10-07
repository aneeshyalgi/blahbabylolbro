import type { Analysis, LineageColumn, Lookup, Transformation } from "./types";

export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 62;
const LAYER_GAP = 104;
const ROW_GAP = 18;
const PADDING = 40;

export interface GraphNode {
  id: string;
  kind: "column" | "lookup";
  label: string;
  column?: LineageColumn;
  lookup?: Lookup;
  layer: number;
  x: number;
  y: number;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  kind: "column" | "lookup";
  transformations: Transformation[];
  lines: number[];
  historical: boolean;
  direct: boolean;
  indirect: boolean;
  path: string;
  /** Mid point of the curve, for labels and hover targets. */
  mid: { x: number; y: number };
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
  hidden: number;
}

export interface LayoutOptions {
  showLookups: boolean;
  showIsolated: boolean;
  showIndirect: boolean;
}

export const lookupId = (name: string) => `lookup:${name}`;

/** Layered left-to-right layout of the column lineage (sources left, derived columns right). */
export function layoutGraph(analysis: Analysis, options: LayoutOptions): GraphLayout {
  const columns = analysis.columns.filter((column) => column.in_output || column.downstream.length > 0);
  const allEdges = analysis.edges.filter((edge) => {
    if (edge.kind === "lookup") return options.showLookups;
    if (!options.showIndirect && edge.transformations.every((item) => item.type === "INDIRECT")) return false;
    return true;
  });
  const connected = new Set<string>();
  for (const edge of allEdges) {
    connected.add(edge.from);
    connected.add(edge.to);
  }
  let hidden = 0;
  const visibleColumns = columns.filter((column) => {
    const isolated = !connected.has(column.name);
    if (isolated && !options.showIsolated && column.role === "passthrough") {
      hidden += 1;
      return false;
    }
    return true;
  });
  const order = new Map<string, number>();
  [...analysis.inputs, ...analysis.outputs].forEach((name, index) => {
    if (!order.has(name)) order.set(name, index);
  });

  const nodes: GraphNode[] = visibleColumns.map((column) => ({
    id: column.name, kind: "column", label: column.name, column, layer: column.depth, x: 0, y: 0,
  }));
  const nodeIds = new Set(nodes.map((node) => node.id));
  if (options.showLookups) {
    for (const lookup of analysis.lookups) {
      const consumers = visibleColumns.filter((column) => column.lookups.includes(lookup.name));
      if (!consumers.length) continue;
      const layer = Math.max(0, Math.min(...consumers.map((column) => column.depth)) - 1);
      nodes.push({ id: lookupId(lookup.name), kind: "lookup", label: lookup.name, lookup, layer, x: 0, y: 0 });
      nodeIds.add(lookupId(lookup.name));
      order.set(lookupId(lookup.name), (order.get(consumers[0].name) ?? 0) - 0.5);
    }
  }
  const edges = allEdges.filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to) && edge.from !== edge.to);

  // Layers: columns keep their analysed depth; a node never sits left of a node it depends on (except historical reads).
  const layerOf = new Map(nodes.map((node) => [node.id, node.layer]));
  for (let pass = 0; pass < nodes.length; pass += 1) {
    let changed = false;
    for (const edge of edges) {
      if (edge.historical) continue;
      const wanted = (layerOf.get(edge.from) ?? 0) + 1;
      if ((layerOf.get(edge.to) ?? 0) < wanted && wanted <= nodes.length) {
        layerOf.set(edge.to, wanted);
        changed = true;
      }
    }
    if (!changed) break;
  }
  // Compact: remove empty layers.
  const usedLayers = [...new Set(layerOf.values())].sort((a, b) => a - b);
  const compact = new Map(usedLayers.map((layer, index) => [layer, index]));
  for (const node of nodes) node.layer = compact.get(layerOf.get(node.id) ?? 0) ?? 0;

  const layers: GraphNode[][] = [];
  for (const node of nodes) (layers[node.layer] ??= []).push(node);
  for (const layer of layers) layer?.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  const predecessors = new Map<string, string[]>();
  const successors = new Map<string, string[]>();
  for (const edge of edges) {
    (predecessors.get(edge.to) ?? predecessors.set(edge.to, []).get(edge.to)!).push(edge.from);
    (successors.get(edge.from) ?? successors.set(edge.from, []).get(edge.from)!).push(edge.to);
  }
  const position = new Map<string, number>();
  const index = () => layers.forEach((layer) => layer?.forEach((node, at) => position.set(node.id, at)));
  index();
  const barycenter = (node: GraphNode, neighbours: Map<string, string[]>) => {
    const items = (neighbours.get(node.id) ?? []).map((id) => position.get(id)).filter((value): value is number => value !== undefined);
    return items.length ? items.reduce((sum, value) => sum + value, 0) / items.length : undefined;
  };
  for (let sweep = 0; sweep < 8; sweep += 1) {
    const downward = sweep % 2 === 0;
    const sequence = downward ? layers.map((_, at) => at).slice(1) : layers.map((_, at) => at).reverse().slice(1);
    for (const at of sequence) {
      const layer = layers[at];
      if (!layer) continue;
      const keyed = layer.map((node, current) => ({ node, key: barycenter(node, downward ? predecessors : successors) ?? current }));
      keyed.sort((a, b) => a.key - b.key);
      layers[at] = keyed.map((item) => item.node);
      index();
    }
  }

  const tallest = Math.max(1, ...layers.map((layer) => layer?.length ?? 0));
  const columnHeight = tallest * NODE_HEIGHT + (tallest - 1) * ROW_GAP;
  layers.forEach((layer, at) => {
    if (!layer) return;
    const height = layer.length * NODE_HEIGHT + (layer.length - 1) * ROW_GAP;
    const offset = (columnHeight - height) / 2;
    layer.forEach((node, row) => {
      node.x = PADDING + at * (NODE_WIDTH + LAYER_GAP);
      node.y = PADDING + offset + row * (NODE_HEIGHT + ROW_GAP);
    });
  });

  const base: GraphEdge[] = edges.map((edge) => ({
    id: `${edge.from}→${edge.to}`,
    from: edge.from,
    to: edge.to,
    kind: edge.kind,
    transformations: edge.transformations,
    lines: edge.lines,
    historical: edge.historical,
    direct: edge.transformations.some((item) => item.type === "DIRECT"),
    indirect: edge.transformations.some((item) => item.type === "INDIRECT"),
    path: "",
    mid: { x: 0, y: 0 },
  }));
  const graphEdges = routeEdges(nodes, base);
  const width = PADDING * 2 + Math.max(1, layers.length) * NODE_WIDTH + Math.max(0, layers.length - 1) * LAYER_GAP;
  const height = PADDING * 2 + columnHeight + 48;
  return { nodes, edges: graphEdges, width, height, hidden };
}

/** Edge curves for the current node positions (automatic layout or nodes moved by the user): the edges entering and
 *  leaving a node are spread over its side, ordered by the height of the node at the other end. */
export function routeEdges(nodes: GraphNode[], edges: GraphEdge[]): GraphEdge[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, GraphEdge[]>();
  const incoming = new Map<string, GraphEdge[]>();
  for (const edge of edges) {
    (outgoing.get(edge.from) ?? outgoing.set(edge.from, []).get(edge.from)!).push(edge);
    (incoming.get(edge.to) ?? incoming.set(edge.to, []).get(edge.to)!).push(edge);
  }
  const port = (list: GraphEdge[] | undefined, edge: GraphEdge, other: (item: GraphEdge) => string) => {
    if (!list || list.length <= 1) return NODE_HEIGHT / 2;
    const sorted = [...list].sort((a, b) => (byId.get(other(a))?.y ?? 0) - (byId.get(other(b))?.y ?? 0));
    const at = sorted.indexOf(edge);
    const span = NODE_HEIGHT * 0.56;
    return NODE_HEIGHT * 0.22 + (span * at) / (sorted.length - 1);
  };
  return edges.flatMap((edge) => {
    const source = byId.get(edge.from);
    const target = byId.get(edge.to);
    if (!source || !target) return [];
    const sy = source.y + port(outgoing.get(edge.from), edge, (item) => item.to);
    const ty = target.y + port(incoming.get(edge.to), edge, (item) => item.from);
    const sx = source.x + NODE_WIDTH;
    const tx = target.x;
    let path: string;
    let mid: { x: number; y: number };
    if (tx > sx) {
      const bend = Math.max(48, (tx - sx) * 0.5);
      path = `M ${sx} ${sy} C ${sx + bend} ${sy}, ${tx - bend} ${ty}, ${tx - 2} ${ty}`;
      mid = { x: (sx + tx) / 2, y: (sy + ty) / 2 };
    } else {
      // The target sits left of the source (a historical read, or a node moved there): loop below both nodes.
      const below = Math.max(source.y, target.y) + NODE_HEIGHT + 36;
      path = `M ${sx} ${sy} C ${sx + 90} ${sy}, ${sx + 90} ${below}, ${(sx + tx) / 2} ${below} S ${tx - 90} ${ty}, ${tx - 2} ${ty}`;
      mid = { x: (sx + tx) / 2, y: below };
    }
    return [{ ...edge, path, mid }];
  });
}

/** Bounding box of the nodes, with room for edge curves and loops. */
export function graphBounds(nodes: GraphNode[]): { x: number; y: number; width: number; height: number } {
  if (!nodes.length) return { x: 0, y: 0, width: PADDING * 2, height: PADDING * 2 };
  const left = Math.min(...nodes.map((node) => node.x)) - PADDING;
  const top = Math.min(...nodes.map((node) => node.y)) - PADDING;
  const right = Math.max(...nodes.map((node) => node.x + NODE_WIDTH)) + PADDING;
  const bottom = Math.max(...nodes.map((node) => node.y + NODE_HEIGHT)) + PADDING + 48;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Upstream and downstream closure of a node over the visible edges. */
export function lineageOf(edges: GraphEdge[], id: string): { up: Set<string>; down: Set<string> } {
  const up = new Set<string>();
  const down = new Set<string>();
  const walk = (start: string, forward: boolean, seen: Set<string>) => {
    const stack = [start];
    while (stack.length) {
      const current = stack.pop()!;
      for (const edge of edges) {
        const next = forward ? (edge.from === current ? edge.to : null) : edge.to === current ? edge.from : null;
        if (next && !seen.has(next) && next !== id) {
          seen.add(next);
          stack.push(next);
        }
      }
    }
  };
  walk(id, false, up);
  walk(id, true, down);
  return { up, down };
}
