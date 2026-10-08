import type { GraphLayout } from "./graph-layout";
import type { Model } from "./model";

const KIND_STROKES = { figure: "#ca8a04", concept: "#059669", source: "#0284c7" } as const;
const VERDICT_STROKES = { consistent: "#059669", simplified: "#d97706", deviation: "#e11d48", not_covered: "#64748b", unverified: "#94a3b8" } as const;

function escape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\n/g, "&#10;");
}

/** The on-screen content lineage graph as a draw.io (diagrams.net) document with the same arrangement. */
export function contentLineageToDrawIo(
  layout: GraphLayout,
  model: Model,
  title: string,
  words: { figure: string; concept: string; source: string; cases: (count: number) => string },
): string {
  const cells: string[] = [];
  const ids = new Map<string, string>();
  let next = 2;
  for (const node of layout.nodes) {
    const id = String(next++);
    ids.set(node.id, id);
    let style: string;
    let label: string;
    if (node.kind === "term") {
      const term = model.termBy.get(node.ref)!;
      style = `rounded=1;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=${KIND_STROKES[term.kind]};strokeWidth=${term.kind === "figure" ? 3 : 2};fontColor=#111827;align=left;spacingLeft=10;`;
      label = `<b>${escape(model.termName(node.ref))}</b><br/><span style="font-size:10px;color:#6b7280">${escape(words[term.kind])} · ${escape(node.ref)}</span>`;
    } else if (node.kind === "rule") {
      const rule = model.ruleBy.get(node.ref)!;
      style = "rounded=1;arcSize=50;whiteSpace=wrap;html=1;fillColor=#f5f3ff;strokeColor=#7c3aed;strokeWidth=1.5;fontColor=#1f2937;align=center;";
      label = `<b>${escape(node.ref)} · ${escape(model.ruleName(node.ref))}</b><br/><span style="font-size:10px;color:#6b7280">${escape(words.cases(rule.cases.length))}</span>`;
    } else {
      const provision = model.provisionBy.get(node.ref)!;
      style = `rounded=0;whiteSpace=wrap;html=1;fillColor=#fff7ed;strokeColor=${VERDICT_STROKES[provision.verdict]};strokeWidth=2;fontColor=#1f2937;align=left;spacingLeft=10;`;
      label = `<b>${escape(provision.link.regulation)} ${escape(provision.link.reference)}</b><br/><span style="font-size:10px;color:#6b7280">${escape(provision.link.title)}</span>`;
    }
    cells.push(
      `<mxCell id="${id}" value="${escape(label)}" style="${style}" vertex="1" parent="1"><mxGeometry x="${Math.round(node.x)}" y="${Math.round(node.y)}" width="${node.width}" height="${node.height}" as="geometry"/></mxCell>`,
    );
  }
  for (const edge of layout.edges) {
    const source = ids.get(edge.from);
    const target = ids.get(edge.to);
    if (!source || !target) continue;
    const style = edge.kind === "regulation"
      ? "endArrow=block;endFill=1;html=1;dashed=1;dashPattern=3 4;strokeColor=#ea580c;curved=1;"
      : edge.kind === "selector"
        ? "endArrow=block;endFill=1;html=1;dashed=1;strokeColor=#d97706;strokeWidth=1.5;curved=1;"
        : edge.kind === "derives"
          ? "endArrow=block;endFill=1;html=1;strokeColor=#7c3aed;strokeWidth=1.5;curved=1;"
          : "endArrow=block;endFill=1;html=1;strokeColor=#475569;strokeWidth=1.5;curved=1;";
    cells.push(`<mxCell id="${next++}" value="" style="${style}" edge="1" parent="1" source="${source}" target="${target}"><mxGeometry relative="1" as="geometry"/></mxCell>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" modified="${new Date().toISOString()}" version="1.0">
  <diagram name="${escape(title)}" id="content-lineage">
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
