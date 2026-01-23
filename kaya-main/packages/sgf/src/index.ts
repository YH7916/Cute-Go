/**
 * @kaya/sgf - SGF (Smart Game Format) parser and stringifier
 * Converted from @sabaki/sgf to TypeScript
 */

// ============================================================================
// Types
// ============================================================================

/**
 * SGF Node structure matching @sabaki/immutable-gametree compatibility
 */
export interface SGFNode {
  id: number | string | null;
  data: SGFNodeData;
  parentId: number | string | null;
  children: SGFNode[];
}

/**
 * SGF properties dictionary
 * Keys are uppercase property identifiers (e.g., "B", "W", "C", "SZ")
 * Values are arrays of strings
 */
export interface SGFNodeData {
  [property: string]: string[];
}

/**
 * Token types from SGF lexer
 */
export type TokenType = 'parenthesis' | 'semicolon' | 'prop_ident' | 'c_value_type' | 'invalid';

/**
 * Token object from tokenizer
 */
export interface Token {
  type: TokenType;
  value: string;
  row: number;
  col: number;
  pos: number;
  progress: number;
}

/**
 * Options for parsing SGF
 */
export interface ParseOptions {
  /** ID generation function */
  getId?: () => number | string;
  /** Dictionary to store all nodes by ID */
  dictionary?: { [id: string]: SGFNode } | null;
  /** Progress callback (0-1) */
  onProgress?: (args: { progress: number }) => void;
  /** Node creation callback */
  onNodeCreated?: (args: { node: SGFNode }) => void;
}

/**
 * Options for stringifying SGF
 */
export interface StringifyOptions {
  /** Line break character(s) */
  linebreak?: string;
  /** Indentation string */
  indent?: string;
  /** Current indentation level (internal) */
  level?: number;
}

/**
 * Vertex coordinate [x, y]
 */
export type Vertex = [number, number];

/**
 * Game tree node structure (compatible with @kaya/gametree)
 * This version has recursive children for initial SGF parsing
 */
export interface GameTreeNodeRecursive<T> {
  id: number | string;
  data: T;
  parentId: number | string | null;
  children: GameTreeNodeRecursive<T>[];
}

/**
 * Game metadata extracted from SGF root node
 */
export interface GameInfo {
  playerBlack?: string;
  playerWhite?: string;
  rankBlack?: string;
  rankWhite?: string;
  gameName?: string;
  eventName?: string;
  komi?: number;
  handicap?: number;
  boardSize: number;
  date?: string;
  result?: string;
  rules?: string;
  timeControl?: string;
  place?: string;
}

/**
 * SGF Marker type (for board annotations)
 */
export interface SGFMarker {
  type: 'circle' | 'cross' | 'triangle' | 'square' | 'point' | 'label';
  label?: string;
}

// ============================================================================
// Constants
// ============================================================================

const ALPHA = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Escape backslashes and right brackets in SGF strings
 */
export function escapeString(input: string): string {
  return input.toString().replace(/\\/g, '\\\\').replace(/\]/g, '\\]');
}

/**
 * Unescape SGF strings, resolving escaped characters
 * Also removes escaped line breaks
 */
export function unescapeString(input: string): string {
  const result: string[] = [];
  let inBackslash = false;

  // Normalize line endings
  const normalized = input.replace(/\r/g, '');

  for (let i = 0; i < normalized.length; i++) {
    if (!inBackslash) {
      if (normalized[i] !== '\\') {
        result.push(normalized[i]);
      } else {
        inBackslash = true;
      }
    } else {
      // Skip escaped newlines
      if (normalized[i] !== '\n') {
        result.push(normalized[i]);
      }
      inBackslash = false;
    }
  }

  return result.join('');
}

/**
 * Parse SGF vertex string (e.g., "dd") to coordinates [x, y]
 * Returns [-1, -1] for invalid input
 */
export function parseVertex(input: string): Vertex {
  if (input.length !== 2) return [-1, -1];
  return [ALPHA.indexOf(input[0]), ALPHA.indexOf(input[1])] as Vertex;
}

/**
 * Convert vertex [x, y] to SGF string (e.g., "dd")
 * Returns empty string for invalid vertices
 */
export function stringifyVertex([x, y]: Vertex): string {
  if (Math.min(x, y) < 0 || Math.max(x, y) >= ALPHA.length) return '';
  return ALPHA[x] + ALPHA[y];
}

/**
 * Convert SGF coordinate to Vertex (alias for parseVertex)
 * SGF format: "aa" = [0,0], "ab" = [0,1], etc.
 * Returns null for invalid coordinates
 */
export function sgfToVertex(sgfCoord: string): Vertex | null {
  if (!sgfCoord || sgfCoord.length !== 2) return null;
  const x = sgfCoord.charCodeAt(0) - 97; // 'a' = 97
  const y = sgfCoord.charCodeAt(1) - 97;
  return [x, y];
}

/**
 * Convert Vertex to SGF coordinate (optimized version)
 * Pass moves ([-1, -1]) are encoded as empty string
 */
export function vertexToSGF(vertex: Vertex): string {
  const [x, y] = vertex;
  // Pass move is represented by [-1, -1] and encoded as empty string in SGF
  if (x === -1 || y === -1) {
    return '';
  }
  return String.fromCharCode(97 + x) + String.fromCharCode(97 + y);
}

/**
 * Parse compressed vertex list (e.g., "aa:cc" -> all vertices in rectangle)
 */
export function parseCompressedVertices(input: string): Vertex[] {
  const colon = input.indexOf(':');
  if (colon < 0) return [parseVertex(input)];

  const [x1, y1] = parseVertex(input.slice(0, colon));
  const [x2, y2] = parseVertex(input.slice(colon + 1));
  const vertices: Vertex[] = [];

  for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
      vertices.push([x, y]);
    }
  }

  return vertices;
}

/**
 * Extract markers from SGF node data
 * Returns a map of markers keyed by "x,y" coordinates
 *
 * Supported SGF marker properties:
 * - MA: X mark
 * - TR: Triangle
 * - CR: Circle
 * - SQ: Square
 * - LB: Label (format: "vertex:text")
 */
export function extractMarkers(nodeData: SGFNodeData): Map<string, SGFMarker> {
  const markers = new Map<string, SGFMarker>();

  // Process MA (X marks / cross)
  if (nodeData.MA) {
    for (const coord of nodeData.MA) {
      const vertices = parseCompressedVertices(coord);
      for (const [x, y] of vertices) {
        if (x >= 0 && y >= 0) {
          markers.set(`${x},${y}`, { type: 'cross' });
        }
      }
    }
  }

  // Process TR (triangles)
  if (nodeData.TR) {
    for (const coord of nodeData.TR) {
      const vertices = parseCompressedVertices(coord);
      for (const [x, y] of vertices) {
        if (x >= 0 && y >= 0) {
          markers.set(`${x},${y}`, { type: 'triangle' });
        }
      }
    }
  }

  // Process CR (circles)
  if (nodeData.CR) {
    for (const coord of nodeData.CR) {
      const vertices = parseCompressedVertices(coord);
      for (const [x, y] of vertices) {
        if (x >= 0 && y >= 0) {
          markers.set(`${x},${y}`, { type: 'circle' });
        }
      }
    }
  }

  // Process SQ (squares)
  if (nodeData.SQ) {
    for (const coord of nodeData.SQ) {
      const vertices = parseCompressedVertices(coord);
      for (const [x, y] of vertices) {
        if (x >= 0 && y >= 0) {
          markers.set(`${x},${y}`, { type: 'square' });
        }
      }
    }
  }

  // Process LB (labels) - format: "vertex:text"
  if (nodeData.LB) {
    for (const labelData of nodeData.LB) {
      const colonIndex = labelData.indexOf(':');
      if (colonIndex >= 0) {
        const coord = labelData.slice(0, colonIndex);
        const label = labelData.slice(colonIndex + 1);
        const vertex = parseVertex(coord);
        const [x, y] = vertex;
        if (x >= 0 && y >= 0) {
          markers.set(`${x},${y}`, { type: 'label', label });
        }
      }
    }
  }

  return markers;
}

/**
 * Parse SGF date string to array of date arrays
 * Format: "1996-12-27,28,1997-01-03"
 * Returns: [[1996, 12, 27], [1996, 12, 28], [1997, 1, 3]]
 */
export function parseDates(input: string): number[][] {
  if (
    !input.match(/^(\d{4}(-\d{1,2}(-\d{1,2})?)?(\s*,\s*(\d{4}|(\d{4}-)?\d{1,2}(-\d{1,2})?))*)?$/)
  ) {
    return [];
  }

  if (input.trim() === '') return [];

  const dates = input.split(',').map(x => x.trim().split('-'));

  for (let i = 1; i < dates.length; i++) {
    const date = dates[i];
    const prev = dates[i - 1];

    if (date[0].length !== 4) {
      // No year
      if (date.length === 1 && prev.length === 3) {
        // Add month
        date.unshift(prev[1]);
      }
      // Add year
      date.unshift(prev[0]);
    }
  }

  return dates.map(x => x.map(y => +y));
}

/**
 * Convert date arrays to SGF date string
 */
export function stringifyDates(dates: number[][]): string {
  if (dates.length === 0) return '';

  const datesCopy: number[][] = [dates[0].slice()];

  for (let i = 1; i < dates.length; i++) {
    const date = dates[i];
    const prev = dates[i - 1];
    let k = 0;

    for (let j = 0; j < date.length; j++) {
      if (date[j] === prev[j] && k === j) k++;
      else break;
    }

    datesCopy.push(date.slice(k));
  }

  return datesCopy.map(x => x.map(y => (y > 9 ? '' + y : '0' + y)).join('-')).join(',');
}

// ============================================================================
// Tokenizer
// ============================================================================

/**
 * Simple tokenizer for SGF content
 * Yields tokens one by one
 */
export function* tokenizeIter(contents: string): Generator<Token> {
  const len = contents.length;
  let pos = 0;
  let row = 0;
  let col = 0;

  while (pos < len) {
    const startPos = pos;
    const startRow = row;
    const startCol = col;
    const char = contents[pos];

    // Skip whitespace
    if (/\s/.test(char)) {
      if (char === '\n') {
        row++;
        col = 0;
      } else {
        col++;
      }
      pos++;
      continue;
    }

    // Parenthesis
    if (char === '(' || char === ')') {
      yield {
        type: 'parenthesis',
        value: char,
        row: startRow,
        col: startCol,
        pos: startPos,
        progress: startPos / (len - 1),
      };
      pos++;
      col++;
      continue;
    }

    // Semicolon
    if (char === ';') {
      yield {
        type: 'semicolon',
        value: char,
        row: startRow,
        col: startCol,
        pos: startPos,
        progress: startPos / (len - 1),
      };
      pos++;
      col++;
      continue;
    }

    // Property identifier (uppercase/lowercase letters)
    if (/[A-Za-z]/.test(char)) {
      let value = '';
      while (pos < len && /[A-Za-z]/.test(contents[pos])) {
        value += contents[pos];
        pos++;
        col++;
      }
      yield {
        type: 'prop_ident',
        value,
        row: startRow,
        col: startCol,
        pos: startPos,
        progress: startPos / (len - 1),
      };
      continue;
    }

    // Property value (in brackets)
    if (char === '[') {
      let value = '[';
      pos++;
      col++;
      let inEscape = false;

      while (pos < len) {
        const c = contents[pos];
        value += c;

        if (c === '\n') {
          row++;
          col = 0;
        } else {
          col++;
        }

        if (!inEscape && c === ']') {
          pos++;
          break;
        }

        inEscape = c === '\\' && !inEscape;
        pos++;
      }

      yield {
        type: 'c_value_type',
        value,
        row: startRow,
        col: startCol,
        pos: startPos,
        progress: startPos / (len - 1),
      };
      continue;
    }

    // Invalid token
    yield {
      type: 'invalid',
      value: char,
      row: startRow,
      col: startCol,
      pos: startPos,
      progress: startPos / (len - 1),
    };
    pos++;
    col++;
  }
}

/**
 * Tokenize entire content into array
 */
export function tokenize(contents: string): Token[] {
  return Array.from(tokenizeIter(contents));
}

// ============================================================================
// Parser
// ============================================================================

/**
 * Peekable iterator helper
 */
class Peekable<T> implements Iterator<T> {
  private iterator: Iterator<T>;
  private peeked: IteratorResult<T> | null = null;

  constructor(iterable: Iterable<T>) {
    this.iterator = iterable[Symbol.iterator]();
  }

  peek(): IteratorResult<T> {
    if (this.peeked === null) {
      this.peeked = this.iterator.next();
    }
    return this.peeked;
  }

  next(): IteratorResult<T> {
    if (this.peeked !== null) {
      const result = this.peeked;
      this.peeked = null;
      return result;
    }
    return this.iterator.next();
  }
}

/**
 * Internal recursive parser
 */
function parseTokensRecursive(
  peekableTokens: Peekable<Token>,
  parentId: number | string | null,
  options: RequiredParseOptions
): SGFNode | null {
  const { getId, dictionary, onProgress, onNodeCreated } = options;

  let anchor: SGFNode | null = null;
  let node: SGFNode | null = null;
  let property: string[] | null = null;

  // Parse nodes in sequence
  while (!peekableTokens.peek().done) {
    const { type, value, row, col } = peekableTokens.peek().value!;

    if (type === 'parenthesis' && value === '(') break;
    if (type === 'parenthesis' && value === ')') {
      if (node !== null) onNodeCreated({ node });
      return anchor;
    }

    // Create new node on semicolon or first iteration
    if (type === 'semicolon' || node === null) {
      const lastNode: SGFNode | null = node;

      const newNode: SGFNode = {
        id: getId(),
        data: {},
        parentId: lastNode === null ? parentId : lastNode.id,
        children: [],
      };
      node = newNode;

      if (dictionary !== null) {
        dictionary[String(node.id)] = node;
      }

      if (lastNode !== null) {
        onNodeCreated({ node: lastNode });
        lastNode.children.push(node);
      } else {
        anchor = node;
      }
    }

    if (type === 'semicolon') {
      // Already handled above
    } else if (type === 'prop_ident') {
      if (node !== null) {
        // Normalize property identifier (uppercase only)
        let identifier =
          value === value.toUpperCase()
            ? value
            : value
                .split('')
                .filter((x: string) => x.toUpperCase() === x)
                .join('');

        if (identifier !== '') {
          if (!(identifier in node.data)) {
            node.data[identifier] = [];
          }
          property = node.data[identifier];
        } else {
          property = null;
        }
      }
    } else if (type === 'c_value_type') {
      if (property !== null) {
        // Remove brackets and unescape
        property.push(unescapeString(value.slice(1, -1)));
      }
    } else if (type === 'invalid') {
      throw new Error(`Unexpected token at ${row + 1}:${col + 1}`);
    } else {
      throw new Error(`Unexpected token type '${type}' at ${row + 1}:${col + 1}`);
    }

    peekableTokens.next();
  }

  // Create anchor if no node was created
  if (node === null) {
    anchor = {
      id: null,
      data: {},
      parentId: null,
      children: [],
    };
  } else {
    onNodeCreated({ node });
  }

  // Parse variations (children)
  while (!peekableTokens.peek().done) {
    const { type, value, progress } = peekableTokens.peek().value!;

    if (type === 'parenthesis' && value === '(') {
      peekableTokens.next();

      const nodeToAttachTo = node ?? anchor;
      const child = parseTokensRecursive(peekableTokens, nodeToAttachTo?.id ?? null, options);

      if (child !== null && nodeToAttachTo !== null) {
        nodeToAttachTo.children.push(child);
      }
    } else if (type === 'parenthesis' && value === ')') {
      onProgress({ progress });
      break;
    }

    peekableTokens.next();
  }

  return anchor;
}

/**
 * Internal options type with required fields
 */
interface RequiredParseOptions {
  getId: () => number | string;
  dictionary: { [id: string]: SGFNode } | null;
  onProgress: (args: { progress: number }) => void;
  onNodeCreated: (args: { node: SGFNode }) => void;
}

/**
 * Parse tokens into SGF node tree
 */
export function parseTokens(tokens: Iterable<Token>, options: ParseOptions = {}): SGFNode[] {
  const defaultGetId = (() => {
    let id = 0;
    return () => id++;
  })();

  const fullOptions: RequiredParseOptions = {
    getId: options.getId ?? defaultGetId,
    dictionary: options.dictionary ?? null,
    onProgress: options.onProgress ?? (() => {}),
    onNodeCreated: options.onNodeCreated ?? (() => {}),
  };

  const peekable = new Peekable(tokens);
  const node = parseTokensRecursive(peekable, null, fullOptions);

  if (!node) return [];
  return node.id == null ? node.children : [node];
}

/**
 * Parse SGF string into node tree
 */
export function parse(contents: string, options: ParseOptions = {}): SGFNode[] {
  return parseTokens(tokenizeIter(contents), options);
}

/**
 * Convert SGFNode to GameTreeNode format (for @kaya/gametree compatibility)
 * Cleans up [object Object] strings in comments and ensures IDs are not null
 */
export function sgfNodeToGameTreeNode<T = SGFNodeData>(
  sgfNode: SGFNode,
  idCounter: { value: number } = { value: 0 },
  parentId: number | string | null = null,
  visited: Set<SGFNode> = new Set()
): GameTreeNodeRecursive<T> {
  // Prevent infinite recursion from circular references
  if (visited.has(sgfNode)) {
    throw new Error('SGF file contains circular references');
  }
  visited.add(sgfNode);

  const id = sgfNode.id ?? idCounter.value++;

  // Clean up data - remove [object Object] from comments
  const cleanedData: SGFNodeData = {};
  for (const [key, values] of Object.entries(sgfNode.data)) {
    if (Array.isArray(values)) {
      cleanedData[key] = values
        .map((val: any) => {
          if (typeof val === 'string') {
            // Remove [object Object] patterns
            const cleaned = val.replace(/\[object Object\\?\]/g, '').trim();
            // For move properties (B/W), preserve empty strings (pass moves)
            if ((key === 'B' || key === 'W') && cleaned === '' && val === '') {
              return '';
            }
            return cleaned;
          }
          return val;
        })
        .filter((val: string) => {
          // Keep empty strings for move properties (B/W) as they represent pass moves
          if (key === 'B' || key === 'W') {
            return true;
          }
          return val !== '';
        });
    }
  }

  return {
    id,
    data: cleanedData as T,
    parentId,
    children: sgfNode.children.map((child: SGFNode) =>
      sgfNodeToGameTreeNode<T>(child, idCounter, id, visited)
    ),
  };
}

/**
 * Extract game metadata from SGF root node
 */
export function extractGameInfo(rootNode: { data: SGFNodeData } | null): GameInfo {
  const defaultInfo: GameInfo = { boardSize: 19 };
  if (!rootNode) return defaultInfo;

  const { data } = rootNode;

  // Combine TM and OT for time control display
  let timeControl: string | undefined;
  if (data.TM?.[0]) {
    timeControl = data.TM[0];
    if (data.OT?.[0]) {
      timeControl += ` ${data.OT[0]}`;
    }
  } else if (data.OT?.[0]) {
    timeControl = data.OT[0];
  }

  return {
    playerBlack: data.PB?.[0],
    playerWhite: data.PW?.[0],
    rankBlack: data.BR?.[0],
    rankWhite: data.WR?.[0],
    gameName: data.GN?.[0],
    eventName: data.EV?.[0],
    komi: data.KM?.[0] ? parseFloat(data.KM[0]) : undefined,
    handicap: data.HA?.[0] ? parseInt(data.HA[0], 10) : undefined,
    boardSize: data.SZ?.[0] ? parseInt(data.SZ[0], 10) : 19,
    date: data.DT?.[0],
    result: data.RE?.[0],
    rules: data.RU?.[0],
    timeControl,
    place: data.PC?.[0],
  };
}

// ============================================================================
// Stringifier
// ============================================================================

/**
 * Convert SGF node tree to string
 */
export function stringify(
  nodeOrNodes: SGFNode | SGFNode[],
  options: StringifyOptions = {}
): string {
  const { linebreak = '\n', indent = '  ', level = 0 } = options;

  // Handle array of root nodes
  if (Array.isArray(nodeOrNodes)) {
    return stringify({ data: {}, id: null, parentId: null, children: nodeOrNodes }, options);
  }

  const node = nodeOrNodes;
  const output: string[] = [];
  const totalIndent = linebreak !== '' ? indent.repeat(level) : '';

  // Write node data (properties)
  if (node.data && Object.keys(node.data).length > 0) {
    output.push(totalIndent, ';');

    for (const id in node.data) {
      // Only uppercase properties
      if (id.toUpperCase() !== id) continue;

      output.push(id, '[', node.data[id].map(escapeString).join(']['), ']');
    }

    output.push(linebreak);
  }

  // Write children
  if (node.children.length > 1 || (node.children.length > 0 && level === 0)) {
    output.push(totalIndent);

    for (const child of node.children) {
      output.push(
        '(',
        linebreak,
        stringify(child, { linebreak, indent, level: level + 1 }),
        totalIndent,
        ')'
      );
    }

    output.push(linebreak);
  } else if (node.children.length === 1) {
    output.push(stringify(node.children[0], { linebreak, indent, level }));
  }

  return output.join('');
}
