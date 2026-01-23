// Types needed for the worker
interface Node {
  id: string;
  width?: number;
  height?: number;
  position: { x: number; y: number };
  [key: string]: any;
}

interface Edge {
  id: string;
  source: string;
  target: string;
  [key: string]: any;
}

interface LayoutMessage {
  nodes: Node[];
  edges: Edge[];
  direction: 'TB' | 'LR';
}

// Node size constants
const NODE_WIDTH = 24;
const NODE_HEIGHT = 24;
const H_SPACING = 14; // horizontal gap between siblings (perpendicular axis)
const V_SPACING = 18; // vertical gap between levels (main axis)

/**
 * OGS-style Tree Layout Algorithm: Main Line Straight with Branching Variations
 *
 * Key principle: The main line (first child at each node) stays on a straight line,
 * while variations (2nd, 3rd, etc. children) branch off perpendicular to the main line.
 *
 * For horizontal layout (LR):
 * - Main line goes left-to-right at y=0
 * - Variations branch downward (positive y)
 *
 * For vertical layout (TB):
 * - Main line goes top-to-bottom at x=0
 * - Variations branch rightward (positive x)
 *
 * Algorithm: Two-pass with proper subtree width calculation
 * 1. First pass (post-order): Calculate space needed by each subtree
 * 2. Second pass (pre-order): Position nodes, main line at top, variations below
 *
 * Key: Early branches stay close to main line, later branches go further out
 */
function layoutOGS(nodes: Node[], edges: Edge[], direction: 'TB' | 'LR'): Node[] {
  if (nodes.length === 0) return nodes;

  // Build adjacency map from edges (parent -> children)
  const childrenMap = new Map<string, string[]>();
  const parentMap = new Map<string, string>();

  for (const edge of edges) {
    if (!childrenMap.has(edge.source)) {
      childrenMap.set(edge.source, []);
    }
    childrenMap.get(edge.source)!.push(edge.target);
    parentMap.set(edge.target, edge.source);
  }

  // Find root node (node with no parent)
  const nodeIds = new Set(nodes.map(n => n.id));
  let rootId: string | null = null;
  for (const nodeId of nodeIds) {
    if (!parentMap.has(nodeId)) {
      rootId = nodeId;
      break;
    }
  }

  if (!rootId) {
    rootId = nodes[0].id;
  }

  const positions = new Map<string, { x: number; y: number }>();
  const isHorizontal = direction === 'LR';
  const nodeSpacing = NODE_HEIGHT + H_SPACING;

  // Track the next available offset at each depth level
  // This ensures no two nodes at the same depth overlap
  const nextOffsetAtDepth = new Map<number, number>();

  /**
   * Position nodes using a single pre-order traversal.
   *
   * Key insight: We track the "next available offset" at each depth.
   * - Main line nodes continue at the same offset as parent
   * - Variations take the next available offset at their depth
   * - After placing a node, we update the next available offset for that depth
   *
   * @param nodeId - current node to position
   * @param depth - depth along the main axis (move number)
   * @param inheritedOffset - the offset inherited from parent (for main line continuity), or -1 if should use next available
   */
  function assignPositions(nodeId: string, depth: number, inheritedOffset: number): void {
    const children = childrenMap.get(nodeId) || [];

    // Get the next available offset at this depth
    const nextAvailable = nextOffsetAtDepth.get(depth) ?? 0;

    // Determine actual offset:
    // - If inheritedOffset is -1, use next available (for variations)
    // - Otherwise, use max of inherited and next available (for main line)
    const actualOffset =
      inheritedOffset < 0 ? nextAvailable : Math.max(inheritedOffset, nextAvailable);

    // Position along main axis
    const mainAxisPos = depth * (isHorizontal ? NODE_WIDTH + V_SPACING : NODE_HEIGHT + V_SPACING);

    // Position this node
    if (isHorizontal) {
      positions.set(nodeId, { x: mainAxisPos, y: actualOffset });
    } else {
      positions.set(nodeId, { x: actualOffset, y: mainAxisPos });
    }

    // Update next available offset for this depth
    nextOffsetAtDepth.set(depth, actualOffset + nodeSpacing);

    if (children.length === 0) return;

    // Main line child inherits the same offset (for straight continuation)
    // Variations get placed at the next available offset at their depth
    for (let i = 0; i < children.length; i++) {
      if (i === 0) {
        // Main line - inherit same offset
        assignPositions(children[i], depth + 1, actualOffset);
      } else {
        // Variation - use -1 to signal "use next available"
        assignPositions(children[i], depth + 1, -1);
      }
    }
  }

  // Execute the algorithm
  assignPositions(rootId, 0, 0);

  // Apply positions to nodes
  return nodes.map(node => {
    const pos = positions.get(node.id);
    if (pos) {
      return {
        ...node,
        position: pos,
      };
    }
    return node;
  });
}

self.onmessage = (event: MessageEvent<LayoutMessage>) => {
  const { nodes, edges, direction } = event.data;

  const start = performance.now();
  const layoutedNodes = layoutOGS(nodes, edges, direction);
  const duration = performance.now() - start;

  self.postMessage({
    nodes: layoutedNodes,
    edges,
    duration,
  });
};
