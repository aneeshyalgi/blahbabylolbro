import type { NodeSize } from "@/components/lineage-agent/graph-layout";
import type { Chain } from "./types";

/** A field card of the RootCause lineage graph, as large as a content lineage card: the field on up to two lines, its
 *  part in the change and both values. */
export const LINEAGE_NODE: NodeSize = { width: 236, height: 88 };
const LAYER_GAP = 64;
const ROW_GAP = 20;
const PADDING = 40;

/**
 * The part a field plays in a deviation:
 * - source: a field a changed formula now reads (Nominal for limits); its own value need not change;
 * - origin: where a change starts that a release note covers (a new formula, or changed input data);
 * - uncovered: where a change starts that no release note covers;
 * - carries: passes the change on to the analysed field.
 */
export type Tone = "source" | "origin" | "uncovered" | "carries";
export const TONE_COLORS: Record<Tone, string> = { source: "#64748b", origin: "#f5c400", uncovered: "#fb7185", carries: "#38bdf8" };
const TONE_RANK: Record<Tone, number> = { origin: 4, uncovered: 3, carries: 2, source: 1 };

export interface LineageNode {
  id: string;
  tone: Tone;
  /** The kind of change starting here (origins only). */
  kind: Chain["kind"] | null;
  /** The chain the field is the origin of (origins only). */
  chain: Chain | null;
  level: number;
  x: number;
  y: number;
}

export interface LineageLink {
  id: string;
  from: string;
  to: string;
  /** Part of a change a release note covers. */
  covered: boolean;
  /** From a field a changed formula reads to the field it computes (Nominal → Assessment Base). */
  calculation: boolean;
  chain: Chain;
}

export type LineageEdge = LineageLink & { path: string; mid: { x: number; y: number } };

/**
 * Left-to-right layout of the chains behind a deviation (the compare run's lineage): sources and origins on the left,
 * the analysed field on the right. A field sits right before the first field it feeds, so every chain ends in the
 * analysed field's column; within a column the fields are ordered to keep the links short (barycentre sweeps, as in
 * the content lineage graph).
 */
export function layoutLineage(chains: Chain[]): { nodes: LineageNode[]; links: LineageLink[] } {
  const tones = new Map<string, Tone>();
  const origins = new Map<string, Chain>();
  const order: string[] = [];
  const links = new Map<string, LineageLink>();
  const setTone = (field: string, tone: Tone) => {
    const current = tones.get(field);
    if (!current || TONE_RANK[tone] > TONE_RANK[current]) tones.set(field, tone);
  };
  for (const chain of chains) {
    const heads = chain.heads ?? [];
    const path = chain.fields.slice(heads.length);
    if (!path.length) continue;
    for (const field of chain.fields) if (!order.includes(field)) order.push(field);
    heads.forEach((head) => setTone(head, "source"));
    path.forEach((field, at) => setTone(field, at === 0 ? (chain.covered ? "origin" : "uncovered") : "carries"));
    if (!origins.has(path[0]) || (chain.covered && !origins.get(path[0])!.covered)) origins.set(path[0], chain);
    const add = (from: string, to: string, calculation: boolean) => {
      if (from === to) return;
      const id = `${from}>${to}`;
      const known = links.get(id);
      if (!known) links.set(id, { id, from, to, covered: chain.covered, calculation, chain });
      else if (chain.covered && !known.covered) links.set(id, { ...known, covered: true, chain });
    };
    heads.forEach((head) => add(head, path[0], true));
    for (let at = 0; at + 1 < path.length; at += 1) add(path[at], path[at + 1], false);
  }
  const all = [...links.values()];

  const predecessors = new Map<string, string[]>();
  const successors = new Map<string, string[]>();
  for (const link of all) {
    (predecessors.get(link.to) ?? predecessors.set(link.to, []).get(link.to)!).push(link.from);
    (successors.get(link.from) ?? successors.set(link.from, []).get(link.from)!).push(link.to);
  }

  // Columns: the longest way from a source, then every field moved right next to the first field it feeds.
  const level = new Map(order.map((id) => [id, 0]));
  for (let pass = 0; pass < order.length; pass += 1) {
    let changed = false;
    for (const link of all) {
      const wanted = (level.get(link.from) ?? 0) + 1;
      if ((level.get(link.to) ?? 0) < wanted && wanted <= order.length) {
        level.set(link.to, wanted);
        changed = true;
      }
    }
    if (!changed) break;
  }
  for (const id of [...order].sort((a, b) => (level.get(b) ?? 0) - (level.get(a) ?? 0))) {
    const next = successors.get(id);
    if (next?.length) level.set(id, Math.max(level.get(id) ?? 0, Math.min(...next.map((to) => (level.get(to) ?? 0) - 1))));
  }
  const used = [...new Set(level.values())].sort((a, b) => a - b);
  const column = new Map(used.map((value, index) => [value, index]));
  const layers: string[][] = used.map(() => []);
  for (const id of order) layers[column.get(level.get(id) ?? 0) ?? 0].push(id);

  const position = new Map<string, number>();
  const index = () => layers.forEach((layer) => layer.forEach((id, at) => position.set(id, at)));
  index();
  const barycenter = (id: string, neighbours: Map<string, string[]>) => {
    const items = (neighbours.get(id) ?? []).map((other) => position.get(other)).filter((value): value is number => value !== undefined);
    return items.length ? items.reduce((sum, value) => sum + value, 0) / items.length : undefined;
  };
  for (let sweep = 0; sweep < 6; sweep += 1) {
    const downward = sweep % 2 === 0;
    const sequence = downward ? layers.map((_, at) => at).slice(1) : layers.map((_, at) => at).reverse().slice(1);
    for (const at of sequence) {
      const keyed = layers[at].map((id, current) => ({ id, key: barycenter(id, downward ? predecessors : successors) ?? current }));
      keyed.sort((a, b) => a.key - b.key);
      layers[at] = keyed.map((item) => item.id);
      index();
    }
  }

  const tallest = Math.max(1, ...layers.map((layer) => layer.length));
  const columnHeight = tallest * LINEAGE_NODE.height + (tallest - 1) * ROW_GAP;
  const nodes: LineageNode[] = [];
  layers.forEach((layer, at) => {
    const height = layer.length * LINEAGE_NODE.height + (layer.length - 1) * ROW_GAP;
    const offset = (columnHeight - height) / 2;
    layer.forEach((id, row) => {
      const chain = origins.get(id) ?? null;
      const tone = tones.get(id) ?? "carries";
      nodes.push({
        id,
        tone,
        kind: chain && (tone === "origin" || tone === "uncovered") ? chain.kind : null,
        chain: tone === "origin" || tone === "uncovered" ? chain : null,
        level: at,
        x: PADDING + at * (LINEAGE_NODE.width + LAYER_GAP),
        y: PADDING + offset + row * (LINEAGE_NODE.height + ROW_GAP),
      });
    });
  });
  return { nodes, links: all };
}
