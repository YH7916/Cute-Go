/**
 * @kaya/gametree - An immutable game tree data type
 *
 * Ported from @sabaki/immutable-gametree
 * Original: https://github.com/SabakiHQ/immutable-gametree
 * License: MIT
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Represents a node in the game tree
 */
export interface GameTreeNode<T = Record<string, Primitive[]>> {
  id: IdType;
  data: T;
  parentId: IdType | null;
  children: GameTreeNode<T>[];
}

/**
 * Currents object specifies distinguished children of nodes.
 * Maps node ID to the ID of its distinguished child.
 */
export type CurrentsObject = Record<IdType, IdType>;

/**
 * Primitive value types allowed for node IDs and data values
 */
export type Primitive = string | number | boolean | null;

/**
 * ID types that can be used as object keys (excludes null and boolean)
 */
export type IdType = string | number;

/**
 * Options for creating a new GameTree
 */
export interface GameTreeOptions<T = Record<string, Primitive[]>> {
  getId?: () => IdType;
  merger?: (node: GameTreeNode<T>, data: T) => T | null;
  root?: Partial<GameTreeNode<T>>;
}

/**
 * Options for appending a node
 */
export interface AppendNodeOptions {
  disableMerging?: boolean;
}

// ============================================================================
// Hasher Utility
// ============================================================================

/**
 * Simple hash function adapted from https://github.com/darkskyapp/string-hash
 */
class Hasher {
  static new(): (str: string) => number {
    let result = 5381;

    return (str: string) => {
      for (let i = 0; i < str.length; i++) {
        result = (result * 33) ^ str.charCodeAt(i);
      }

      return result;
    };
  }
}

// ============================================================================
// Draft Class
// ============================================================================

/**
 * Draft class for making mutations to a GameTree
 */
class Draft<T = Record<string, Primitive[]>> {
  base: GameTree<T>;
  root: GameTreeNode<T>;
  _passOnNodeCache: boolean;
  _nodeCache: Record<IdType, GameTreeNode<T> | null>;
  _idAliases: Record<IdType, IdType>;
  _heightCache: number | null;
  _structureHashCache: number | null;

  constructor(base: GameTree<T>) {
    this.base = base;
    this.root = base.root;
    this._passOnNodeCache = true;
    this._nodeCache = {};
    this._idAliases = base._idAliases;
    this._heightCache = base._heightCache;
    this._structureHashCache = base._structureHashCache;
  }

  get(id: IdType | null): GameTreeNode<T> | null {
    if (id == null) return null;
    if (id in this._idAliases) return this.get(this._idAliases[id]);
    if (id in this._nodeCache) return this._nodeCache[id];

    const node = this.base.get(id);
    if (node == null) {
      this._nodeCache[id] = null;
      return null;
    }

    const nodeCopy: GameTreeNode<T> = {
      ...node,
      data: { ...node.data },
      children: [...node.children],
    };

    if (node.parentId != null) {
      const parentCopy = this.get(node.parentId);
      if (parentCopy) {
        const childIndex = parentCopy.children.findIndex(child => child.id === id);
        if (childIndex >= 0) parentCopy.children[childIndex] = nodeCopy;
      }
    }

    this._nodeCache[id] = nodeCopy;
    if (this.root.id === id) this.root = nodeCopy;

    return nodeCopy;
  }

  private _getLevel(id: IdType): number {
    let level = -1;
    let node = this.get(id);
    const visited = new Set<IdType>();

    while (node != null) {
      // Prevent infinite loop from circular references
      if (visited.has(node.id)) {
        console.error('Circular reference detected in game tree at _getLevel!', node.id);
        return level;
      }
      visited.add(node.id);

      level++;
      node = this.get(node.parentId);
    }

    return level;
  }

  appendNode(parentId: IdType, data: T, options: AppendNodeOptions = {}): IdType | null {
    const id = this.base.getId();
    const success = this.UNSAFE_appendNodeWithId(parentId, id, data, options);
    if (!success) return null;

    const merged = id in this._idAliases;
    if (!merged) return id;

    // If a merge occurred, clean up id alias since id hasn't been exposed
    const result = this._idAliases[id];
    delete this._idAliases[id];

    return result;
  }

  UNSAFE_appendNodeWithId(
    parentId: IdType,
    id: IdType,
    data: T,
    { disableMerging = false }: AppendNodeOptions = {}
  ): boolean {
    const parent = this.get(parentId);
    if (parent == null) return false;

    const [mergeWithId, mergedData] = (() => {
      if (!disableMerging) {
        for (const child of parent.children) {
          const mergedData = this.base.merger(child, data);
          if (mergedData != null) return [child.id, mergedData];
        }
      }

      return [null, null];
    })();

    if (mergeWithId != null) {
      const node = this.get(mergeWithId);
      if (node) {
        node.data = mergedData!;
      }

      if (id !== mergeWithId) {
        this._idAliases[id] = mergeWithId;
      }
    } else {
      const node: GameTreeNode<T> = { id, data, parentId, children: [] };
      parent.children.push(node);

      this._nodeCache[id] = node;
      this._structureHashCache = null;

      if (this._heightCache != null && this._getLevel(parentId) === this._heightCache - 1) {
        this._heightCache++;
      }
    }

    return true;
  }

  removeNode(id: IdType): boolean {
    const node = this.get(id);
    if (node == null) return false;

    const parentId = node.parentId;
    if (parentId == null) throw new Error('Cannot remove root node');

    const parent = this.get(parentId);
    if (parent == null) return false;

    const index = parent.children.findIndex(child => child.id === id);
    if (index >= 0) parent.children.splice(index, 1);
    else return false;

    this._nodeCache[id] = null;
    this._structureHashCache = null;
    this._heightCache = null;

    return true;
  }

  shiftNode(id: IdType, direction: 'left' | 'right' | 'main'): number | null {
    if (!['left', 'right', 'main'].includes(direction)) {
      throw new Error(`Invalid value for direction, only 'left', 'right', or 'main' allowed`);
    }

    const node = this.get(id);
    if (node == null) return null;

    const { parentId } = node;
    const parent = this.get(parentId!);
    if (parent == null) return null;

    const index = parent.children.findIndex(child => child.id === id);
    if (index < 0) return null;

    const newIndex =
      direction === 'left'
        ? Math.max(index - 1, 0)
        : direction === 'right'
          ? Math.min(index + 1, parent.children.length)
          : 0;

    if (index !== newIndex) {
      const [child] = parent.children.splice(index, 1);
      parent.children.splice(newIndex, 0, child);
    }

    this._structureHashCache = null;

    return newIndex;
  }

  makeRoot(id: IdType): boolean {
    if (id === this.root.id) return true;

    const node = this.get(id);
    if (node == null) return false;

    node.parentId = null;
    this.root = node;

    this._passOnNodeCache = false;
    this._heightCache = null;
    this._structureHashCache = null;

    return true;
  }

  addToProperty(id: IdType, property: string, value: Primitive): boolean {
    const node = this.get(id);
    if (node == null) return false;

    const data = node.data as any;
    if (!(property in data)) {
      data[property] = [value];
    } else if (!(data[property] as Primitive[]).includes(value)) {
      data[property] = [...data[property], value];
    }

    return true;
  }

  removeFromProperty(id: IdType, property: string, value: Primitive): boolean {
    const node = this.get(id);
    if (node == null) return false;

    const data = node.data as any;
    if (!(property in data)) return false;

    data[property] = (data[property] as Primitive[]).filter(x => x !== value);
    if ((data[property] as Primitive[]).length === 0) delete data[property];

    return true;
  }

  updateProperty(id: IdType, property: string, values: Primitive[] | null): boolean {
    const node = this.get(id);
    if (node == null) return false;

    if (values == null || values.length === 0) delete (node.data as any)[property];
    else (node.data as any)[property] = values;

    return true;
  }

  removeProperty(id: IdType, property: string): boolean {
    return this.updateProperty(id, property, null);
  }
}

// ============================================================================
// GameTree Class
// ============================================================================

/**
 * Immutable game tree data structure
 */
export class GameTree<T = Record<string, Primitive[]>> {
  getId: () => IdType;
  merger: (node: GameTreeNode<T>, data: T) => T | null;
  root: GameTreeNode<T>;
  _nodeCache: Record<IdType, GameTreeNode<T> | null>;
  _idAliases: Record<IdType, IdType>;
  _heightCache: number | null;
  _hashCache: number | null;
  _structureHashCache: number | null;

  constructor({ getId, merger, root }: GameTreeOptions<T> = {}) {
    // Initialize root node first (we need it to scan for max ID)
    const rootNode: GameTreeNode<T> = {
      id: 0, // Temporary ID, will be updated if provided in root
      data: {} as T,
      parentId: null,
      children: [],
      ...(root || {}),
    };

    // If no getId provided, create a counter that starts after max existing ID
    if (!getId) {
      // Find max ID in the tree to avoid collisions
      let maxId = -1;
      const scanForMaxId = (node: GameTreeNode<T>): void => {
        const nodeId = typeof node.id === 'number' ? node.id : -1;
        if (nodeId > maxId) maxId = nodeId;
        node.children.forEach(scanForMaxId);
      };
      scanForMaxId(rootNode);

      // Start counter after max existing ID
      let id = maxId + 1;
      this.getId = () => id++;
    } else {
      this.getId = getId;
    }

    // Default merger (no merging)
    this.merger = merger || (() => null);

    this.root = rootNode;
    this._nodeCache = {};
    this._idAliases = {};
    this._heightCache = null;
    this._hashCache = null;
    this._structureHashCache = null;
  }

  get(id: IdType | null): GameTreeNode<T> | null {
    let node: GameTreeNode<T> | null = null;
    if (id == null) return node;
    if (id in this._idAliases) return this.get(this._idAliases[id]);

    if (id in this._nodeCache) {
      node = this._nodeCache[id];
    } else {
      const inner = (node: GameTreeNode<T>): GameTreeNode<T> | null => {
        this._nodeCache[node.id] = node;
        if (node.id === id) return node;

        for (const child of node.children) {
          const result = inner(child);
          if (result != null) return result;
        }

        return null;
      };

      node = inner(this.root);
    }

    if (node == null) {
      this._nodeCache[id] = null;
      return null;
    }

    for (const child of node.children) {
      this._nodeCache[child.id] = child;
    }

    return node;
  }

  *getSequence(id: IdType): Generator<GameTreeNode<T>> {
    let node = this.get(id);
    if (node == null) return;
    yield node;

    const visited = new Set<IdType>();
    visited.add(node.id);

    while (node.children.length === 1) {
      node = node.children[0];

      // Prevent infinite loop
      if (visited.has(node.id)) {
        console.error('Circular reference detected in getSequence!', node.id);
        break;
      }
      visited.add(node.id);

      this._nodeCache[node.id] = node;
      for (const child of node.children) {
        this._nodeCache[child.id] = child;
      }

      yield node;
    }
  }

  mutate(mutator: (draft: Draft<T>) => void): GameTree<T> {
    const draft = new Draft(this);

    mutator(draft);
    if (draft.root === this.root) return this;

    const tree = new GameTree<T>({
      getId: this.getId,
      merger: this.merger,
      root: draft.root,
    });

    if (draft._passOnNodeCache) tree._nodeCache = draft._nodeCache;
    tree._idAliases = draft._idAliases;
    tree._structureHashCache = draft._structureHashCache;
    tree._heightCache = draft._heightCache;

    return tree;
  }

  navigate(id: IdType, step: number, currents: CurrentsObject = {}): GameTreeNode<T> | null {
    const node = this.get(id);

    if (node == null) return null;
    if (step === 0) return node;
    if (step < 0 && node.parentId != null) return this.navigate(node.parentId, step + 1, currents);

    const nextId =
      currents[node.id] != null
        ? currents[node.id]
        : node.children.length > 0
          ? node.children[0].id
          : null;

    if (nextId == null) return null;
    return this.navigate(nextId, step - 1, currents);
  }

  *listNodes(): Generator<GameTreeNode<T>> {
    function* inner(node: GameTreeNode<T>): Generator<GameTreeNode<T>> {
      yield node;

      for (const child of node.children) {
        yield* inner(child);
      }
    }

    yield* inner(this.root);
  }

  *listNodesHorizontally(startId: IdType, step: 1 | -1): Generator<GameTreeNode<T>> {
    if (Math.abs(step) !== 1) throw new Error('Invalid value for step, only -1 or 1 allowed');

    let level = this.getLevel(startId);
    if (level == null) return;

    let section = [...this.getSection(level)];
    let index = section.findIndex(node => node.id === startId);

    while (section[index] != null) {
      while (0 <= index && index < section.length) {
        yield section[index];
        index += step;
      }

      level += step;
      section =
        step > 0
          ? ([] as GameTreeNode<T>[]).concat(...section.map(node => node.children))
          : [...this.getSection(level)];
      index = step > 0 ? 0 : section.length - 1;
    }
  }

  *listNodesVertically(
    startId: IdType,
    step: 1 | -1,
    currents: CurrentsObject = {}
  ): Generator<GameTreeNode<T>> {
    if (Math.abs(step) !== 1) throw new Error('Invalid value for step, only -1 or 1 allowed');

    let node: GameTreeNode<T> | null = this.get(startId);
    const visited = new Set<IdType>();

    while (node != null) {
      // Prevent infinite loop
      if (visited.has(node.id)) {
        console.error('Circular reference detected in listNodesVertically!', node.id);
        break;
      }
      visited.add(node.id);

      yield node;
      node = this.navigate(node.id, step, currents);
    }
  }

  *listCurrentNodes(currents: CurrentsObject = {}): Generator<GameTreeNode<T>> {
    yield* this.listNodesVertically(this.root.id, 1, currents);
  }

  *listMainNodes(): Generator<GameTreeNode<T>> {
    yield* this.listCurrentNodes({});
  }

  getLevel(id: IdType): number | null {
    let result = -1;

    for (const node of this.listNodesVertically(id, -1, {})) {
      result++;
    }

    return result < 0 ? null : result;
  }

  *getSection(level: number): Generator<GameTreeNode<T>> {
    if (level < 0) return;
    if (level === 0) {
      yield this.root;
      return;
    }

    for (const parent of this.getSection(level - 1)) {
      yield* parent.children;
    }
  }

  getCurrentHeight(currents: CurrentsObject = {}): number {
    let result = 0;
    let node: GameTreeNode<T> | undefined = this.root;
    const visited = new Set<IdType>();

    while (node != null) {
      // Prevent infinite loop
      if (visited.has(node.id)) {
        console.error('Circular reference detected in getCurrentHeight!', node.id);
        break;
      }
      visited.add(node.id);

      result++;
      node =
        currents[node.id] == null
          ? node.children[0]
          : node.children.find(child => child.id === currents[node!.id]);
    }

    return result;
  }

  getHeight(): number {
    if (this._heightCache == null) {
      const inner = (node: GameTreeNode<T>): number => {
        let max = 0;

        for (const child of node.children) {
          max = Math.max(max, inner(child));
        }

        return max + 1;
      };

      this._heightCache = inner(this.root);
    }

    return this._heightCache;
  }

  getStructureHash(): string {
    if (this._structureHashCache == null) {
      const hash = Hasher.new();

      const inner = (node: GameTreeNode<T>): number => {
        hash('[' + JSON.stringify(node.id) + ',');
        node.children.forEach(inner);
        return hash(']');
      };

      this._structureHashCache = inner(this.root);
    }

    return (this._structureHashCache >>> 0) + '';
  }

  getHash(): string {
    if (this._hashCache == null) {
      const hash = Hasher.new();

      const inner = (node: GameTreeNode<T>): number => {
        hash('[' + JSON.stringify(node.data) + ',');
        node.children.forEach(inner);
        return hash(']');
      };

      this._hashCache = inner(this.root);
    }

    return (this._hashCache >>> 0) + '';
  }

  onCurrentLine(id: IdType, currents: CurrentsObject = {}): boolean {
    for (const node of this.listNodesVertically(id, -1, {})) {
      const { parentId } = node;

      if (
        parentId != null &&
        currents[parentId] !== node.id &&
        (currents[parentId] != null || this.get(parentId)!.children[0] !== node)
      )
        return false;
    }

    return true;
  }

  onMainLine(id: IdType): boolean {
    return this.onCurrentLine(id, {});
  }

  toJSON(): GameTreeNode<T> {
    return this.root;
  }
}
