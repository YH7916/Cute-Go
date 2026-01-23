# @kaya/gametree

An immutable game tree data structure for Go game trees, supporting navigation, variations, and structural mutations through a draft pattern.

Ported from [@sabaki/immutable-gametree](https://github.com/SabakiHQ/immutable-gametree) to TypeScript.

## Features

- **Immutable**: All mutations return a new GameTree instance
- **Structural Sharing**: Efficient copy-on-write implementation
- **Draft Pattern**: Make multiple mutations before committing
- **Navigation**: Move through the tree with flexible navigation methods
- **Hashing**: Cached structure and data hashing for performance
- **TypeScript**: Full type safety with generics

## Installation

```bash
bun add @kaya/gametree
```

## Usage

### Creating a Game Tree

```typescript
import { GameTree } from '@kaya/gametree';

// Create empty tree with default root
const tree = new GameTree();

// Custom ID generator
const tree = new GameTree({
  getId: () => crypto.randomUUID(),
});

// Custom node merging logic
const tree = new GameTree({
  merger: (node, data) => {
    // Return merged data if nodes should merge, null otherwise
    if (/* condition */) return { ...node.data, ...data };
    return null;
  },
});
```

### Adding Nodes

```typescript
const newTree = tree.mutate(draft => {
  // Append child to root
  const id1 = draft.appendNode(tree.root.id, { B: ['pd'] });

  // Append another child
  const id2 = draft.appendNode(id1, { W: ['dd'] });

  // Create variation
  const id3 = draft.appendNode(id1, { W: ['dp'] });
});
```

### Navigation

```typescript
// Get a node by ID
const node = tree.get(nodeId);

// Navigate from a node
const nextNode = tree.navigate(nodeId, 1); // Move forward
const prevNode = tree.navigate(nodeId, -1); // Move backward

// Navigate with currents (follow specific variation)
const currents = { [parentId]: childId };
const node = tree.navigate(nodeId, 1, currents);

// Get sequence of nodes (until branching)
for (const node of tree.getSequence(nodeId)) {
  console.log(node.data);
}
```

### Tree Iteration

```typescript
// All nodes in tree (depth-first)
for (const node of tree.listNodes()) {
  console.log(node.id, node.data);
}

// Horizontal iteration (breadth-first)
for (const node of tree.listNodesHorizontally(startId, 1)) {
  console.log(node.id);
}

// Vertical iteration (follow main line)
for (const node of tree.listMainNodes()) {
  console.log(node.id);
}

// Current line (using currents object)
for (const node of tree.listCurrentNodes(currents)) {
  console.log(node.id);
}
```

### Mutations

```typescript
const newTree = tree.mutate(draft => {
  // Remove a node and its children
  draft.removeNode(nodeId);

  // Shift node position among siblings
  draft.shiftNode(nodeId, 'left'); // Move left
  draft.shiftNode(nodeId, 'right'); // Move right
  draft.shiftNode(nodeId, 'main'); // Make main variation

  // Change tree root
  draft.makeRoot(nodeId);

  // Property mutations (for SGF properties)
  draft.addToProperty(nodeId, 'LB', 'pd:A'); // Add label
  draft.removeFromProperty(nodeId, 'LB', 'pd:A'); // Remove label
  draft.updateProperty(nodeId, 'C', ['Great move!']); // Set comment
  draft.removeProperty(nodeId, 'C'); // Remove comment
});
```

### Tree Queries

```typescript
// Get node level (distance from root)
const level = tree.getLevel(nodeId); // 0 for root, 1 for children, etc.

// Get all nodes at a specific level
for (const node of tree.getSection(level)) {
  console.log(node.id);
}

// Get tree height
const height = tree.getHeight();

// Get current line height
const currentHeight = tree.getCurrentHeight(currents);

// Check if node is on main line
const isMain = tree.onMainLine(nodeId);

// Check if node is on current line
const isCurrent = tree.onCurrentLine(nodeId, currents);
```

### Hashing

```typescript
// Get structure hash (based on tree structure only)
const structureHash = tree.getStructureHash();

// Get data hash (based on node data)
const dataHash = tree.getHash();
```

## Types

### GameTreeNode

```typescript
interface GameTreeNode<T = Record<string, Primitive[]>> {
  id: IdType; // string | number
  data: T; // Node data (SGF properties)
  parentId: IdType | null; // null for root
  children: GameTreeNode<T>[]; // Child nodes
}
```

### CurrentsObject

Specifies the distinguished child for each node (for following a specific variation):

```typescript
type CurrentsObject = Record<IdType, IdType>;

// Example: Follow second child of node 1, first child of node 2
const currents = {
  1: 5, // Node 1 -> Node 5
  2: 8, // Node 2 -> Node 8
};
```

### GameTreeOptions

```typescript
interface GameTreeOptions<T> {
  getId?: () => IdType; // Custom ID generator
  merger?: (node: GameTreeNode<T>, data: T) => T | null; // Node merging logic
  root?: Partial<GameTreeNode<T>>; // Initial root node data
}
```

## Integration with @kaya/sgf

The game tree naturally integrates with SGF (Smart Game Format) data:

```typescript
import { parse } from '@kaya/sgf';
import { GameTree } from '@kaya/gametree';

// Parse SGF file
const sgfTree = parse(sgfContent);

// Create GameTree from SGF
const tree = new GameTree({ root: sgfTree });

// Navigate and mutate
const newTree = tree.mutate(draft => {
  const lastNode = [...tree.listMainNodes()].pop();
  draft.appendNode(lastNode.id, { B: ['pd'] });
});
```

## Advanced Usage

### Custom ID Strategy

```typescript
// Use UUIDs for distributed systems
const tree = new GameTree({
  getId: () => crypto.randomUUID(),
});

// Use sequential IDs (default)
const tree = new GameTree({
  getId: (() => {
    let id = 0;
    return () => id++;
  })(),
});
```

### Node Merging

Automatically merge nodes with similar data:

```typescript
const tree = new GameTree({
  merger: (node, newData) => {
    // Merge if only comments differ
    const nodeProps = Object.keys(node.data).filter(k => k !== 'C');
    const newProps = Object.keys(newData).filter(k => k !== 'C');

    if (JSON.stringify(nodeProps) === JSON.stringify(newProps)) {
      return {
        ...node.data,
        C: [...(node.data.C || []), ...(newData.C || [])],
      };
    }

    return null; // Don't merge
  },
});
```

### Safe ID Assignment

Use `UNSAFE_appendNodeWithId` when you need to control IDs (e.g., importing from external format):

```typescript
const newTree = tree.mutate(draft => {
  // Only use if you can guarantee unique IDs
  draft.UNSAFE_appendNodeWithId(parentId, customId, data);
});
```

## Performance Considerations

- **Node Caching**: Nodes are cached on first access for O(1) retrieval
- **Structural Sharing**: Only modified nodes are copied, rest are shared
- **Hash Caching**: Structure and data hashes are cached until tree changes
- **Generator Functions**: Use generators for memory-efficient iteration

## License

AGPL-3.0 (ported from @sabaki/immutable-gametree (MIT))
