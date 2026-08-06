/**
 * Export a generic graph to Draw.io (diagrams.net) XML.
 * Input: nodes (id, label, optional type/color), edges (source, target, optional type/color).
 * Output: XML string. Save as .drawio and open in https://app.diagrams.net
 */

export interface DrawIoNode {
  id: string;
  label: string;
  type?: string;
  color?: string;
}

export interface DrawIoEdge {
  source: string;
  target: string;
  type?: string;
  color?: string;
}

export interface DrawIoGraph {
  nodes: DrawIoNode[];
  edges: DrawIoEdge[];
}

const DEFAULT_NODE_COLOR = "#E1D5E7";
const DEFAULT_EDGE_COLOR = "#3b82f6";
const TYPE_COLORS: Record<string, string> = {
  formula: "#8b5cf6",
  function: "#8b5cf6",
  range: "#3b82f6",
  direct: "#10b981",
  input: "#10b981",
  derived: "#3b82f6",
  aggregate: "#8b5cf6",
  lookup: "#f59e0b",
  dataset: "#3b82f6",
  transform: "#f59e0b",
  output: "#10b981",
};

function getNodeColor(node: DrawIoNode): string {
  if (node.color) return node.color;
  if (node.type && TYPE_COLORS[node.type]) return TYPE_COLORS[node.type];
  return DEFAULT_NODE_COLOR;
}

function getEdgeColor(edge: DrawIoEdge): string {
  if (edge.color) return edge.color;
  if (edge.type && TYPE_COLORS[edge.type]) return TYPE_COLORS[edge.type];
  return DEFAULT_EDGE_COLOR;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "&#10;");
}

function cellToXml(cell: {
  "@id"?: string;
  "@value"?: string;
  "@style"?: string;
  "@vertex"?: string;
  "@edge"?: string;
  "@parent"?: string;
  "@source"?: string;
  "@target"?: string;
  mxGeometry?: Record<string, string>;
}): string {
  const attrs = Object.entries(cell)
    .filter(([k]) => k.startsWith("@") && cell[k as keyof typeof cell] != null)
    .map(([k, v]) => `${k.slice(1)}="${escapeXml(String(v))}"`)
    .join(" ");

  const geom = cell.mxGeometry;
  if (geom) {
    const geomAttrs = Object.entries(geom)
      .map(([k, v]) => `${k.replace(/^@/, "")}="${escapeXml(String(v))}"`)
      .join(" ");
    return `<mxCell ${attrs}>\n  <mxGeometry ${geomAttrs}/>\n</mxCell>`;
  }
  return `<mxCell ${attrs}/>`;
}

export function exportToDrawIo(
  graph: DrawIoGraph,
  options?: {
    diagramName?: string;
    diagramId?: string;
    maxNodesPerRow?: number;
    nodeWidth?: number;
    nodeHeight?: number;
    spacingX?: number;
    spacingY?: number;
  }
): string {
  const {
    diagramName = "Graph",
    diagramId = "graph-1",
    maxNodesPerRow = 8,
    nodeWidth = 80,
    nodeHeight = 40,
    spacingX = 150,
    spacingY = 80,
  } = options ?? {};

  const cells: Array<Record<string, unknown>> = [];
  const nodeIdMap = new Map<string, string>();
  let cellId = 2;
  let x = 50;
  let y = 50;
  let nodesInRow = 0;

  for (const node of graph.nodes) {
    const mxId = String(cellId++);
    nodeIdMap.set(node.id, mxId);
    const color = getNodeColor(node);
    const label = node.label || node.id;

    cells.push({
      "@id": mxId,
      "@value": label,
      "@style": `rounded=1;whiteSpace=wrap;html=1;fillColor=${color};strokeColor=#333333;fontColor=#ffffff;`,
      "@vertex": "1",
      "@parent": "1",
      mxGeometry: {
        "@x": String(x),
        "@y": String(y),
        "@width": String(nodeWidth),
        "@height": String(nodeHeight),
        "@as": "geometry",
      },
    });

    nodesInRow++;
    x += spacingX;
    if (nodesInRow >= maxNodesPerRow) {
      x = 50;
      y += spacingY;
      nodesInRow = 0;
    }
  }

  for (const edge of graph.edges) {
    const sourceId = nodeIdMap.get(edge.source);
    const targetId = nodeIdMap.get(edge.target);
    if (!sourceId || !targetId) continue;

    const color = getEdgeColor(edge);
    cells.push({
      "@id": String(cellId++),
      "@value": "",
      "@style": `endArrow=classic;html=1;strokeColor=${color};strokeWidth=2;`,
      "@edge": "1",
      "@parent": "1",
      "@source": sourceId,
      "@target": targetId,
      mxGeometry: { "@relative": "1", "@as": "geometry" },
    });
  }

  const cellsXml = cells
    .map((c) => cellToXml(c as Parameters<typeof cellToXml>[0]))
    .join("\n        ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" modified="${new Date().toISOString()}" version="1.0">
  <diagram name="${escapeXml(diagramName)}" id="${escapeXml(diagramId)}">
    <mxGraphModel dx="1422" dy="794" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        ${cellsXml}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;
}

/** Trigger download of the Draw.io file */
export function downloadDrawIo(
  xmlContent: string,
  filename: string = "diagram.drawio"
): void {
  const blob = new Blob([xmlContent], { type: "application/xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Transform node shape: id, type ("dataset"|"transform"), label, operation */
export interface TransformNodeLike {
  id: string;
  type?: string;
  label: string;
  operation?: string;
}

/** Transform edge shape: from, to, note? */
export interface TransformEdgeLike {
  from: string;
  to: string;
  note?: string;
}

/** Convert pipeline (transform nodes + edges) to DrawIoGraph for export */
export function pipelineToDrawIoGraph(
  nodes: TransformNodeLike[],
  edges: TransformEdgeLike[]
): DrawIoGraph {
  const drawNodes: DrawIoNode[] = nodes.map((n) => {
    let type = n.type ?? "dataset";
    if (n.operation === "input") type = "input";
    else if (n.operation === "output") type = "output";
    else if (type === "transform" || n.operation !== "dataset") type = "transform";
    return { id: n.id, label: n.label, type };
  });
  const drawEdges: DrawIoEdge[] = edges.map((e) => ({
    source: e.from,
    target: e.to,
    type: e.note ?? "direct",
  }));
  return { nodes: drawNodes, edges: drawEdges };
}

/** Column/semantic lineage node: id, displayLabel */
export interface ColumnNodeLike {
  id: string;
  displayLabel: string;
  type?: string;
}

/** Column edge: from, to */
export interface ColumnEdgeLike {
  from: string;
  to: string;
}

/** Convert column/semantic lineage to DrawIoGraph */
export function columnLineageToDrawIoGraph(
  nodes: ColumnNodeLike[],
  edges: ColumnEdgeLike[]
): DrawIoGraph {
  const drawNodes: DrawIoNode[] = nodes.map((n) => ({
    id: n.id,
    label: n.displayLabel,
    type: n.type ?? "derived",
  }));
  const drawEdges: DrawIoEdge[] = edges.map((e) => ({
    source: e.from,
    target: e.to,
    type: "direct",
  }));
  return { nodes: drawNodes, edges: drawEdges };
}
