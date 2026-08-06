"use client";

import React, { useEffect, useRef, useState } from "react";

export interface ColumnLineageNode {
  id: string;
  sheet: string;
  header: string;
  displayLabel: string;
  type?: string;
  stats?: {
    formulaCount?: number;
    avgComplexity?: number;
    upstreamHeaderCount?: number;
    downstreamHeaderCount?: number;
  };
}

export interface ColumnLineageEdge {
  from: string;
  to: string;
  edgeType?: "DERIVES" | "POTENTIAL_MATCH";
  kinds: string[];
  sampleFormulas: string[];
  sourceCellCount: number;
}

export interface SemanticLineage {
  nodes: ColumnLineageNode[];
  edges: ColumnLineageEdge[];
  stats?: Record<string, unknown>;
}

export interface TransformNode {
  id: string;
  type?: "dataset" | "transform";
  label: string;
  operation: string;
  params?: Record<string, unknown>;
}

export interface TransformEdge {
  from: string;
  to: string;
  note?: string;
}

export interface PotentialLinks {
  nodes: ColumnLineageNode[];
  edges: ColumnLineageEdge[];
  stats?: Record<string, unknown>;
}

export interface LineageGraphData {
  tables: unknown[];
  nodes: unknown[];
  edges: unknown[];
  semanticLineage?: SemanticLineage;
  potentialLinks?: PotentialLinks;
  transformNodes?: TransformNode[];
  transformEdges?: TransformEdge[];
}

function generateGraphElements(
  data: LineageGraphData | null,
  viewMode?: "pipeline" | "column"
): cytoscape.ElementDefinition[] {
  const elements: cytoscape.ElementDefinition[] = [];
  const nodeIds = new Set<string>();

  const hasPipeline = (data?.transformNodes?.length ?? 0) > 0;
  const hasColumnDerivation = (data?.semanticLineage?.edges?.length ?? 0) > 0;

  // When viewMode is "column" and we have derivation edges, show column lineage (even if pipeline exists)
  if (viewMode === "column" && hasColumnDerivation && data?.semanticLineage?.nodes?.length) {
    const semanticLineage = data.semanticLineage!;
    for (const node of semanticLineage.nodes) {
      elements.push({
        group: "nodes" as const,
        data: {
          id: node.id,
          label: node.displayLabel,
          type: "column",
          columnType: node.type ?? "derived",
          sheet: node.sheet,
          formulaCount: node.stats?.formulaCount ?? 0,
          avgComplexity: node.stats?.avgComplexity ?? 0,
          upstreamCount: node.stats?.upstreamHeaderCount ?? 0,
          downstreamCount: node.stats?.downstreamHeaderCount ?? 0,
        },
      });
      nodeIds.add(node.id);
    }
    for (const edge of semanticLineage.edges ?? []) {
      if (nodeIds.has(edge.from) && nodeIds.has(edge.to)) {
        elements.push({
          group: "edges" as const,
          data: {
            id: `${edge.from}-${edge.to}`,
            source: edge.from,
            target: edge.to,
            type: "column",
            edgeType: edge.edgeType ?? "DERIVES",
            kinds: edge.kinds,
            cellCount: edge.sourceCellCount,
            sampleFormulas: edge.sampleFormulas ?? [],
          },
        });
      }
    }
    return elements;
  }

  // Pipeline view (dataset → transform → output)
  if (hasPipeline && viewMode !== "column" && data?.transformNodes && data?.transformEdges) {
    for (const node of data.transformNodes) {
      const nodeType = node.type ?? (node.operation === "dataset" || node.operation === "output" ? "dataset" : "transform");
      elements.push({
        group: "nodes" as const,
        data: {
          id: node.id,
          label: node.label,
          type: "transform",
          transformOperation: node.operation,
          nodeType,
          params: node.params ?? {},
        },
      });
      nodeIds.add(node.id);
    }
    for (const edge of data.transformEdges) {
      if (nodeIds.has(edge.from) && nodeIds.has(edge.to)) {
        elements.push({
          group: "edges" as const,
          data: {
            id: `${edge.from}-${edge.to}`,
            source: edge.from,
            target: edge.to,
            type: "transform",
            label: edge.note ?? "",
          },
        });
      }
    }
    return elements;
  }

  // Column view: derivation (DERIVES) or potential links (POTENTIAL_MATCH)
  const semanticLineage = data?.semanticLineage;
  const potentialLinks = data?.potentialLinks;
  const hasDerivationEdges = (semanticLineage?.edges?.length ?? 0) > 0;
  const hasPotentialEdges = (potentialLinks?.edges?.length ?? 0) > 0;

  const columnNodes = hasDerivationEdges
    ? semanticLineage!.nodes
    : potentialLinks?.nodes ?? semanticLineage?.nodes ?? [];
  const columnEdges = hasDerivationEdges
    ? semanticLineage!.edges!
    : potentialLinks?.edges ?? semanticLineage?.edges ?? [];
  const defaultEdgeType = hasDerivationEdges ? "DERIVES" : "POTENTIAL_MATCH";

  if (!columnNodes.length) return elements;

  for (const node of columnNodes) {
    elements.push({
      group: "nodes" as const,
      data: {
        id: node.id,
        label: node.displayLabel,
        type: "column",
        columnType: node.type ?? "derived",
        sheet: node.sheet,
        formulaCount: node.stats?.formulaCount ?? 0,
        avgComplexity: node.stats?.avgComplexity ?? 0,
        upstreamCount: node.stats?.upstreamHeaderCount ?? 0,
        downstreamCount: node.stats?.downstreamHeaderCount ?? 0,
      },
    });
    nodeIds.add(node.id);
  }

  for (const edge of columnEdges) {
    if (nodeIds.has(edge.from) && nodeIds.has(edge.to)) {
      const edgeType = edge.edgeType ?? defaultEdgeType;
      elements.push({
        group: "edges" as const,
        data: {
          id: `${edge.from}-${edge.to}`,
          source: edge.from,
          target: edge.to,
          type: "column",
          edgeType,
          kinds: edge.kinds,
          cellCount: edge.sourceCellCount,
          sampleFormulas: edge.sampleFormulas ?? [],
        },
      });
    }
  }

  return elements;
}

function nodeSizeFromLabel(label: string, minSize: number, maxSize: number, charsPerUnit: number): number {
  const len = (label || "").length;
  return Math.min(maxSize, Math.max(minSize, len * charsPerUnit));
}

function getGraphStyle(): Array<{ selector: string; style: Record<string, unknown> }> {
  return [
    {
      selector: 'node[type="column"]',
      style: {
        "background-color": (ele: cytoscape.NodeSingular) => {
          const t = ele.data("columnType") as string;
          if (t === "input") return "#10b981";
          if (t === "derived") return "#3b82f6";
          if (t === "aggregate") return "#8b5cf6";
          if (t === "lookup") return "#f59e0b";
          return "#6b7280";
        },
        label: "data(label)",
        color: "#ffffff",
        "text-valign": "center",
        "text-halign": "center",
        "font-size": "10px",
        "text-wrap": "wrap",
        "text-max-width": (ele: cytoscape.NodeSingular) => `${nodeSizeFromLabel(String(ele.data("label") || ""), 50, 160, 5) - 12}px`,
        width: (ele: cytoscape.NodeSingular) => nodeSizeFromLabel(String(ele.data("label") || ""), 50, 160, 5),
        height: (ele: cytoscape.NodeSingular) => {
          const label = String(ele.data("label") || "");
          const len = label.length;
          const lines = Math.max(1, Math.ceil(len / 12));
          return Math.min(100, Math.max(50, 24 + lines * 14));
        },
      },
    },
    {
      selector: 'node[type="transform"]',
      style: {
        "background-color": (ele: cytoscape.NodeSingular) => {
          const nodeType = ele.data("nodeType") as string;
          const op = (ele.data("transformOperation") as string) || "";
          if (nodeType === "dataset") return "#1f77b4";
          if (nodeType === "transform") return "#ff7f0e";
          return "#1f77b4";
        },
        label: "data(label)",
        color: "#ffffff",
        "text-valign": "center",
        "text-halign": "center",
        "font-size": "11px",
        "text-wrap": "wrap",
        "text-max-width": (ele: cytoscape.NodeSingular) => `${nodeSizeFromLabel(String(ele.data("label") || ""), 90, 180, 6) - 16}px`,
        width: (ele: cytoscape.NodeSingular) => nodeSizeFromLabel(String(ele.data("label") || ""), 90, 180, 6),
        height: (ele: cytoscape.NodeSingular) => {
          const label = String(ele.data("label") || "");
          const len = label.length;
          const lines = Math.max(1, Math.ceil(len / 14));
          return Math.min(80, Math.max(44, 28 + lines * 14));
        },
        shape: "round-rectangle",
      },
    },
    {
      selector: "edge",
      style: {
        width: 2,
        "line-color": "#555",
        "target-arrow-color": "#555",
        "target-arrow-shape": "triangle",
        "curve-style": "bezier",
        label: "data(label)",
        "font-size": "9px",
        "text-rotation": "autorotate",
        color: "#333",
      },
    },
    {
      selector: 'edge[edgeType="DERIVES"]',
      style: {
        width: 2,
        "line-color": "#1a1a1a",
        "target-arrow-color": "#1a1a1a",
        "line-style": "solid",
      },
    },
    {
      selector: 'edge[edgeType="POTENTIAL_MATCH"]',
      style: {
        width: 1.5,
        "line-color": "#94a3b8",
        "line-style": "dotted",
        "target-arrow-shape": "none",
      },
    },
    {
      selector: "node.selected",
      style: { "border-width": 4, "border-color": "#fbbf24" },
    },
    {
      selector: "node.highlighted",
      style: { opacity: 1 },
    },
    {
      selector: "edge.highlighted",
      style: { opacity: 1 },
    },
  ];
}

function getLayoutConfig(
  layoutType: string
): cytoscape.LayoutOptions & { name: string } {
  const base = {
    animate: true,
    animationDuration: 500,
    fit: true,
    padding: 50,
  };
  switch (layoutType) {
    case "dagre":
      return { ...base, name: "dagre", rankDir: "TB", nodeSep: 50, rankSep: 100 } as cytoscape.LayoutOptions & { name: string };
    case "cola":
      return { ...base, name: "cola", nodeSpacing: 50, edgeLengthVal: 100 } as cytoscape.LayoutOptions & { name: string };
    case "circle":
      return { ...base, name: "circle", radius: 200 } as cytoscape.LayoutOptions & { name: string };
    default:
      return { ...base, name: layoutType } as cytoscape.LayoutOptions & { name: string };
  }
}

declare global {
  interface Window {
    cytoscape?: typeof import("cytoscape");
  }
}

interface LineageGraphProps {
  data: LineageGraphData | null;
  layoutType?: "dagre" | "cola" | "circle";
  viewMode?: "pipeline" | "column";
  onNodeSelect?: (nodeId: string) => void;
  selectedNodeId?: string | null;
  className?: string;
}

export function LineageGraph({
  data,
  layoutType = "dagre",
  viewMode = "pipeline",
  onNodeSelect,
  selectedNodeId,
  className = "",
}: LineageGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const loadCytoscape = async () => {
      if (typeof window === "undefined") {
        setIsLoaded(true);
        return;
      }
      const w = window as Window & { cytoscape?: typeof import("cytoscape") };
      if (w.cytoscape) {
        setIsLoaded(true);
        return;
      }
      try {
        const cytoscapeModule = await import("cytoscape");
        const dagre = await import("cytoscape-dagre");
        const cola = await import("cytoscape-cola");

        const cytoscape = cytoscapeModule.default;
        cytoscape.use(dagre.default);
        cytoscape.use(cola.default);
        w.cytoscape = cytoscape;
        setIsLoaded(true);
      } catch (e) {
        console.error("Failed to load Cytoscape", e);
        setIsLoaded(true);
      }
    };
    loadCytoscape();
  }, []);

  useEffect(() => {
    if (!isLoaded || !containerRef.current || !window.cytoscape) return;

    const elements = generateGraphElements(data, viewMode);

    if (elements.length === 0) {
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
      return;
    }

    if (cyRef.current) {
      cyRef.current.destroy();
      cyRef.current = null;
    }

    const cy = window.cytoscape({
      container: containerRef.current,
      elements,
      style: getGraphStyle(),
      layout: getLayoutConfig(layoutType),
      minZoom: 0.1,
      maxZoom: 3,
    });

    cy.layout(getLayoutConfig(layoutType)).run();

    cy.on("tap", "node", (evt: cytoscape.EventObject) => {
      const node = evt.target;
      onNodeSelect?.(node.data("id") as string);
    });

    cyRef.current = cy;

    return () => {
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
  }, [isLoaded, data, layoutType, viewMode, onNodeSelect]);

  useEffect(() => {
    if (!cyRef.current || selectedNodeId == null) return;
    const cy = cyRef.current;
    cy.nodes().removeClass("selected highlighted");
    cy.edges().removeClass("highlighted");
    cy.nodes().style("opacity", 1);
    cy.edges().style("opacity", 0.6);

    if (selectedNodeId) {
      const node = cy.getElementById(selectedNodeId);
      if (node.length) {
        node.addClass("selected");
        node.connectedEdges().addClass("highlighted");
        node.connectedEdges().connectedNodes().addClass("highlighted");
        cy.nodes().not(".selected").not(".highlighted").style("opacity", 0.3);
        cy.edges().not(".highlighted").style("opacity", 0.2);
      }
    }
  }, [selectedNodeId, data]);

  const hasPipeline = (data?.transformNodes?.length ?? 0) > 0;
  const hasColumnLineage = (data?.semanticLineage?.nodes?.length ?? 0) > 0;
  if (!hasPipeline && !hasColumnLineage) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg border border-border bg-muted/30 text-muted-foreground ${className}`}
        style={{ minHeight: 400 }}
      >
        <p className="text-sm">Select datasets and generate. Add Join/Aggregate for a pipeline graph.</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: "100%", height: 500, minHeight: 400 }}
    />
  );
}
