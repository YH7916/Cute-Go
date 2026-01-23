import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { GameTree, type GameTreeNode } from '@kaya/gametree';
import { type SGFProperty } from '../../types/game';
import { now, logPerf } from '../../utils/perfLogger';

interface NavigationTiming {
  label: string;
  start: number;
  stateCommittedAt?: number;
}

interface UseGameNavigationProps {
  gameTree: GameTree<SGFProperty> | null;
  currentNodeId: number | string | null;
  rootId: number | string | null;
  setCurrentNodeId: (id: number | string) => void;
}

export function useGameNavigation({
  gameTree,
  currentNodeId,
  rootId,
  setCurrentNodeId,
}: UseGameNavigationProps) {
  const navigationTimingsRef = useRef<Map<number | string, NavigationTiming>>(new Map());
  const activeBranchMapRef = useRef<Map<number | string, number | string>>(new Map());

  const markNavigationStart = useCallback((label: string, targetNodeId: number | string) => {
    navigationTimingsRef.current.set(targetNodeId, {
      label,
      start: now(),
    });
  }, []);

  const rememberActiveBranch = useCallback(
    (parentId: number | string | null | undefined, childId: number | string | null | undefined) => {
      if (parentId === null || parentId === undefined) return;
      if (childId === null || childId === undefined) return;
      activeBranchMapRef.current.set(parentId, childId);
    },
    []
  );

  const getActiveChildForNode = useCallback(
    (node: GameTreeNode<SGFProperty>): GameTreeNode<SGFProperty> | null => {
      if (!node || node.children.length === 0) return null;
      const preferredId = activeBranchMapRef.current.get(node.id);
      if (preferredId !== undefined) {
        const preferredChild = node.children.find(child => child.id === preferredId);
        if (preferredChild) {
          return preferredChild;
        }
      }
      return node.children[0] ?? null;
    },
    []
  );

  const resetNavigation = useCallback(() => {
    activeBranchMapRef.current.clear();
    navigationTimingsRef.current.clear();
  }, []);

  const currentNode = useMemo(
    () => (gameTree && currentNodeId !== null ? gameTree.get(currentNodeId) : null),
    [gameTree, currentNodeId]
  );

  const nextMoveNode = useMemo(
    () => (currentNode ? getActiveChildForNode(currentNode) : null),
    [currentNode, getActiveChildForNode]
  );

  // Update active branch when current node changes (if it has a parent)
  useEffect(() => {
    if (!currentNode) return;
    if (currentNode.parentId === null || currentNode.parentId === undefined) return;
    rememberActiveBranch(currentNode.parentId, currentNode.id);
  }, [currentNode, rememberActiveBranch]);

  // Performance logging
  useEffect(() => {
    if (currentNodeId === null) return;
    const timing = navigationTimingsRef.current.get(currentNodeId);
    if (!timing || timing.stateCommittedAt) return;
    const commitTime = now();
    timing.stateCommittedAt = commitTime;
    logPerf(`${timing.label} → ${currentNodeId}`, commitTime - timing.start, 'state');
  }, [currentNodeId]);

  const variations = useMemo(() => {
    if (!currentNode) return [];
    const children = currentNode.children;
    if (children.length === 0) return [];

    // Fast path: pre-allocate array
    const result = new Array(children.length);
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const moveProperty = child.data.B?.[0]
        ? `B[${child.data.B[0]}]`
        : child.data.W?.[0]
          ? `W[${child.data.W[0]}]`
          : '';
      result[i] = {
        nodeId: child.id,
        move: moveProperty,
      };
    }
    return result;
  }, [currentNode]);

  const canGoBack = useMemo(
    () => currentNode !== null && currentNode.parentId !== null,
    [currentNode]
  );

  const canGoForward = useMemo(
    () => currentNode !== null && currentNode.children.length > 0,
    [currentNode]
  );

  // Navigation functions
  const goToNode = useCallback(
    (nodeId: number | string) => {
      if (!gameTree || nodeId === currentNodeId) return;
      const targetNode = gameTree.get(nodeId);
      if (!targetNode) return;

      rememberActiveBranch(targetNode.parentId, targetNode.id);
      markNavigationStart('goToNode', nodeId);
      setCurrentNodeId(nodeId);
    },
    [gameTree, currentNodeId, markNavigationStart, rememberActiveBranch, setCurrentNodeId]
  );

  const goBack = useCallback(() => {
    if (currentNode?.parentId === null || currentNode?.parentId === undefined) {
      return;
    }
    const targetId = currentNode.parentId;
    markNavigationStart('goBack', targetId);
    setCurrentNodeId(targetId);
  }, [currentNode, markNavigationStart, setCurrentNodeId]);

  const goForward = useCallback(() => {
    if (!currentNode) return;
    const nextNode = getActiveChildForNode(currentNode);
    if (!nextNode) return;

    rememberActiveBranch(currentNode.id, nextNode.id);
    markNavigationStart('goForward', nextNode.id);
    setCurrentNodeId(nextNode.id);
  }, [
    currentNode,
    markNavigationStart,
    rememberActiveBranch,
    getActiveChildForNode,
    setCurrentNodeId,
  ]);

  const goBackSteps = useCallback(
    (steps: number) => {
      if (!gameTree || currentNodeId === null || steps <= 0) return;

      let targetId = currentNodeId;
      let node = gameTree.get(targetId);

      for (let i = 0; i < steps; i++) {
        if (!node || node.parentId === null || node.parentId === undefined) break;
        targetId = node.parentId;
        node = gameTree.get(targetId);
      }

      if (targetId !== currentNodeId) {
        markNavigationStart(`goBackSteps(${steps})`, targetId);
        setCurrentNodeId(targetId);
      }
    },
    [gameTree, currentNodeId, markNavigationStart, setCurrentNodeId]
  );

  const goForwardSteps = useCallback(
    (steps: number) => {
      if (!gameTree || currentNodeId === null || steps <= 0) return;

      let targetId = currentNodeId;
      let node = gameTree.get(targetId);

      for (let i = 0; i < steps; i++) {
        if (!node) break;
        const nextNode = getActiveChildForNode(node);
        if (!nextNode) break;

        rememberActiveBranch(node.id, nextNode.id);
        targetId = nextNode.id;
        node = gameTree.get(targetId);
      }

      if (targetId !== currentNodeId) {
        markNavigationStart(`goForwardSteps(${steps})`, targetId);
        setCurrentNodeId(targetId);
      }
    },
    [
      gameTree,
      currentNodeId,
      markNavigationStart,
      rememberActiveBranch,
      getActiveChildForNode,
      setCurrentNodeId,
    ]
  );

  const goToStart = useCallback(() => {
    if (rootId === null || currentNodeId === rootId) {
      return;
    }
    markNavigationStart('goToStart', rootId);
    setCurrentNodeId(rootId);
  }, [rootId, currentNodeId, markNavigationStart, setCurrentNodeId]);

  const goToEnd = useCallback(() => {
    if (!gameTree || currentNodeId === null) return;

    // Follow main variation to the end
    let nodeId = currentNodeId;
    let node = gameTree.get(nodeId);
    const visited = new Set<number | string>();

    while (node && node.children.length > 0) {
      // Prevent infinite loop
      if (visited.has(nodeId)) {
        console.error('Circular reference detected in goToEnd!', nodeId);
        break;
      }
      visited.add(nodeId);

      const nextChild = getActiveChildForNode(node);
      if (!nextChild) {
        break;
      }
      rememberActiveBranch(node.id, nextChild.id);
      nodeId = nextChild.id;
      node = gameTree.get(nodeId);
    }

    if (nodeId === currentNodeId) return;
    markNavigationStart('goToEnd', nodeId);
    setCurrentNodeId(nodeId);
  }, [
    gameTree,
    currentNodeId,
    markNavigationStart,
    rememberActiveBranch,
    getActiveChildForNode,
    setCurrentNodeId,
  ]);

  const navigateToMove = useCallback(
    (moveNumber: number) => {
      if (!gameTree || rootId === null || rootId === undefined) return;
      let current = gameTree.get(rootId);
      let count = 0;
      while (current && count < moveNumber) {
        const next = getActiveChildForNode(current);
        if (!next) break;
        current = next;
        if (current.data.B || current.data.W) count++;
      }
      if (current) {
        markNavigationStart(`navigateToMove(${moveNumber})`, current.id);
        setCurrentNodeId(current.id);
      }
    },
    [gameTree, rootId, getActiveChildForNode, markNavigationStart, setCurrentNodeId]
  );

  const navigateToNextFork = useCallback(() => {
    if (!gameTree || currentNodeId === null || currentNodeId === undefined) return;
    let current = gameTree.get(currentNodeId);
    while (current) {
      const next = getActiveChildForNode(current);
      if (!next) break;
      current = next;
      if (current.children.length > 1) break;
    }
    if (current && current.id !== currentNodeId) {
      markNavigationStart('navigateToNextFork', current.id);
      setCurrentNodeId(current.id);
    }
  }, [gameTree, currentNodeId, getActiveChildForNode, markNavigationStart, setCurrentNodeId]);

  const navigateToPreviousFork = useCallback(() => {
    if (!gameTree || currentNodeId === null || currentNodeId === undefined) return;
    let current = gameTree.get(currentNodeId);
    while (current && current.parentId) {
      const parent = gameTree.get(current.parentId);
      if (!parent) break;
      current = parent;
      if (current.children.length > 1) break;
    }
    if (current && current.id !== currentNodeId) {
      markNavigationStart('navigateToPreviousFork', current.id);
      setCurrentNodeId(current.id);
    }
  }, [gameTree, currentNodeId, markNavigationStart, setCurrentNodeId]);

  const navigateToMainLine = useCallback(() => {
    if (!gameTree || rootId === null || rootId === undefined) return;
    markNavigationStart('navigateToMainLine', rootId);
    setCurrentNodeId(rootId);
  }, [gameTree, rootId, markNavigationStart, setCurrentNodeId]);

  // Navigate to previous sibling (wraps around)
  const goToPreviousSibling = useCallback(() => {
    if (
      !gameTree ||
      !currentNode ||
      currentNode.parentId === null ||
      currentNode.parentId === undefined
    ) {
      return;
    }
    const parent = gameTree.get(currentNode.parentId);
    if (!parent || parent.children.length <= 1) return;

    const siblings = parent.children;
    const index = siblings.findIndex((s: { id: string | number }) => s.id === currentNode.id);
    if (index === -1) return;

    const prevIndex = (index - 1 + siblings.length) % siblings.length;
    const targetId = siblings[prevIndex].id;

    markNavigationStart('goToPreviousSibling', targetId);
    setCurrentNodeId(targetId);
  }, [gameTree, currentNode, markNavigationStart, setCurrentNodeId]);

  // Navigate to next sibling (wraps around)
  const goToNextSibling = useCallback(() => {
    if (
      !gameTree ||
      !currentNode ||
      currentNode.parentId === null ||
      currentNode.parentId === undefined
    ) {
      return;
    }
    const parent = gameTree.get(currentNode.parentId);
    if (!parent || parent.children.length <= 1) return;

    const siblings = parent.children;
    const index = siblings.findIndex((s: { id: string | number }) => s.id === currentNode.id);
    if (index === -1) return;

    const nextIndex = (index + 1) % siblings.length;
    const targetId = siblings[nextIndex].id;

    markNavigationStart('goToNextSibling', targetId);
    setCurrentNodeId(targetId);
  }, [gameTree, currentNode, markNavigationStart, setCurrentNodeId]);

  // Navigate to a specific sibling by index (1-indexed)
  const goToSiblingIndex = useCallback(
    (targetIndex: number) => {
      if (
        !gameTree ||
        !currentNode ||
        currentNode.parentId === null ||
        currentNode.parentId === undefined
      ) {
        return;
      }
      const parent = gameTree.get(currentNode.parentId);
      if (!parent || parent.children.length <= 1) return;

      const siblings = parent.children;
      // Convert from 1-indexed to 0-indexed and clamp
      const clampedIndex = Math.max(0, Math.min(targetIndex - 1, siblings.length - 1));
      const targetId = siblings[clampedIndex].id;

      markNavigationStart(`goToSiblingIndex(${targetIndex})`, targetId);
      setCurrentNodeId(targetId);
    },
    [gameTree, currentNode, markNavigationStart, setCurrentNodeId]
  );

  // Get sibling info for UI
  const siblingInfo = useMemo(() => {
    if (
      !gameTree ||
      !currentNode ||
      currentNode.parentId === null ||
      currentNode.parentId === undefined
    ) {
      return { hasSiblings: false, currentIndex: 0, totalSiblings: 0 };
    }
    const parent = gameTree.get(currentNode.parentId);
    if (!parent) return { hasSiblings: false, currentIndex: 0, totalSiblings: 0 };

    const siblings = parent.children;
    const index = siblings.findIndex((s: { id: string | number }) => s.id === currentNode.id);

    return {
      hasSiblings: siblings.length > 1,
      currentIndex: index + 1, // 1-indexed for display
      totalSiblings: siblings.length,
    };
  }, [gameTree, currentNode]);

  /**
   * Find the branch root and depth from it.
   * A branch root is a node whose parent has multiple children.
   * Returns null if we're on the main line (no branching).
   */
  const findBranchRoot = useCallback((): {
    branchRootNode: GameTreeNode<SGFProperty>;
    forkNode: GameTreeNode<SGFProperty>;
    depthFromBranchRoot: number;
  } | null => {
    if (!gameTree || !currentNode) return null;

    let node = currentNode;
    let depth = 0;

    // Walk up until we find a node whose parent has multiple children
    while (node) {
      if (node.parentId === null || node.parentId === undefined) {
        return null; // Reached root without finding a fork
      }

      const parent = gameTree.get(node.parentId);
      if (!parent) return null;

      // Check if parent has multiple children (this node is a branch root)
      if (parent.children.length > 1) {
        return {
          branchRootNode: node,
          forkNode: parent,
          depthFromBranchRoot: depth,
        };
      }

      // Count moves as we go up
      if (node.data.B || node.data.W) {
        depth++;
      }

      node = parent;
    }

    return null;
  }, [gameTree, currentNode]);

  /**
   * Get information about the current branch context.
   * Only considers direct siblings (same parent/fork point).
   */
  const branchInfo = useMemo(() => {
    if (!gameTree || !currentNode) {
      return {
        hasBranches: false,
        currentIndex: 0,
        totalBranches: 0,
        isAtFork: false,
        depthFromBranchRoot: 0,
        forkNodeId: null as number | string | null,
        branchRootId: null as number | string | null,
      };
    }

    const branchData = findBranchRoot();
    if (!branchData) {
      return {
        hasBranches: false,
        currentIndex: 0,
        totalBranches: 0,
        isAtFork: false,
        depthFromBranchRoot: 0,
        forkNodeId: null,
        branchRootId: null,
      };
    }

    const { branchRootNode, forkNode, depthFromBranchRoot } = branchData;
    const siblings = forkNode.children;
    const index = siblings.findIndex((s: { id: string | number }) => s.id === branchRootNode.id);

    return {
      hasBranches: siblings.length > 1,
      currentIndex: index + 1, // 1-indexed for display
      totalBranches: siblings.length,
      isAtFork: depthFromBranchRoot === 0,
      depthFromBranchRoot,
      forkNodeId: forkNode.id,
      branchRootId: branchRootNode.id,
    };
  }, [gameTree, currentNode, findBranchRoot]);

  /**
   * Switch to a sibling branch and navigate to the same relative depth.
   * Only switches between direct siblings (same fork point).
   * If target branch is shorter, stops at its end.
   */
  const switchBranch = useCallback(
    (direction: 'next' | 'previous') => {
      if (!gameTree || !branchInfo.hasBranches || branchInfo.forkNodeId === null) return;

      const forkNode = gameTree.get(branchInfo.forkNodeId);
      if (!forkNode || forkNode.children.length <= 1) return;

      const siblings = forkNode.children;
      const currentIndex = branchInfo.currentIndex - 1; // Convert to 0-indexed

      // Calculate target index with wrap-around
      let targetIndex: number;
      if (direction === 'next') {
        targetIndex = (currentIndex + 1) % siblings.length;
      } else {
        targetIndex = (currentIndex - 1 + siblings.length) % siblings.length;
      }

      const targetBranchRoot = siblings[targetIndex];
      if (!targetBranchRoot) return;

      // If we're at the fork point (depth 0), just switch to the sibling root
      if (branchInfo.depthFromBranchRoot === 0) {
        markNavigationStart(`switchBranch(${direction})`, targetBranchRoot.id);
        rememberActiveBranch(forkNode.id, targetBranchRoot.id);
        setCurrentNodeId(targetBranchRoot.id);
        return;
      }

      // Navigate into the target branch to the same depth
      // We start at the branch root (depth 0) and follow children
      let targetNode = targetBranchRoot;
      let currentDepth = 0;
      const targetDepth = branchInfo.depthFromBranchRoot;

      // Follow the branch (first child = main line of that branch)
      while (currentDepth < targetDepth && targetNode.children.length > 0) {
        const nextNode = targetNode.children[0];
        if (!nextNode) break;
        targetNode = nextNode;
        // Only count nodes that have moves
        if (targetNode.data.B || targetNode.data.W) {
          currentDepth++;
        }
      }

      markNavigationStart(`switchBranch(${direction})`, targetNode.id);
      rememberActiveBranch(forkNode.id, targetBranchRoot.id);
      setCurrentNodeId(targetNode.id);
    },
    [gameTree, branchInfo, markNavigationStart, rememberActiveBranch, setCurrentNodeId]
  );

  /**
   * Switch to a specific sibling branch by index (1-indexed).
   * Navigates to the same relative depth in the target branch.
   */
  const switchToBranchIndex = useCallback(
    (targetIndex: number) => {
      if (!gameTree || !branchInfo.hasBranches || branchInfo.forkNodeId === null) return;

      const forkNode = gameTree.get(branchInfo.forkNodeId);
      if (!forkNode || forkNode.children.length <= 1) return;

      const siblings = forkNode.children;
      const clampedIndex = Math.max(0, Math.min(targetIndex - 1, siblings.length - 1));

      const targetBranchRoot = siblings[clampedIndex];
      if (!targetBranchRoot) return;

      // If at fork point, just switch
      if (branchInfo.depthFromBranchRoot === 0) {
        markNavigationStart(`switchToBranchIndex(${targetIndex})`, targetBranchRoot.id);
        rememberActiveBranch(forkNode.id, targetBranchRoot.id);
        setCurrentNodeId(targetBranchRoot.id);
        return;
      }

      // Navigate to same depth
      let targetNode = targetBranchRoot;
      let currentDepth = 0;
      const targetDepth = branchInfo.depthFromBranchRoot;

      while (currentDepth < targetDepth && targetNode.children.length > 0) {
        const nextNode = targetNode.children[0];
        if (!nextNode) break;
        targetNode = nextNode;
        if (targetNode.data.B || targetNode.data.W) {
          currentDepth++;
        }
      }

      markNavigationStart(`switchToBranchIndex(${targetIndex})`, targetNode.id);
      rememberActiveBranch(forkNode.id, targetBranchRoot.id);
      setCurrentNodeId(targetNode.id);
    },
    [gameTree, branchInfo, markNavigationStart, rememberActiveBranch, setCurrentNodeId]
  );

  // Calculate total moves in the current active branch
  const totalMovesInBranch = useMemo(() => {
    if (!gameTree || rootId === null || rootId === undefined) return 0;

    let node = gameTree.get(rootId);
    let count = 0;

    while (node) {
      if (node.data.B || node.data.W) {
        count++;
      }

      const nextChild = getActiveChildForNode(node);
      if (!nextChild) break;
      node = nextChild;
    }

    return count;
  }, [gameTree, rootId, getActiveChildForNode, currentNodeId]);

  return {
    currentNode,
    nextMoveNode,
    variations,
    canGoBack,
    canGoForward,
    totalMovesInBranch,
    navigate: goToNode,
    navigateBackward: (steps = 1) => goBackSteps(steps),
    navigateForward: (steps = 1) => goForwardSteps(steps),
    navigateUp: () => goBackSteps(10),
    navigateDown: () => goForwardSteps(10),
    navigateToStart: goToStart,
    navigateToEnd: goToEnd,
    navigateToMove,
    navigateToNextFork,
    navigateToPreviousFork,
    navigateToMainLine,
    goToPreviousSibling,
    goToNextSibling,
    goToSiblingIndex,
    siblingInfo,
    // Enhanced branch navigation (works even when deep in a branch)
    branchInfo,
    switchBranch,
    switchToBranchIndex,
    resetNavigation,
    markNavigationStart,
    rememberActiveBranch,
    navigationTimingsRef,
  };
}
