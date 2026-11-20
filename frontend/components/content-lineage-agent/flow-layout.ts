import type { NodeSize } from "@/components/lineage-agent/graph-layout";
import type { LinkKind, Model } from "./model";

/** A field card of the content lineage graph (larger than a technical node: a business name on up to two lines, its
 *  step and column, the records reached). */
export const FLOW_NODE: NodeSize = { width: 236, height: 88 };
const LAYER_GAP = 64;
const ROW_GAP = 20;
const PADDING = 40;

/** start: the followed field; next: its rule reads the followed field directly; downstream: further down. */
export type Tone = "start" | "next" | "downstream";

export interface FlowNode {
  id: string;
  level: number;
  tone: Tone;
  x: number;
  y: number;
}

export interface FlowLink {
  id: string;
  from: string;
  to: string;
  kind: LinkKind;
}

export type FlowEdge = FlowLink & { path: string; mid: { x: number; y: number } };

export interface FlowLayout {
  nodes: FlowNode[];
  links: FlowLink[];
}

/**
 * Left-to-right layout of the content lineage: the followed field, then one column per step of the calculation.
 * Within a column the fields are ordered to keep the links short (barycentre sweeps, as in the technical graph).
 * The step is written on each field card, not above the columns, so it stays with a field the user moves.
 */
export function layoutFlow(model: Model): FlowLayout {
  const steps = model.steps();
  const layers = steps.map((step) => [...step.columns]);
  const predecessors = new Map<string, string[]>();
  const successors = new Map<string, string[]>();
  for (const link of model.links) {
    (predecessors.get(link.to) ?? predecessors.set(link.to, []).get(link.to)!).push(link.from);
    (successors.get(link.from) ?? successors.set(link.from, []).get(link.from)!).push(link.to);
  }
  const position = new Map<string, number>();
  const index = () => layers.forEach((layer) => layer.forEach((column, at) => position.set(column, at)));
  index();
  const barycenter = (column: string, neighbours: Map<string, string[]>) => {
    const items = (neighbours.get(column) ?? []).map((id) => position.get(id)).filter((value): value is number => value !== undefined);
    return items.length ? items.reduce((sum, value) => sum + value, 0) / items.length : undefined;
  };
  for (let sweep = 0; sweep < 8; sweep += 1) {
    const downward = sweep % 2 === 0;
    const sequence = downward ? layers.map((_, at) => at).slice(1) : layers.map((_, at) => at).reverse().slice(1);
    for (const at of sequence) {
      const keyed = layers[at].map((column, current) => ({ column, key: barycenter(column, downward ? predecessors : successors) ?? current }));
      keyed.sort((a, b) => a.key - b.key);
      layers[at] = keyed.map((item) => item.column);
      index();
    }
  }

  const tallest = Math.max(1, ...layers.map((layer) => layer.length));
  const columnHeight = tallest * FLOW_NODE.height + (tallest - 1) * ROW_GAP;
  const nodes: FlowNode[] = [];
  layers.forEach((layer, at) => {
    const x = PADDING + at * (FLOW_NODE.width + LAYER_GAP);
    const level = steps[at].level;
    const height = layer.length * FLOW_NODE.height + (layer.length - 1) * ROW_GAP;
    const offset = (columnHeight - height) / 2;
    layer.forEach((column, row) => {
      const tone: Tone = column === model.field ? "start" : model.flowBy.get(column)?.direct ? "next" : "downstream";
      nodes.push({ id: column, level, tone, x, y: PADDING + offset + row * (FLOW_NODE.height + ROW_GAP) });
    });
  });
  const links = model.links.map((link) => ({ id: `${link.from}>${link.to}`, from: link.from, to: link.to, kind: link.kind }));
  return { nodes, links };
}
