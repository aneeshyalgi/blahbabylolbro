import { NODE_HEIGHT, NODE_WIDTH, type GraphLayout } from "./graph-layout";
import type { Role } from "./types";

const ROLE_STROKES: Record<Role, string> = {
  passthrough: "#64748b",
  cast: "#0891b2",
  enriched: "#059669",
  overwritten: "#d97706",
  created: "#7c3aed",
  renamed: "#0284c7",
  dropped: "#e11d48",
  intermediate: "#71717a",
};

function escape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\n/g, "&#10;");
}

/** The on-screen lineage graph as a draw.io (diagrams.net) document with the same layout. */
export function lineageToDrawIo(layout: GraphLayout, title: string, describe: (role: Role) => string, lookupLabel: (size: number) => string): string {
  const cells: string[] = [];
  const ids = new Map<string, string>();
  let next = 2;
  for (const node of layout.nodes) {
    const id = String(next++);
    ids.set(node.id, id);
    let style: string;
    let label: string;
    if (node.kind === "lookup") {
      style = "rounded=1;whiteSpace=wrap;html=1;dashed=1;fillColor=#f5f3ff;strokeColor=#7c3aed;strokeWidth=1.5;fontColor=#1f2937;align=left;spacingLeft=10;";
      label = `<b>${escape(node.label)}</b><br/><span style="font-size:10px;color:#6b7280">${escape(lookupLabel(node.lookup?.size ?? 0))}</span>`;
    } else {
      const role = node.column!.role;
      style = `rounded=1;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=${ROLE_STROKES[role]};strokeWidth=2;fontColor=#111827;align=left;spacingLeft=10;`;
      const operations = node.column!.operations.slice(0, 3).join(" · ");
      label = `<b>${escape(node.label)}</b><br/><span style="font-size:10px;color:#6b7280">${escape(describe(role))}${operations ? ` · ${escape(operations)}` : ""}</span>`;
    }
    cells.push(
      `<mxCell id="${id}" value="${escape(label)}" style="${style}" vertex="1" parent="1"><mxGeometry x="${Math.round(node.x)}" y="${Math.round(node.y)}" width="${NODE_WIDTH}" height="${NODE_HEIGHT}" as="geometry"/></mxCell>`,
    );
  }
  for (const edge of layout.edges) {
    const source = ids.get(edge.from);
    const target = ids.get(edge.to);
    if (!source || !target) continue;
    const style = edge.kind === "lookup"
      ? "endArrow=block;endFill=1;html=1;dashed=1;dashPattern=2 3;strokeColor=#7c3aed;curved=1;"
      : edge.direct
        ? "endArrow=block;endFill=1;html=1;strokeColor=#475569;strokeWidth=1.5;curved=1;"
        : "endArrow=block;endFill=1;html=1;dashed=1;strokeColor=#d97706;strokeWidth=1.5;curved=1;";
    const label = edge.transformations.map((item) => item.subtype).join(", ");
    cells.push(
      `<mxCell id="${next++}" value="${escape(label)}" style="${style}fontSize=9;fontColor=#6b7280;" edge="1" parent="1" source="${source}" target="${target}"><mxGeometry relative="1" as="geometry"/></mxCell>`,
    );
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" modified="${new Date().toISOString()}" version="1.0">
  <diagram name="${escape(title)}" id="technical-lineage">
    <mxGraphModel dx="1400" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        ${cells.join("\n        ")}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;
}
