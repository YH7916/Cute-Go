/**
 * GameTreeGraph - React Flow implementation for large game trees
 *
 * Features:
 * - Handles 60K+ nodes with virtualization
 * - Automatic layout with elkjs
 * - Built-in pan/zoom
 * - Custom node rendering (Go stones)
 */

import React, {
  useCallback,
  useMemo,
  useEffect,
  useRef,
  useState,
  useImperativeHandle,
  forwardRef,
} from 'react';
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  ReactFlowInstance,
  CoordinateExtent,
  ProOptions,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useGameTree, useGameTreeCore } from '../../contexts/GameTreeContext';
import { useTheme } from '../../contexts/ThemeContext';
import { rafThrottle } from '../../utils/throttle';
import type { GameTreeNode } from '@kaya/gametree';
import type { SGFProperty } from '../../contexts/GameTreeContext';
import './GameTreeGraph.css';

const LAYOUT_IDLE_TIMEOUT = 150;
const VIEWPORT_PADDING = 200;
const DEFAULT_TRANSLATE_EXTENT: CoordinateExtent = [
  [-VIEWPORT_PADDING, -VIEWPORT_PADDING],
  [VIEWPORT_PADDING, VIEWPORT_PADDING],
];

type IdleCallbackHandle = number;

type RequestIdleCallbackFn = (
  callback: IdleRequestCallback,
  options?: IdleRequestOptions
) => number;

type CancelIdleCallbackFn = (handle: number) => void;

const scheduleDeferred = (callback: () => void): IdleCallbackHandle => {
  if (typeof window === 'undefined') {
    callback();
    return 0;
  }

  const win = window as typeof window & {
    requestIdleCallback?: RequestIdleCallbackFn;
  };

  if (win.requestIdleCallback) {
    return win.requestIdleCallback(() => callback(), { timeout: LAYOUT_IDLE_TIMEOUT });
  }

  return window.setTimeout(callback, 16);
};

const cancelDeferred = (handle: IdleCallbackHandle): void => {
  if (handle === 0) {
    return;
  }

  if (typeof window === 'undefined') {
    return;
  }

  const win = window as typeof window & {
    cancelIdleCallback?: CancelIdleCallbackFn;
  };

  if (win.cancelIdleCallback) {
    win.cancelIdleCallback(handle);
    return;
  }

  window.clearTimeout(handle);
};

function getHandleStyle(position: Position): React.CSSProperties {
  const base: React.CSSProperties = {
    opacity: 0,
    width: 0,
    height: 0,
    border: 'none',
    background: 'transparent',
    pointerEvents: 'none',
  };

  switch (position) {
    case Position.Left:
      return { ...base, left: 0, transform: 'translate(0, -50%)' };
    case Position.Right:
      return { ...base, right: 0, transform: 'translate(0, -50%)' };
    case Position.Top:
      return { ...base, top: 0, transform: 'translate(-50%, 0)' };
    case Position.Bottom:
      return { ...base, bottom: 0, transform: 'translate(-50%, 0)' };
    default:
      return base;
  }
}

// Custom node component for Go stones with 3D effect
// Memoized to prevent unnecessary re-renders (React Flow best practice)
// Uses optimized selector to only subscribe to currentNodeId changes
// This avoids re-rendering on unrelated context changes!
const StoneNode = React.memo(({ data }: { data: any }) => {
  const { currentNodeId } = useGameTreeCore();
  const {
    color,
    moveNumber,
    hasComment,
    hasMarkers,
    hasSetupStones,
    horizontal,
    isRoot,
    nodeId,
    isPass,
  } = data;

  // Calculate isCurrent directly from context
  // This prevents rebuilding entire nodes array on every navigation!
  const isCurrent = String(nodeId) === String(currentNodeId);

  const targetPosition = horizontal ? Position.Left : Position.Top;
  const sourcePosition = horizontal ? Position.Right : Position.Bottom;
  const targetHandleStyle = React.useMemo(() => getHandleStyle(targetPosition), [targetPosition]);
  const sourceHandleStyle = React.useMemo(() => getHandleStyle(sourcePosition), [sourcePosition]);

  // Memoize stone styles to avoid recalculating on every render
  const stoneStyle = React.useMemo(() => {
    if (isRoot) {
      return {
        background: '#666',
        color: 'white',
        boxShadow: isCurrent
          ? '0 2px 4px rgba(0, 0, 0, 0.2), 0 0 0 3px #4A9EFF'
          : '0 2px 4px rgba(0, 0, 0, 0.2)',
        border: '1px solid #888',
      };
    }
    if (isPass) {
      // Pass node: solid background with larger P letter for better visibility
      return {
        background:
          color === 'black'
            ? 'rgba(0, 0, 0, 0.15)' // Light gray for black pass
            : 'rgba(255, 255, 255, 0.3)', // Lighter for white pass
        boxShadow: isCurrent ? '0 0 0 3px #4A9EFF' : 'none',
        border: `2px solid ${color === 'black' ? '#333' : '#aaa'}`,
      };
    }
    if (color === 'black') {
      // Black stone with light ring for visibility against dark backgrounds
      return {
        background: 'radial-gradient(circle at 35% 35%, #555 0%, #222 30%, #000 100%)',
        boxShadow: isCurrent
          ? '0 2px 4px rgba(0, 0, 0, 0.4), 0 0 0 3px #4A9EFF'
          : '0 2px 4px rgba(0, 0, 0, 0.4), 0 0 0 1.5px rgba(255, 255, 255, 0.45)',
        border: 'none',
      };
    } else {
      // White stone with dark ring for visibility against light backgrounds
      return {
        background:
          'radial-gradient(circle at 30% 30%, #fff 0%, #f0f0f0 25%, #d5d5d5 60%, #bbb 100%)',
        boxShadow: isCurrent
          ? '0 3px 5px rgba(0, 0, 0, 0.3), 0 0 0 3px #4A9EFF'
          : '0 3px 5px rgba(0, 0, 0, 0.3), 0 0 0 1.5px rgba(0, 0, 0, 0.35)',
        border: 'none',
      };
    }
  }, [isRoot, color, isCurrent, isPass]);

  return (
    <>
      <Handle type="target" position={targetPosition} style={targetHandleStyle} />
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: isRoot ? '2px' : '50%',
          ...stoneStyle,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: isPass ? '11px' : '10px',
          fontWeight: 'bold',
          color: isPass
            ? color === 'black'
              ? '#333'
              : '#888'
            : color === 'black' || isRoot
              ? '#FFF'
              : '#000',
          position: 'relative',
        }}
      >
        {isRoot ? '' : isPass ? 'P' : moveNumber > 0 && moveNumber}
        {hasComment && (
          <div
            style={{
              position: 'absolute',
              top: -2,
              right: hasMarkers ? 2 : -2,
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: '#FF6B6B',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.3)',
            }}
          />
        )}
        {hasMarkers && (
          <div
            style={{
              position: 'absolute',
              top: -2,
              right: -2,
              width: 5,
              height: 5,
              borderRadius: '1px',
              backgroundColor: '#4A9EFF',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.3)',
            }}
          />
        )}
        {hasSetupStones && (
          <div
            style={{
              position: 'absolute',
              bottom: -2,
              right: -2,
              width: 5,
              height: 5,
              borderRadius: '1px',
              backgroundColor: '#51CF66', // Green
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.3)',
            }}
          />
        )}
      </div>
      <Handle type="source" position={sourcePosition} style={sourceHandleStyle} />
    </>
  );
});

export interface GameTreeGraphRef {
  centerOnCurrentNode: () => void;
}

export interface GameTreeGraphProps {
  horizontal?: boolean;
  onLayoutChange?: (horizontal: boolean) => void;
  showMinimap?: boolean;
}

function getNodeColor(node: GameTreeNode<SGFProperty>): 'black' | 'white' | 'empty' {
  if (node.data.B) return 'black';
  if (node.data.W) return 'white';
  return 'empty';
}

function isPassNode(node: GameTreeNode<SGFProperty>): boolean {
  // Pass can be represented as:
  // - Empty string: B[''] or W['']
  // - Missing coordinate: B[] or W[] (undefined in array)
  // - 'tt' on 19x19 boards (legacy SGF format)
  const blackMove = node.data.B?.[0];
  const whiteMove = node.data.W?.[0];

  // Check if move exists but is empty, undefined, or 'tt' (pass notation)
  if (blackMove !== undefined) {
    return blackMove === '' || blackMove === 'tt';
  }
  if (whiteMove !== undefined) {
    return whiteMove === '' || whiteMove === 'tt';
  }

  return false;
}

function hasComment(node: GameTreeNode<SGFProperty>): boolean {
  return !!(node.data.C && node.data.C[0] && node.data.C[0].trim() !== '');
}

function hasMarkers(node: GameTreeNode<SGFProperty>): boolean {
  // Check for any marker or label properties: TR, SQ, CR, MA, LB
  const markerProps = ['TR', 'SQ', 'CR', 'MA', 'LB'];
  return markerProps.some(prop => node.data[prop] && (node.data[prop] as string[]).length > 0);
}

function hasSetupStones(node: GameTreeNode<SGFProperty>): boolean {
  // Check for setup properties: AB, AW, AE
  const setupProps = ['AB', 'AW', 'AE'];
  return setupProps.some(prop => node.data[prop] && (node.data[prop] as string[]).length > 0);
}

// Node size constants (must match worker)
const NODE_WIDTH = 24;
const NODE_HEIGHT = 24;
const H_SPACING = 14;
const V_SPACING = 18;

/**
 * OGS-style layout algorithm (sync version for fallback)
 * Main line stays straight, variations branch off perpendicular
 * Early branches stay close to main line, later branches stack below
 */
function layoutOGSSync(
  nodes: Node[],
  edges: Edge[],
  direction: 'TB' | 'LR'
): { nodes: Node[]; edges: Edge[] } {
  if (nodes.length === 0) return { nodes, edges };

  const childrenMap = new Map<string, string[]>();
  const parentMap = new Map<string, string>();

  for (const edge of edges) {
    if (!childrenMap.has(edge.source)) {
      childrenMap.set(edge.source, []);
    }
    childrenMap.get(edge.source)!.push(edge.target);
    parentMap.set(edge.target, edge.source);
  }

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
  const nextOffsetAtDepth = new Map<number, number>();

  // Position nodes using a single pre-order traversal
  // inheritedOffset: -1 means use next available (for variations)
  function assignPositions(nodeId: string, depth: number, inheritedOffset: number): void {
    const children = childrenMap.get(nodeId) || [];

    // Get the next available offset at this depth
    const nextAvailable = nextOffsetAtDepth.get(depth) ?? 0;

    // Determine actual offset
    const actualOffset =
      inheritedOffset < 0 ? nextAvailable : Math.max(inheritedOffset, nextAvailable);

    // Position along main axis
    const mainAxisPos = depth * (isHorizontal ? NODE_WIDTH + V_SPACING : NODE_HEIGHT + V_SPACING);

    if (isHorizontal) {
      positions.set(nodeId, { x: mainAxisPos, y: actualOffset });
    } else {
      positions.set(nodeId, { x: actualOffset, y: mainAxisPos });
    }

    // Update next available offset for this depth
    nextOffsetAtDepth.set(depth, actualOffset + nodeSpacing);

    if (children.length === 0) return;

    // Main line child inherits the same offset
    // Variations use -1 to signal "use next available"
    for (let i = 0; i < children.length; i++) {
      if (i === 0) {
        assignPositions(children[i], depth + 1, actualOffset);
      } else {
        assignPositions(children[i], depth + 1, -1);
      }
    }
  }

  assignPositions(rootId, 0, 0);

  const layoutedNodes = nodes.map(node => {
    const pos = positions.get(node.id);
    return pos ? { ...node, position: pos } : node;
  });

  return { nodes: layoutedNodes, edges };
}

/**
 * Find the path from root to target node, returning ordered array of nodes
 */
function findPathToNode(
  node: GameTreeNode<SGFProperty>,
  targetId: string | number,
  visited = new Set<string | number>()
): GameTreeNode<SGFProperty>[] | null {
  if (visited.has(node.id)) return null;
  visited.add(node.id);

  if (node.id === targetId) {
    return [node];
  }

  for (const child of node.children) {
    const path = findPathToNode(child, targetId, visited);
    if (path) {
      return [node, ...path];
    }
  }

  return null;
}

/**
 * Build a node lookup map for quick access by ID
 */
function buildNodeMap(
  rootNode: GameTreeNode<SGFProperty>
): Map<string | number, GameTreeNode<SGFProperty>> {
  const map = new Map<string | number, GameTreeNode<SGFProperty>>();

  function traverse(n: GameTreeNode<SGFProperty>) {
    map.set(n.id, n);
    for (const child of n.children) {
      traverse(child);
    }
  }

  traverse(rootNode);
  return map;
}

/**
 * Build graph elements with smart node selection for large trees.
 *
 * Strategy (Option B - Prioritize Path + Siblings):
 * 1. Always include all nodes on the path from root to currentNode
 * 2. Always include all siblings of path nodes (alternative variations)
 * 3. Fill remaining capacity with depth-first from included nodes
 *
 * This ensures users always see alternative variations at each decision point,
 * which is critical for joseki dictionaries and variation-heavy games.
 */
function buildGraphElements(
  rootNode: GameTreeNode<SGFProperty>,
  currentNodeId: string | number | null,
  horizontal: boolean,
  edgeColor: string = '#fff'
): { nodes: Node[]; edges: Edge[]; includedNodeIds: Set<string | number> } {
  const MAX_NODES = 1000;

  // Track which nodes to include
  const includedNodes = new Set<string | number>();
  const nodeMap = new Map<string | number, GameTreeNode<SGFProperty>>();

  // Build node map for quick lookups
  function buildMap(n: GameTreeNode<SGFProperty>) {
    nodeMap.set(n.id, n);
    for (const child of n.children) {
      buildMap(child);
    }
  }
  buildMap(rootNode);

  // Phase 1: Find path to current node and include path + siblings
  const pathNodes = currentNodeId !== null ? findPathToNode(rootNode, currentNodeId) : null;
  const pathNodeIds = new Set<string | number>(pathNodes?.map(n => n.id) ?? []);

  // Always include root
  includedNodes.add(rootNode.id);

  // Include all path nodes
  if (pathNodes) {
    for (const node of pathNodes) {
      includedNodes.add(node.id);
    }
  }

  // Include siblings of all path nodes (alternative variations)
  // This ensures we always show branching options
  if (pathNodes) {
    for (const pathNode of pathNodes) {
      if (pathNode.parentId !== null) {
        const parent = nodeMap.get(pathNode.parentId);
        if (parent) {
          for (const sibling of parent.children) {
            includedNodes.add(sibling.id);
          }
        }
      }
    }
  }

  // Also include all direct children of root (important for joseki dictionaries)
  for (const child of rootNode.children) {
    includedNodes.add(child.id);
  }

  // Phase 2: Fill remaining capacity with depth-first traversal
  // Prioritize expanding from path nodes first, then other included nodes
  const queue: GameTreeNode<SGFProperty>[] = [];

  // Start with children of path nodes (to show more context around current position)
  if (pathNodes) {
    for (const pathNode of pathNodes) {
      for (const child of pathNode.children) {
        if (!includedNodes.has(child.id)) {
          queue.push(child);
        }
      }
    }
  }

  // Then add children of other included nodes
  for (const nodeId of includedNodes) {
    const node = nodeMap.get(nodeId);
    if (node) {
      for (const child of node.children) {
        if (!includedNodes.has(child.id) && !queue.some(q => q.id === child.id)) {
          queue.push(child);
        }
      }
    }
  }

  // Expand until we hit the limit
  while (queue.length > 0 && includedNodes.size < MAX_NODES) {
    const node = queue.shift()!;
    if (includedNodes.has(node.id)) continue;

    includedNodes.add(node.id);

    // Add children to queue for further expansion
    for (const child of node.children) {
      if (!includedNodes.has(child.id)) {
        queue.push(child);
      }
    }
  }

  // Phase 3: Build React Flow nodes with move numbers
  const nodes: Node[] = [];
  const moveNumbers = new Map<string | number, number>();

  // Calculate move numbers by traversing from root
  function calculateMoveNumbers(n: GameTreeNode<SGFProperty>, moveNum: number) {
    const color = getNodeColor(n);
    const currentMoveNum = color !== 'empty' ? moveNum + 1 : moveNum;
    moveNumbers.set(n.id, currentMoveNum);

    for (const child of n.children) {
      if (includedNodes.has(child.id)) {
        calculateMoveNumbers(child, currentMoveNum);
      }
    }
  }
  calculateMoveNumbers(rootNode, 0);

  // Create node objects
  for (const nodeId of includedNodes) {
    const n = nodeMap.get(nodeId);
    if (!n) continue;

    const color = getNodeColor(n);
    const isRoot = n.id === rootNode.id;
    const isPass = isPassNode(n);
    const moveNum = moveNumbers.get(n.id) ?? 0;

    nodes.push({
      id: String(n.id),
      type: 'stone',
      position: { x: 0, y: 0 }, // Will be set by layout
      data: {
        nodeId: n.id,
        color,
        moveNumber: color !== 'empty' ? moveNum : 0,
        hasComment: hasComment(n),
        hasMarkers: hasMarkers(n),
        hasSetupStones: hasSetupStones(n),
        horizontal,
        isRoot,
        isPass,
      },
    });
  }

  // Phase 4: Create edges between included nodes
  const edges: Edge[] = [];
  for (const nodeId of includedNodes) {
    const n = nodeMap.get(nodeId);
    if (!n) continue;

    for (const child of n.children) {
      if (includedNodes.has(child.id)) {
        edges.push({
          id: `e${String(n.id)}-${String(child.id)}`,
          source: String(n.id),
          target: String(child.id),
          style: { stroke: edgeColor, strokeWidth: 1.5 },
        });
      }
    }
  }

  return { nodes, edges, includedNodeIds: includedNodes };
}

// Define nodeTypes outside component to prevent ReactFlow warning
const nodeTypes = { stone: StoneNode };

const LOCAL_STORAGE_ZOOM_KEY = 'kaya-game-tree-zoom';

export const GameTreeGraph = forwardRef<GameTreeGraphRef, GameTreeGraphProps>(
  ({ horizontal: controlledHorizontal, onLayoutChange, showMinimap = false }, ref) => {
    const { gameTree, rootId, currentNodeId, goToNode } = useGameTree();
    const { theme } = useTheme();
    const edgeColor = theme === 'dark' ? '#fff' : '#333';
    const [internalHorizontal, setInternalHorizontal] = React.useState(true);
    const [nodes, setNodes] = useState<Node[]>([]);
    const [edges, setEdges] = useState<Edge[]>([]);
    const [graphExtent, setGraphExtent] = useState<CoordinateExtent>(DEFAULT_TRANSLATE_EXTENT);
    const allNodesRef = useRef<Node[]>([]);
    const allEdgesRef = useRef<Edge[]>([]);
    const containerRef = useRef<HTMLDivElement>(null);
    const workerRef = useRef<Worker | null>(null);
    const [isLoading, setIsLoading] = React.useState(false);
    const [needsLayout, setNeedsLayout] = React.useState(true);
    const reactFlowInstance = useRef<ReactFlowInstance | null>(null);
    const prevCurrentNodeId = useRef<string | number | null>(null);
    const hasInitializedView = useRef(false);
    const visibleNodeIdsRef = useRef<Set<string>>(new Set());
    const panFrameRef = useRef<number | null>(null);
    const persistedZoomRef = useRef<number | null>(null);
    const layoutTaskRef = useRef<IdleCallbackHandle | null>(null);
    const prevHorizontalRef = useRef<boolean | undefined>(undefined);
    const centerAfterLayoutRef = useRef(false);

    // Keep track of the latest currentNodeId in a ref to access it in async callbacks
    const currentNodeIdRef = useRef(currentNodeId);
    useEffect(() => {
      currentNodeIdRef.current = currentNodeId;
    }, [currentNodeId]);

    // Initialize worker
    useEffect(() => {
      if (typeof Worker !== 'undefined') {
        // Point to the compiled .js file in dist/
        // This is required because we are consuming the built package
        workerRef.current = new Worker(
          new URL('../../workers/graphLayout.worker.js', import.meta.url),
          {
            type: 'module',
          }
        );
      }
      return () => {
        workerRef.current?.terminate();
      };
    }, []);

    // Load persisted zoom once on mount
    React.useEffect(() => {
      if (persistedZoomRef.current !== null) return;
      if (typeof window === 'undefined' || !window.localStorage) return;
      const stored = window.localStorage.getItem(LOCAL_STORAGE_ZOOM_KEY);
      const parsed = stored ? parseFloat(stored) : NaN;
      if (Number.isFinite(parsed)) {
        persistedZoomRef.current = parsed;
      }
    }, []);

    const horizontal = controlledHorizontal ?? internalHorizontal;

    // Cache container dimensions to avoid forced reflows
    const containerDimensionsRef = React.useRef<{ width: number; height: number }>({
      width: 0,
      height: 0,
    });

    // Update visible nodes - now shows all nodes without viewport filtering
    // Viewport-based culling was causing nodes to disappear during navigation
    // With MAX_NODES = 1000, ReactFlow handles rendering efficiently without virtualization
    const updateVisibleNodes = useCallback(() => {
      // Simply ensure all nodes and edges from the layout are rendered
      // No viewport-based filtering to avoid missing nodes
      if (allNodesRef.current.length > 0) {
        setNodes(allNodesRef.current);
        setEdges(allEdgesRef.current);
      }
    }, []);

    // RAF-throttled version for continuous panning (avoids excessive re-renders)
    const throttledUpdateVisibleNodes = useMemo(
      () => rafThrottle(updateVisibleNodes),
      [updateVisibleNodes]
    );

    // Cleanup throttled handler on unmount
    useEffect(() => {
      return () => {
        throttledUpdateVisibleNodes.cancel();
      };
    }, [throttledUpdateVisibleNodes]);

    // Center on current node function - exposed via ref for external control
    const centerOnCurrentNode = useCallback(() => {
      if (currentNodeId === null || !reactFlowInstance.current) return;

      const currentNode = allNodesRef.current.find(n => n.id === String(currentNodeId));
      if (!currentNode) return;

      const { x, y } = currentNode.position;
      // Zoom to a comfortable level (1.5x) to focus on the current node
      reactFlowInstance.current.setCenter(x + 12, y + 12, { zoom: 1.5, duration: 200 });

      // Force visibility update after centering
      setTimeout(() => updateVisibleNodes(), 250);
    }, [currentNodeId, updateVisibleNodes]);

    // Expose centerOnCurrentNode to parent components via ref
    useImperativeHandle(
      ref,
      () => ({
        centerOnCurrentNode,
      }),
      [centerOnCurrentNode]
    );

    // Handle container resize to update visible nodes
    useEffect(() => {
      if (!containerRef.current) return;

      // Initial measurement (only once on mount)
      const rect = containerRef.current.getBoundingClientRect();
      containerDimensionsRef.current = { width: rect.width, height: rect.height };

      const observer = new ResizeObserver(entries => {
        // Use contentRect from ResizeObserver to avoid forced reflows
        for (const entry of entries) {
          containerDimensionsRef.current = {
            width: entry.contentRect.width,
            height: entry.contentRect.height,
          };
        }
        if (reactFlowInstance.current) {
          updateVisibleNodes();
        }
      });

      observer.observe(containerRef.current);

      return () => {
        observer.disconnect();
      };
    }, [updateVisibleNodes]);

    // Whenever the underlying tree or layout direction changes, trigger a fresh layout
    React.useEffect(() => {
      // Track if horizontal changed (not on initial mount) - if so, center after layout
      if (prevHorizontalRef.current !== undefined && prevHorizontalRef.current !== horizontal) {
        centerAfterLayoutRef.current = true;
      }
      prevHorizontalRef.current = horizontal;

      setNeedsLayout(true);
      visibleNodeIdsRef.current = new Set();
    }, [gameTree, rootId, horizontal, edgeColor]);

    // Build layout when necessary (initial load, file change, or when current node isn't visible)
    React.useEffect(() => {
      // If a layout task is pending but no longer needed, cancel it immediately.
      if (!needsLayout && layoutTaskRef.current !== null) {
        cancelDeferred(layoutTaskRef.current);
        layoutTaskRef.current = null;
      }

      if (!needsLayout) {
        return;
      }

      const runLayout = () => {
        layoutTaskRef.current = null;

        if (!gameTree || rootId === null) {
          setNodes([]);
          setEdges([]);
          visibleNodeIdsRef.current = new Set();
          setIsLoading(false);
          setNeedsLayout(false);
          return;
        }

        const root = gameTree.get(rootId);
        if (!root) {
          setNeedsLayout(false);
          return;
        }

        setIsLoading(true);

        const {
          nodes: rawNodes,
          edges: rawEdges,
          includedNodeIds,
        } = buildGraphElements(root, currentNodeId, horizontal, edgeColor);

        const applyLayout = (layoutedNodes: Node[], layoutedEdges: Edge[]) => {
          // Don't update isCurrent in node data - StoneNode will calculate it from context
          allNodesRef.current = layoutedNodes;
          allEdgesRef.current = layoutedEdges;

          // Calculate extent based on ALL nodes to prevent flickering during pan
          // This ensures the viewport bounds are stable even when nodes are culled
          if (layoutedNodes.length > 0) {
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;

            for (const node of layoutedNodes) {
              const width = node.width ?? 24;
              const height = node.height ?? 24;
              minX = Math.min(minX, node.position.x);
              minY = Math.min(minY, node.position.y);
              maxX = Math.max(maxX, node.position.x + width);
              maxY = Math.max(maxY, node.position.y + height);
            }

            if (
              Number.isFinite(minX) &&
              Number.isFinite(minY) &&
              Number.isFinite(maxX) &&
              Number.isFinite(maxY)
            ) {
              setGraphExtent([
                [minX - VIEWPORT_PADDING, minY - VIEWPORT_PADDING],
                [maxX + VIEWPORT_PADDING, maxY + VIEWPORT_PADDING],
              ]);
            }
          } else {
            setGraphExtent(DEFAULT_TRANSLATE_EXTENT);
          }

          // Set all nodes directly - no viewport culling to avoid flickering
          setNodes(layoutedNodes);
          setEdges(layoutedEdges);

          visibleNodeIdsRef.current = new Set(Array.from(includedNodeIds).map(id => String(id)));
          setIsLoading(false);
          setNeedsLayout(false);

          if (!hasInitializedView.current) {
            hasInitializedView.current = true;
            setTimeout(() => {
              if (!reactFlowInstance.current) return;

              // Use the latest currentNodeId from the ref to ensure we center on the correct node
              // even if the prop hasn't updated in this closure yet
              const targetNodeId = currentNodeIdRef.current;
              const currentNode = layoutedNodes.find((n: Node) => n.id === String(targetNodeId));
              const zoom = persistedZoomRef.current ?? 1;

              if (currentNode) {
                // Center on current node, respecting persisted zoom if available
                reactFlowInstance.current.setCenter(
                  currentNode.position.x + 12,
                  currentNode.position.y + 12,
                  { zoom, duration: 0 }
                );
              } else if (persistedZoomRef.current) {
                const viewport = reactFlowInstance.current.getViewport();
                reactFlowInstance.current.setViewport(
                  {
                    x: viewport.x,
                    y: viewport.y,
                    zoom,
                  },
                  { duration: 0 }
                );
              } else {
                // Fallback to fitView if current node not found
                reactFlowInstance.current.fitView({
                  padding: 0.05,
                  duration: 0,
                  maxZoom: 1.5,
                });
              }

              // No longer needed - all nodes are rendered without culling
            }, 50);
          } else if (centerAfterLayoutRef.current) {
            // Center on current node after layout change (e.g., horizontal toggle)
            centerAfterLayoutRef.current = false;
            setTimeout(() => {
              if (!reactFlowInstance.current) return;

              const targetNodeId = currentNodeIdRef.current;
              const currentNode = layoutedNodes.find((n: Node) => n.id === String(targetNodeId));

              if (currentNode) {
                const viewport = reactFlowInstance.current.getViewport();
                reactFlowInstance.current.setCenter(
                  currentNode.position.x + 12,
                  currentNode.position.y + 12,
                  { zoom: viewport.zoom, duration: 200 }
                );
              }
            }, 50);
          }
        };

        if (workerRef.current) {
          workerRef.current.onmessage = (e: MessageEvent) => {
            const { nodes: layoutedNodes, edges: layoutedEdges } = e.data;
            applyLayout(layoutedNodes, layoutedEdges);
          };

          workerRef.current.postMessage({
            nodes: rawNodes,
            edges: rawEdges,
            direction: horizontal ? 'LR' : 'TB',
          });
        } else {
          // Fallback to sync layout
          const { nodes: layoutedNodes, edges: layoutedEdges } = layoutOGSSync(
            rawNodes,
            rawEdges,
            horizontal ? 'LR' : 'TB'
          );

          applyLayout(layoutedNodes, layoutedEdges);
        }
      };

      if (layoutTaskRef.current === null) {
        layoutTaskRef.current = scheduleDeferred(runLayout);
      }

      return () => {
        if (layoutTaskRef.current !== null) {
          cancelDeferred(layoutTaskRef.current);
          layoutTaskRef.current = null;
        }
      };
    }, [needsLayout, gameTree, rootId, horizontal, currentNodeId, edgeColor, setNodes, setEdges]);

    // Ensure the currently selected node is visible; if not, request a layout rebuild
    React.useEffect(() => {
      if (currentNodeId === null) return;

      // When a layout is already pending or the visible set hasn't been populated yet,
      // skip the membership check to avoid thrashing the layout pipeline.
      if (needsLayout || visibleNodeIdsRef.current.size === 0) {
        return;
      }

      const currentIdString = String(currentNodeId);
      if (!visibleNodeIdsRef.current.has(currentIdString)) {
        setNeedsLayout(true);
      }
    }, [currentNodeId, needsLayout]);

    // NOTE: Previously there was an effect here that updated currentNodeId in all nodes' data.
    // This has been removed because StoneNode now reads currentNodeId directly from context.
    // This eliminates the expensive operation of creating new object references for ~1000 nodes
    // on every navigation!

    // Pan to current node without changing zoom
    React.useEffect(() => {
      if (currentNodeId === null || !reactFlowInstance.current) return;

      if (panFrameRef.current !== null) {
        cancelAnimationFrame(panFrameRef.current);
      }

      panFrameRef.current = requestAnimationFrame(() => {
        // Use allNodesRef to find position even if node is currently culled/not visible
        const currentNode = allNodesRef.current.find(n => n.id === String(currentNodeId));
        if (!currentNode || !reactFlowInstance.current) {
          return;
        }

        if (prevCurrentNodeId.current === currentNodeId) {
          return;
        }

        const { x, y } = currentNode.position;
        const zoom = reactFlowInstance.current.getZoom();
        // Use duration 0 to avoid race conditions with culling (updateVisibleNodes)
        // This ensures the viewport is updated immediately and nodes are rendered correctly
        reactFlowInstance.current.setCenter(x + 12, y + 12, { zoom, duration: 0 });
        prevCurrentNodeId.current = currentNodeId;

        // Force visibility update immediately after pan
        updateVisibleNodes();
      });
    }, [currentNodeId, updateVisibleNodes]);

    // Clean up pending pan animation when unmounting
    React.useEffect(() => {
      return () => {
        if (panFrameRef.current !== null) {
          cancelAnimationFrame(panFrameRef.current);
          panFrameRef.current = null;
        }
      };
    }, []);

    // Reset initialization flag when file changes
    React.useEffect(() => {
      hasInitializedView.current = false;
      prevCurrentNodeId.current = null;
    }, [gameTree, rootId]);

    // When toggling between horizontal and vertical layouts, force a re-center on the
    // current node after the new layout is computed so the viewport never lands in empty space.
    React.useEffect(() => {
      prevCurrentNodeId.current = null;
    }, [horizontal]);

    // Handle node click
    const onNodeClick = useCallback(
      (_: React.MouseEvent, node: Node) => {
        const nodeId = node.id === '0' ? 0 : Number(node.id);
        goToNode(nodeId);
      },
      [goToNode]
    );

    // No-op handler for panning - viewport culling disabled to prevent flickering
    const handleMove = useCallback(() => {
      // Intentionally empty - all nodes are always rendered
    }, []);

    // Persist zoom changes for future sessions
    const handleMoveEnd = useCallback(() => {
      if (!reactFlowInstance.current) return;
      const { zoom } = reactFlowInstance.current.getViewport();
      persistedZoomRef.current = zoom;
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(LOCAL_STORAGE_ZOOM_KEY, zoom.toString());
      }
    }, []);

    return (
      <div
        ref={containerRef}
        className="gametree-graph-container"
        style={{ width: '100%', height: '100%', position: 'relative' }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodeClick={onNodeClick}
          onMove={handleMove}
          onMoveEnd={handleMoveEnd}
          nodeTypes={nodeTypes}
          onInit={instance => {
            reactFlowInstance.current = instance;
          }}
          proOptions={{ hideAttribution: true } as ProOptions}
          fitView
          fitViewOptions={{
            padding: 0.05,
            minZoom: 0.2,
            maxZoom: 1.5,
          }}
          minZoom={0.1}
          maxZoom={4}
          translateExtent={graphExtent}
          onlyRenderVisibleElements={true}
          panOnDrag={true}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          preventScrolling={true}
          zoomOnDoubleClick={false}
          selectNodesOnDrag={false}
        >
          <Background />
          <Controls
            showInteractive={false}
            style={{
              background: 'var(--bg-secondary, rgba(0,0,0,0.8))',
              border: '1px solid var(--border-color, #333)',
            }}
          />
          {showMinimap && (
            <MiniMap
              pannable
              zoomable
              nodeColor={node => {
                const color = node.data?.color;
                if (color === 'black') return '#000';
                if (color === 'white') return '#FFF';
                return '#CCC';
              }}
              style={{
                background: 'var(--bg-secondary, rgba(10,12,18,0.6))',
                border: '1px solid var(--border-color, #333)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
                cursor: 'grab',
              }}
              maskColor="rgba(8,10,14,0.25)"
              nodeStrokeColor="var(--border-color, #333)"
            />
          )}
        </ReactFlow>
      </div>
    );
  }
);

GameTreeGraph.displayName = 'GameTreeGraph';
