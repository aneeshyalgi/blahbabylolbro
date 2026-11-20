import { drawIoDocument, escapeXml } from "@/components/lineage-agent/drawio";
import { LINEAGE_NODE, type LineageEdge, type LineageNode, type Tone } from "./lineage-layout";

const TONE_STROKES: Record<Tone, string> = { source: "#64748b", origin: "#ca8a04", uncovered: "#e11d48", carries: "#0284c7" };
const TONE_TEXT: Record<Tone, string> = { source: "#475569", origin: "#a16207", uncovered: "#be123c", carries: "#0369a1" };

export interface LineageDrawIoTexts {
  title: string;
  /** The part of a field, as written on its card ("New calculation", "Passes the change on", …). */
  role: (node: LineageNode) => string;
  /** Both values of a field ("80,000 → 90,000 (+10,000)"). */
  values: (node: LineageNode) => string;
  /** The release note of a field's change, or "no release note". */
  note: (node: LineageNode) => string;
  isInput: (id: string) => boolean;
  isResult: (id: string) => boolean;
  legend: { covered: string; uncovered: string; input: string; result: string };
}

/** The RootCause lineage graph as on screen (moved fields where the user put them) as a draw.io (diagrams.net)
 *  document: each box carries its part in the change and both values, so they stay with it when it is moved. */
export function rootCauseLineageToDrawIo(nodes: LineageNode[], edges: LineageEdge[], texts: LineageDrawIoTexts): string {
  const cells: string[] = [];
  const ids = new Map<string, string>();
  let next = 2;
  // Labels are HTML (html=1) inside an XML attribute: plain text is escaped for both.
  const text = (value: string, color: string, x: number, y: number, width: number) =>
    `<mxCell id="${next++}" value="${escapeXml(escapeXml(value))}" style="text;html=1;fontSize=10;fontColor=${color};align=left;verticalAlign=middle;spacingLeft=4;" vertex="1" connectable="0" parent="1"><mxGeometry x="${Math.round(x)}" y="${Math.round(y)}" width="${Math.round(width)}" height="20" as="geometry"/></mxCell>`;

  for (const node of nodes) {
    const id = String(next++);
    ids.set(node.id, id);
    const unchanged = node.tone === "source";
    const style = `rounded=1;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=${TONE_STROKES[node.tone]};strokeWidth=2;${unchanged ? "dashed=1;" : ""}fontColor=#111827;align=left;spacingLeft=10;`;
    const marks = [texts.isInput(node.id) ? ` <span style="font-size:9px;font-weight:bold;color:#a16207">[INPUT]</span>` : "", texts.isResult(node.id) ? " ⚑" : ""].join("");
    const note = texts.note(node);
    const role = `<span style="font-size:9px;font-weight:bold;letter-spacing:0.5px;color:${TONE_TEXT[node.tone]}">${escapeXml(texts.role(node).toUpperCase())}</span>${note ? `&nbsp; <span style="font-size:9px;color:${TONE_TEXT[node.tone]}">${escapeXml(note)}</span>` : ""}`;
    const label = `<b>${escapeXml(node.id)}</b>${marks}<br/>${role}<br/><span style="font-size:10px;color:#4b5563">${escapeXml(texts.values(node))}</span>`;
    cells.push(
      `<mxCell id="${id}" value="${escapeXml(label)}" style="${style}" vertex="1" parent="1"><mxGeometry x="${Math.round(node.x)}" y="${Math.round(node.y)}" width="${LINEAGE_NODE.width}" height="${LINEAGE_NODE.height}" as="geometry"/></mxCell>`,
    );
  }
  for (const edge of edges) {
    const source = ids.get(edge.from);
    const target = ids.get(edge.to);
    if (!source || !target) continue;
    const style = edge.covered ? "strokeColor=#4b5563;strokeWidth=1.5;" : "dashed=1;dashPattern=6 4;strokeColor=#e11d48;strokeWidth=1.5;";
    cells.push(
      `<mxCell id="${next++}" value="" style="endArrow=block;endFill=1;html=1;curved=1;${style}" edge="1" parent="1" source="${source}" target="${target}"><mxGeometry relative="1" as="geometry"/></mxCell>`,
    );
  }
  // A legend under the graph: what the lines and marks mean.
  if (nodes.length) {
    const left = Math.min(...nodes.map((node) => node.x));
    const bottom = Math.max(...nodes.map((node) => node.y + LINEAGE_NODE.height)) + 28;
    const entries: [string, string][] = [
      [`—— ${texts.legend.covered}`, "#4b5563"],
      ...(edges.some((edge) => !edge.covered) ? [[`- - ${texts.legend.uncovered}`, "#e11d48"] as [string, string]] : []),
      [`[INPUT] ${texts.legend.input}`, "#a16207"],
      [`⚑ ${texts.legend.result}`, "#6d28d9"],
    ];
    entries.forEach(([label, color], index) => cells.push(text(label, color, left + index * 230, bottom, 224)));
  }
  return drawIoDocument(texts.title, "rootcause-lineage", cells);
}
