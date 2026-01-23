import type { SignMap, Vertex, Sign, GuessOptions, DeadstonesWasm } from './types';

// WASM module will be loaded asynchronously
let wasmModule: DeadstonesWasm | null = null;
let wasmPromise: Promise<DeadstonesWasm> | null = null;

/**
 * Load the WASM module
 * This is called automatically on first use
 */
async function loadWasm(): Promise<DeadstonesWasm> {
  if (wasmModule) {
    return wasmModule;
  }

  if (wasmPromise) {
    return wasmPromise;
  }

  wasmPromise = (async () => {
    // Import WASM module built by wasm-pack
    // Rsbuild handles the .wasm file loading
    const wasm = await import('../dist/wasm/deadstones.js');
    wasmModule = wasm as unknown as DeadstonesWasm;
    console.log('[@kaya/deadstones] ✅ Loaded Rust WASM module');
    return wasmModule;
  })();

  return wasmPromise;
}

/**
 * Convert 2D board array to flat array with width
 */
function parseBoard(data: SignMap): { flatData: Int8Array; width: number } {
  const flat = Int8Array.from(data.flat());
  const width = data.length > 0 ? data[0].length : 0;
  return { flatData: flat, width };
}

/**
 * Convert flat vertex indices to [x, y] coordinates
 */
function parseVertices(indices: Uint32Array, width: number): Vertex[] {
  return Array.from(indices).map(i => {
    const x = i % width;
    const y = (i - x) / width;
    return [x, y] as Vertex;
  });
}

/**
 * Convert flat array to 2D grid
 */
function parseGrid<T extends Int8Array | Float32Array>(values: T, width: number): number[][] {
  const height = values.length / width;
  return Array.from({ length: height }, (_, y) => {
    const start = y * width;
    return Array.from({ length: width }, (_, x) => values[start + x]);
  });
}

/**
 * Determine dead stones using Monte Carlo simulation
 *
 * @param data - Board data (2D array)
 * @param options - Configuration options
 * @returns Array of vertices that are likely dead
 *
 * @example
 * ```typescript
 * const board = [
 *   [0, 0, 1, 0, -1],
 *   [1, 0, 1, -1, -1],
 *   // ...
 * ];
 * const dead = await guess(board, { finished: true, iterations: 200 });
 * console.log('Dead stones:', dead);
 * ```
 */
export async function guess(data: SignMap, options: GuessOptions = {}): Promise<Vertex[]> {
  const wasm = await loadWasm();
  const { finished = false, iterations = 100 } = options;
  const { flatData, width } = parseBoard(data);
  const seed = Date.now();

  const indices = wasm.guess(flatData, width, finished, iterations, seed);
  return parseVertices(indices, width);
}

/**
 * Get probability map for territory control
 *
 * @param data - Board data (2D array)
 * @param iterations - Number of random playthroughs
 * @returns 2D array of probabilities (-1 to 1, negative = white, positive = black)
 *
 * @example
 * ```typescript
 * const probMap = await getProbabilityMap(board, 100);
 * // probMap[y][x] closer to -1 means white territory
 * // probMap[y][x] closer to 1 means black territory
 * ```
 */
export async function getProbabilityMap(data: SignMap, iterations: number): Promise<number[][]> {
  const wasm = await loadWasm();
  const { flatData, width } = parseBoard(data);
  const seed = Date.now();

  const values = wasm.getProbabilityMap(flatData, width, iterations, seed);
  return parseGrid(values, width);
}

/**
 * Play random moves until the game ends
 *
 * @param data - Board data (2D array)
 * @param sign - Starting player (-1 for white, 1 for black)
 * @returns Final board state with all empty spaces filled
 *
 * @example
 * ```typescript
 * const finalBoard = await playTillEnd(board, 1); // Black starts
 * // All empty spaces are now filled
 * ```
 */
export async function playTillEnd(data: SignMap, sign: Sign): Promise<SignMap> {
  const wasm = await loadWasm();
  const { flatData, width } = parseBoard(data);
  const seed = Date.now();

  const values = wasm.playTillEnd(flatData, width, sign, seed);
  return parseGrid(values, width);
}

/**
 * Fast detection of floating stones
 *
 * Returns stones that are inside enemy territory and don't surround
 * more than one point of territory themselves
 *
 * @param data - Board data (2D array)
 * @returns Array of vertices of floating stones
 *
 * @example
 * ```typescript
 * const floating = await getFloatingStones(board);
 * console.log('Floating stones:', floating);
 * ```
 */
export async function getFloatingStones(data: SignMap): Promise<Vertex[]> {
  const wasm = await loadWasm();
  const { flatData, width } = parseBoard(data);

  const indices = wasm.getFloatingStones(flatData, width);
  return parseVertices(indices, width);
}

// Re-export types
export type { SignMap, Vertex, Sign, GuessOptions };
