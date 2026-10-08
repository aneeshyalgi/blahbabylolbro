import type { Model } from "./model";
import type { Relation } from "./types";

export const SIZES = {
  term: { width: 214, height: 72 },
  rule: { width: 156, height: 46 },
  provision: { width: 206, height: 60 },
} as const;
const LAYER_GAP = 84;
/** With rules shown, a rule sits in the gap right before the term it derives (close to it: the edges into the rule
 *  need the room on its left). */
const RULE_GAP = 244;
const RULE_OFFSET = 34;
const ROW_GAP = 20;
const PADDING = 40;
const PROVISION_GAP = 84;

export type NodeKind = keyof typeof SIZES;

export interface GraphNode {
  id: string;
  kind: NodeKind;
  /** column (term), rule id (rule) or provision key (provision). */
  ref: string;
  layer: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  /** value: the input is part of the result; selector: it decides which case applies; derives: rule → term; regulation: provision → rule. */
  kind: "value" | "selector" | "derives" | "regulation";
  rule: string | null;
  relation?: Relation;
  path: string;
  mid: { x: number; y: number };
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  hidden: number;
}

export interface LayoutOptions {
  showRules: boolean;
  showRegulation: boolean;
  showSelectors: boolean;
}

export const termId = (column: string) => `term:${column}`;
export const ruleId = (rule: string) => `rule:${rule}`;
export const provisionId = (key: string) => `provision:${key}`;

const node = (kind: NodeKind, ref: string, id: string): GraphNode => ({ id, kind, ref, layer: 0, x: 0, y: 0, ...SIZES[kind] });

/** Layered left-to-right layout of the terms: source data elements left, reported figures right. A rule sits right
 *  before the term it derives; the provisions form a band above the rules they govern. */
export function layoutGraph(model: Model, options: LayoutOptions): GraphLayout {
  const terms: GraphNode[] = model.result.terms.map((term) => node("term", term.column, termId(term.column)));
  // Dependencies between terms decide the layers; with rules shown each one is drawn through its rule.
  const edges: Omit<GraphEdge, "path" | "mid">[] = [];
  for (const rule of model.result.rules) {
    const target = termId(rule.column);
    const inputs = rule.inputs.filter((name) => model.termBy.has(name));
    const selectors = options.showSelectors ? rule.selectors.filter((name) => model.termBy.has(name) && !inputs.includes(name)) : [];
    for (const name of inputs) edges.push({ id: `${termId(name)}→${target}`, from: termId(name), to: target, kind: "value", rule: rule.id });
    for (const name of selectors) edges.push({ id: `${termId(name)}→${target}`, from: termId(name), to: target, kind: "selector", rule: rule.id });
  }
  // Terms that only select cases disappear with the selector edges.
  const connected = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
  let hidden = 0;
  const visible = terms.filter((item) => {
    if (connected.has(item.id) || model.figures.includes(item.ref) || model.ruleOfColumn.has(item.ref)) return true;
    hidden += 1;
    return false;
  });

  // Layers: longest path from the sources.
  const layerOf = new Map(visible.map((item) => [item.id, 0]));
  for (let pass = 0; pass < visible.length + 1; pass += 1) {
    let changed = false;
    for (const edge of edges) {
      const wanted = (layerOf.get(edge.from) ?? 0) + 1;
      if (layerOf.has(edge.to) && (layerOf.get(edge.to) ?? 0) < wanted) {
        layerOf.set(edge.to, wanted);
        changed = true;
      }
    }
    if (!changed) break;
  }
  // Source data elements sit right before their first use, not all on the far left.
  for (const item of visible) {
    if (edges.some((edge) => edge.to === item.id)) continue;
    const uses = edges.filter((edge) => edge.from === item.id).map((edge) => layerOf.get(edge.to) ?? 1);
    if (uses.length) layerOf.set(item.id, Math.max(0, Math.min(...uses) - 1));
  }
  const used = [...new Set(layerOf.values())].sort((a, b) => a - b);
  const compact = new Map(used.map((layer, index) => [layer, index]));
  for (const item of visible) item.layer = compact.get(layerOf.get(item.id) ?? 0) ?? 0;

  const layers: GraphNode[][] = [];
  for (const item of visible) (layers[item.layer] ??= []).push(item);
  const termOrder = new Map(model.result.terms.map((term, index) => [termId(term.column), index]));
  for (const layer of layers) layer?.sort((a, b) => (termOrder.get(a.id) ?? 999) - (termOrder.get(b.id) ?? 999) || a.id.localeCompare(b.id));

  const predecessors = new Map<string, string[]>();
  const successors = new Map<string, string[]>();
  for (const edge of edges) {
    (predecessors.get(edge.to) ?? predecessors.set(edge.to, []).get(edge.to)!).push(edge.from);
    (successors.get(edge.from) ?? successors.set(edge.from, []).get(edge.from)!).push(edge.to);
  }
  const position = new Map<string, number>();
  const index = () => layers.forEach((layer) => layer?.forEach((item, at) => position.set(item.id, at)));
  index();
  const barycenter = (item: GraphNode, neighbours: Map<string, string[]>) => {
    const values = (neighbours.get(item.id) ?? []).map((id) => position.get(id)).filter((value): value is number => value !== undefined);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;
  };
  for (let sweep = 0; sweep < 10; sweep += 1) {
    const downward = sweep % 2 === 0;
    const sequence = downward ? layers.map((_, at) => at).slice(1) : layers.map((_, at) => at).reverse().slice(1);
    for (const at of sequence) {
      const layer = layers[at];
      if (!layer) continue;
      const keyed = layer.map((item, current) => ({ item, key: barycenter(item, downward ? predecessors : successors) ?? current }));
      keyed.sort((a, b) => a.key - b.key);
      layers[at] = keyed.map((entry) => entry.item);
      index();
    }
  }

  const heights = layers.map((layer) => (layer ?? []).reduce((sum, item) => sum + item.height, 0) + Math.max(0, (layer?.length ?? 1) - 1) * ROW_GAP);
  const tallest = Math.max(1, ...heights);
  let x = PADDING;
  layers.forEach((layer, at) => {
    if (!layer) return;
    const width = Math.max(...layer.map((item) => item.width));
    let y = PADDING + (tallest - heights[at]) / 2;
    for (const item of layer) {
      item.x = x + (width - item.width) / 2;
      item.y = y;
      y += item.height + ROW_GAP;
    }
    x += width + (options.showRules ? RULE_GAP : LAYER_GAP);
  });

  // Rules: in the gap before their term, level with it; the data then runs input → rule → term.
  let dataEdges = edges;
  if (options.showRules) {
    const rules: GraphNode[] = [];
    for (const rule of model.result.rules) {
      const target = visible.find((item) => item.id === termId(rule.column));
      if (!target) continue;
      const item = node("rule", rule.id, ruleId(rule.id));
      item.layer = target.layer;
      item.x = target.x - RULE_OFFSET - item.width;
      item.y = target.y + (target.height - item.height) / 2;
      rules.push(item);
    }
    dataEdges = [];
    for (const rule of rules) {
      const target = termId(model.ruleBy.get(rule.ref)!.column);
      for (const edge of edges.filter((entry) => entry.rule === rule.ref)) {
        dataEdges.push({ ...edge, id: `${edge.from}→${rule.id}`, to: rule.id });
      }
      dataEdges.push({ id: `${rule.id}→${target}`, from: rule.id, to: target, kind: "derives", rule: rule.ref });
    }
    visible.push(...rules);
  }

  // Provisions: a band above the graph, each over the rules (or terms) it governs.
  const allEdges = [...dataEdges];
  if (options.showRegulation) {
    const top = Math.min(...visible.map((item) => item.y));
    const placed: GraphNode[] = [];
    for (const provision of model.provisions) {
      const targets = provision.rules
        .map((entry) => (options.showRules ? ruleId(entry.rule) : termId(model.ruleBy.get(entry.rule)?.column ?? "")))
        .filter((id, at, list) => list.indexOf(id) === at && visible.some((item) => item.id === id));
      if (!targets.length) continue;
      const item = node("provision", provision.key, provisionId(provision.key));
      const centres = targets.map((id) => {
        const target = visible.find((entry) => entry.id === id)!;
        return target.x + target.width / 2;
      });
      item.x = centres.reduce((sum, value) => sum + value, 0) / centres.length - item.width / 2;
      item.y = top - PROVISION_GAP - item.height;
      item.layer = -1;
      placed.push(item);
      for (const target of targets) {
        const entry = provision.rules.find((rule) => (options.showRules ? ruleId(rule.rule) : termId(model.ruleBy.get(rule.rule)?.column ?? "")) === target);
        allEdges.push({ id: `${item.id}→${target}`, from: item.id, to: target, kind: "regulation", rule: entry?.rule ?? null, relation: entry?.relation });
      }
    }
    placed.sort((a, b) => a.x - b.x);
    for (let at = 1; at < placed.length; at += 1) {
      const previous = placed[at - 1];
      if (placed[at].x < previous.x + previous.width + 18) placed[at].x = previous.x + previous.width + 18;
    }
    // Two rows when the band gets crowded: every second provision moves up.
    const span = placed.length ? placed[placed.length - 1].x + placed[placed.length - 1].width - placed[0].x : 0;
    const graphWidth = Math.max(...visible.map((item) => item.x + item.width)) - Math.min(...visible.map((item) => item.x));
    if (span > graphWidth * 1.15 && placed.length > 3) {
      placed.forEach((item, at) => {
        if (at % 2 === 1) item.y -= item.height + 26;
      });
      for (let pass = 0; pass < 2; pass += 1) {
        const rows = [placed.filter((_, at) => at % 2 === 0), placed.filter((_, at) => at % 2 === 1)];
        for (const row of rows) {
          for (const item of row) {
            const targets = allEdges.filter((edge) => edge.from === item.id).map((edge) => visible.find((entry) => entry.id === edge.to)!).filter(Boolean);
            if (targets.length) item.x = targets.reduce((sum, target) => sum + target.x + target.width / 2, 0) / targets.length - item.width / 2;
          }
          row.sort((a, b) => a.x - b.x);
          for (let at = 1; at < row.length; at += 1) {
            if (row[at].x < row[at - 1].x + row[at - 1].width + 18) row[at].x = row[at - 1].x + row[at - 1].width + 18;
          }
        }
      }
    }
    visible.push(...placed);
  }
  const base: GraphEdge[] = allEdges.map((edge) => ({ ...edge, path: "", mid: { x: 0, y: 0 } }));
  return { nodes: visible, edges: routeEdges(visible, base), hidden };
}

/** Edge curves for the current node positions (automatic or moved by the user). Data edges run left to right with
 *  their ends spread over the node's side; regulation edges run from a provision down to the rule it governs. */
export function routeEdges(nodes: GraphNode[], edges: GraphEdge[]): GraphEdge[] {
  const byId = new Map(nodes.map((item) => [item.id, item]));
  const outgoing = new Map<string, GraphEdge[]>();
  const incoming = new Map<string, GraphEdge[]>();
  for (const edge of edges) {
    if (edge.kind === "regulation") continue;
    (outgoing.get(edge.from) ?? outgoing.set(edge.from, []).get(edge.from)!).push(edge);
    (incoming.get(edge.to) ?? incoming.set(edge.to, []).get(edge.to)!).push(edge);
  }
  const port = (owner: GraphNode, list: GraphEdge[] | undefined, edge: GraphEdge, other: (item: GraphEdge) => string) => {
    if (!list || list.length <= 1) return owner.height / 2;
    const sorted = [...list].sort((a, b) => (byId.get(other(a))?.y ?? 0) - (byId.get(other(b))?.y ?? 0));
    const at = sorted.indexOf(edge);
    const span = owner.height * 0.56;
    return owner.height * 0.22 + (span * at) / (sorted.length - 1);
  };
  const regulationTargets = new Map<string, GraphEdge[]>();
  for (const edge of edges) {
    if (edge.kind === "regulation") (regulationTargets.get(edge.to) ?? regulationTargets.set(edge.to, []).get(edge.to)!).push(edge);
  }
  return edges.flatMap((edge) => {
    const source = byId.get(edge.from);
    const target = byId.get(edge.to);
    if (!source || !target) return [];
    let path: string;
    let mid: { x: number; y: number };
    if (edge.kind === "regulation") {
      const siblings = (regulationTargets.get(edge.to) ?? []).sort((a, b) => (byId.get(a.from)?.x ?? 0) - (byId.get(b.from)?.x ?? 0));
      const offset = siblings.length > 1 ? ((siblings.indexOf(edge) / (siblings.length - 1)) - 0.5) * target.width * 0.5 : 0;
      const sx = source.x + source.width / 2;
      const tx = target.x + target.width / 2 + offset;
      const below = target.y >= source.y + source.height;
      const sy = below ? source.y + source.height : source.y;
      const ty = below ? target.y - 2 : target.y + target.height + 2;
      const bend = Math.max(36, Math.abs(ty - sy) * 0.5) * (below ? 1 : -1);
      path = `M ${sx} ${sy} C ${sx} ${sy + bend}, ${tx} ${ty - bend}, ${tx} ${ty}`;
      mid = { x: (sx + tx) / 2, y: (sy + ty) / 2 };
      return [{ ...edge, path, mid }];
    }
    const sy = source.y + port(source, outgoing.get(edge.from), edge, (item) => item.to);
    const ty = target.y + port(target, incoming.get(edge.to), edge, (item) => item.from);
    const sx = source.x + source.width;
    const tx = target.x;
    if (tx > sx) {
      const bend = Math.max(44, (tx - sx) * 0.5);
      path = `M ${sx} ${sy} C ${sx + bend} ${sy}, ${tx - bend} ${ty}, ${tx - 2} ${ty}`;
      mid = { x: (sx + tx) / 2, y: (sy + ty) / 2 };
    } else {
      const below = Math.max(source.y + source.height, target.y + target.height) + 36;
      path = `M ${sx} ${sy} C ${sx + 90} ${sy}, ${sx + 90} ${below}, ${(sx + tx) / 2} ${below} S ${tx - 90} ${ty}, ${tx - 2} ${ty}`;
      mid = { x: (sx + tx) / 2, y: below };
    }
    return [{ ...edge, path, mid }];
  });
}

/** Bounding box of the nodes with room for curves. */
export function graphBounds(nodes: GraphNode[]): { x: number; y: number; width: number; height: number } {
  if (!nodes.length) return { x: 0, y: 0, width: PADDING * 2, height: PADDING * 2 };
  const left = Math.min(...nodes.map((item) => item.x)) - PADDING;
  const top = Math.min(...nodes.map((item) => item.y)) - PADDING;
  const right = Math.max(...nodes.map((item) => item.x + item.width)) + PADDING;
  const bottom = Math.max(...nodes.map((item) => item.y + item.height)) + PADDING + 48;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Upstream and downstream closure of a node over the visible edges (regulation edges lead into the rules). */
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
