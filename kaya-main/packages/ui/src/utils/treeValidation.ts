import { GameTree } from '@kaya/gametree';
import { type SGFProperty } from '../types/game';

/**
 * Validate game tree integrity
 * Returns list of issues found
 */
export function validateTreeIntegrity(
  tree: GameTree<SGFProperty>,
  rootId: number | string
): string[] {
  const issues: string[] = [];
  const visited = new Set<number | string>();
  const nodeIds = new Set<number | string>();

  function traverse(nodeId: number | string, depth: number = 0): void {
    // Check max depth to prevent stack overflow
    if (depth > 10000) {
      issues.push(`Maximum depth exceeded at node ${nodeId}`);
      return;
    }

    // Check for cycles
    if (visited.has(nodeId)) {
      issues.push(
        `Circular reference detected: node ${nodeId} visited twice (path includes this node)`
      );
      return;
    }
    visited.add(nodeId);

    const node = tree.get(nodeId);
    if (!node) {
      issues.push(`Node ${nodeId} not found in tree`);
      return;
    }

    // Check for duplicate IDs
    if (nodeIds.has(node.id)) {
      issues.push(`Duplicate node ID: ${node.id} (appears multiple times in tree structure)`);
    }
    nodeIds.add(node.id);

    // Check parent-child relationships
    for (const child of node.children) {
      if (child.parentId !== node.id) {
        issues.push(
          `Child ${child.id} has wrong parentId: ${child.parentId} (should be ${node.id})`
        );
      }
      traverse(child.id, depth + 1);
    }
  }

  try {
    traverse(rootId);
  } catch (error) {
    issues.push(`Validation error: ${error}`);
  }

  return issues;
}
