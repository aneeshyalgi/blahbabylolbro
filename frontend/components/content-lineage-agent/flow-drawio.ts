import { drawIoDocument, escapeXml } from "@/components/lineage-agent/drawio";
import { FLOW_NODE, type FlowEdge, type FlowNode, type Tone } from "./flow-layout";
import type { LinkKind, Model } from "./model";

const TONE_STROKES: Record<Tone, string> = { start: "#ca8a04", next: "#059669", downstream: "#0284c7" };
const TONE_TEXT: Record<Tone, string> = { start: "#a16207", next: "#047857", downstream: "#0369a1" };
const LINK_STYLES: Record<LinkKind, string> = {
  value: "strokeColor=#059669;strokeWidth=1.5;",
  decides: "dashed=1;dashPattern=7 5;strokeColor=#d97706;strokeWidth=1.5;",
  impact: "dashed=1;dashPattern=2 4;strokeColor=#db2777;strokeWidth=1.5;",
};

/** The texts of the export, in the tab's language. */
export interface FlowDrawIoTexts {
  title: string;
  /** The step written on a field ("Selected field", "Next field", "Step 2", …). */
  step: (node: FlowNode) => string;
  records: (reached: number, total: number) => string;
  values: (count: number) => string;
  legend: Record<LinkKind | "end", string>;
}

/** The content lineage graph as on screen (moved fields where the user put them) as a draw.io (diagrams.net) document.
 *  Each box carries its step, as on screen, so it stays with the box when it is moved in draw.io. */
export function flowToDrawIo(model: Model, nodes: FlowNode[], edges: FlowEdge[], texts: FlowDrawIoTexts): string {
  const cells: string[] = [];
  const ids = new Map<string, string>();
  let next = 2;
  // Labels are HTML (html=1) inside an XML attribute: plain text is escaped for both.
  const text = (value: string, color: string, x: number, y: number, width: number) =>
    `<mxCell id="${next++}" value="${escapeXml(escapeXml(value))}" style="text;html=1;fontSize=10;fontColor=${color};align=left;verticalAlign=middle;spacingLeft=4;" vertex="1" connectable="0" parent="1"><mxGeometry x="${Math.round(x)}" y="${Math.round(y)}" width="${Math.round(width)}" height="20" as="geometry"/></mxCell>`;

  for (const node of nodes) {
    const id = String(next++);
    ids.set(node.id, id);
    const flow = model.flowBy.get(node.id);
    const impact = flow?.evidence === "impact";
    const values = model.result.scope.categorical ? model.result.scope.values.length : 0;
    const detail = [node.id, flow ? texts.records(flow.records.reached, flow.records.total) : values ? texts.values(values) : ""].filter(Boolean).join(" · ");
    const style = `rounded=1;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=${impact ? "#db2777" : TONE_STROKES[node.tone]};strokeWidth=2;${impact ? "dashed=1;" : ""}fontColor=#111827;align=left;spacingLeft=10;`;
    const step = `<span style="font-size:9px;font-weight:bold;letter-spacing:0.5px;color:${TONE_TEXT[node.tone]}">${escapeXml(texts.step(node).toUpperCase())}</span>`;
    const label = `<b>${escapeXml(model.termName(node.id))}</b>${flow?.end ? " ⚑" : ""}<br/>${step}&nbsp; <span style="font-size:10px;color:#6b7280">${escapeXml(detail)}</span>`;
    cells.push(
      `<mxCell id="${id}" value="${escapeXml(label)}" style="${style}" vertex="1" parent="1"><mxGeometry x="${Math.round(node.x)}" y="${Math.round(node.y)}" width="${FLOW_NODE.width}" height="${FLOW_NODE.height}" as="geometry"/></mxCell>`,
    );
  }
  for (const edge of edges) {
    const source = ids.get(edge.from);
    const target = ids.get(edge.to);
    if (!source || !target) continue;
    cells.push(
      `<mxCell id="${next++}" value="" style="endArrow=block;endFill=1;html=1;curved=1;${LINK_STYLES[edge.kind]}" edge="1" parent="1" source="${source}" target="${target}"><mxGeometry relative="1" as="geometry"/></mxCell>`,
    );
  }
  // A legend under the graph: what the arrows and the flag mean.
  if (nodes.length) {
    const left = Math.min(...nodes.map((node) => node.x));
    const bottom = Math.max(...nodes.map((node) => node.y + FLOW_NODE.height)) + 28;
    const entries: [string, string][] = [
      [`—— ${texts.legend.value}`, "#059669"],
      [`- - ${texts.legend.decides}`, "#d97706"],
      [`··· ${texts.legend.impact}`, "#db2777"],
      [`⚑ ${texts.legend.end}`, "#a16207"],
    ];
    entries.forEach(([label, color], index) => cells.push(text(label, color, left + index * 230, bottom, 224)));
  }
  return drawIoDocument(texts.title, "content-lineage", cells);
}
