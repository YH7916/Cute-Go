declare module '@dagrejs/dagre' {
  export interface GraphLabel {
    width?: number;
    height?: number;
    rankdir?: 'TB' | 'BT' | 'LR' | 'RL';
    align?: 'UL' | 'UR' | 'DL' | 'DR';
    nodesep?: number;
    edgesep?: number;
    ranksep?: number;
    marginx?: number;
    marginy?: number;
    acyclicer?: 'greedy' | undefined;
    ranker?: 'network-simplex' | 'tight-tree' | 'longest-path';
  }

  export interface NodeConfig {
    width?: number;
    height?: number;
  }

  export interface EdgeConfig {
    minlen?: number;
    weight?: number;
    width?: number;
    height?: number;
    labelpos?: 'l' | 'c' | 'r';
    labeloffset?: number;
  }

  export interface Node {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  export interface Edge {
    points: Array<{ x: number; y: number }>;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }

  export class Graph {
    constructor(options?: { directed?: boolean; compound?: boolean; multigraph?: boolean });
    setGraph(label: GraphLabel): this;
    graph(): GraphLabel;
    setNode(name: string, label?: NodeConfig): this;
    node(name: string): Node;
    nodes(): string[];
    setEdge(v: string, w: string, label?: EdgeConfig, name?: string): this;
    edge(v: string, w: string, name?: string): Edge;
    edges(): Array<{ v: string; w: string; name?: string }>;
    hasNode(name: string): boolean;
    removeNode(name: string): this;
    setDefaultNodeLabel(labelFn: () => NodeConfig): this;
    setDefaultEdgeLabel(labelFn: () => EdgeConfig): this;
  }

  export function layout(graph: Graph): void;

  export const graphlib: {
    Graph: typeof Graph;
  };
}
