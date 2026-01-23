# @kaya/sgf

SGF (Smart Game Format) parser and stringifier for Go games. Converted from [@sabaki/sgf](https://github.com/SabakiHQ/sgf) to TypeScript for the Kaya project.

## Features

- ✅ **Parse SGF files** - Convert SGF text to node tree structure
- ✅ **Stringify to SGF** - Convert node tree back to SGF format
- ✅ **Helper functions** - Vertex parsing, date handling, string escaping
- ✅ **Tokenizer** - Low-level SGF lexical analysis
- ✅ **TypeScript** - Full type safety with strict mode
- ✅ **Zero dependencies** - Standalone implementation

## Installation

```bash
# In the Kaya monorepo, this is already configured
# For external use:
bun add @kaya/sgf
```

## Usage

### Basic Parsing and Stringifying

```typescript
import * as sgf from '@kaya/sgf';

// Parse SGF string
const nodes = sgf.parse('(;B[dd];W[dp])');
console.log(nodes); // Array of SGFNode

// Stringify back to SGF
const sgfText = sgf.stringify(nodes);
console.log(sgfText); // "(;B[dd];W[dp])"
```

### Node Structure

SGF nodes follow this structure:

```typescript
interface SGFNode {
  id: number | string | null;
  data: {
    [property: string]: string[]; // e.g., { B: ["dd"], C: ["comment"] }
  };
  parentId: number | string | null;
  children: SGFNode[];
}
```

### Helper Functions

```typescript
// Vertex parsing
const [x, y] = sgf.parseVertex('dd'); // [3, 3]
const vertex = sgf.stringifyVertex([3, 3]); // "dd"

// Compressed vertices (rectangles)
const vertices = sgf.parseCompressedVertices('aa:cc');
// Returns [[0,0], [0,1], [0,2], [1,0], [1,1], [1,2], [2,0], [2,1], [2,2]]

// String escaping
const escaped = sgf.escapeString('hello]world'); // "hello\]world"
const unescaped = sgf.unescapeString('hello\\]world'); // "hello]world"

// Date parsing
const dates = sgf.parseDates('1996-12-27,28,1997-01-03');
// [[1996, 12, 27], [1996, 12, 28], [1997, 1, 3]]
const dateStr = sgf.stringifyDates(dates); // "1996-12-27,28,1997-01-03"
```

### Advanced: Custom ID Generation

```typescript
// For integration with @kaya/gametree
let idCounter = 0;
const getId = () => idCounter++;

const nodes = sgf.parse(content, {
  getId,
  onProgress: ({ progress }) => console.log(`Parsing: ${progress * 100}%`),
  onNodeCreated: ({ node }) => console.log('Node created:', node.id),
});
```

### Tokenization

```typescript
// Low-level tokenization
const tokens = sgf.tokenize('(;B[aa])');
tokens.forEach(token => {
  console.log(token.type, token.value); // e.g., "parenthesis", "("
});
```

## API Reference

### Parsing

- **`parse(contents: string, options?: ParseOptions): SGFNode[]`**  
  Parse SGF string into node tree

- **`parseTokens(tokens: Iterable<Token>, options?: ParseOptions): SGFNode[]`**  
  Parse from tokens (advanced)

- **`tokenize(contents: string): Token[]`**  
  Tokenize SGF string

- **`tokenizeIter(contents: string): Generator<Token>`**  
  Tokenize lazily with generator

### Stringifying

- **`stringify(nodes: SGFNode | SGFNode[], options?: StringifyOptions): string`**  
  Convert node tree to SGF string

### Helper Functions

- **`parseVertex(input: string): [number, number]`**  
  Parse SGF point (e.g., "dd") to coordinates

- **`stringifyVertex(vertex: [number, number]): string`**  
  Convert coordinates to SGF point

- **`parseCompressedVertices(input: string): Array<[number, number]>`**  
  Parse rectangle notation (e.g., "aa:cc")

- **`parseDates(input: string): number[][]`**  
  Parse SGF date string

- **`stringifyDates(dates: number[][]): string`**  
  Convert dates to SGF format

- **`escapeString(input: string): string`**  
  Escape backslashes and brackets

- **`unescapeString(input: string): string`**  
  Unescape SGF strings

## Types

```typescript
export interface SGFNode {
  id: number | string | null;
  data: SGFNodeData;
  parentId: number | string | null;
  children: SGFNode[];
}

export interface ParseOptions {
  getId?: () => number | string;
  dictionary?: { [id: string]: SGFNode } | null;
  onProgress?: (args: { progress: number }) => void;
  onNodeCreated?: (args: { node: SGFNode }) => void;
}

export interface StringifyOptions {
  linebreak?: string; // default: "\n"
  indent?: string; // default: "  "
  level?: number; // internal use
}

export type Vertex = [number, number];
```

## Compatibility

This package is fully compatible with [@sabaki/immutable-gametree](https://github.com/SabakiHQ/immutable-gametree) for game tree manipulation.

## Development

```bash
# Type check
bun run type-check

# Build
bun run build

# Run tests
bun run tests/test-sgf.ts
```

## Project Structure

```
packages/sgf/
├── src/
│   └── index.ts          # Main implementation
├── tests/
│   ├── README.md         # Test documentation
│   └── test-sgf.ts       # Test suite
├── __debug__/            # Debug files (gitignored)
│   └── debug-roundtrip.ts
├── README.md             # This file
└── package.json
```

## License

AGPL-3.0 - Converted from [@sabaki/sgf](https://github.com/SabakiHQ/sgf) (MIT) with gratitude to the Sabaki team.
