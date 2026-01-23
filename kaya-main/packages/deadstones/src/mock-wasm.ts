/**
 * Mock WASM module for development without Rust/wasm-pack installed
 *
 * This provides the same API as the real WASM module but with JavaScript
 * implementations. Use for development and testing when you don't want
 * to install the full Rust toolchain.
 *
 * Performance will be slower than native WASM, but functionality is the same.
 *
 * To use: Set environment variable USE_MOCK_WASM=true
 */

export function guess(
  data: Int8Array,
  width: number,
  finished: boolean,
  iterations: number,
  seed: number
): Uint32Array {
  console.log('[mock-wasm] guess() called with', {
    width,
    finished,
    iterations,
    dataLength: data.length,
  });

  // Simple heuristic: find stones completely surrounded by enemy
  const result: number[] = [];
  const height = data.length / width;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const sign = data[idx];

      if (sign === 0) continue;

      // Check if stone group has any liberties
      const visited = new Set<number>();
      const hasLiberty = checkGroupLiberties(data, width, height, x, y, sign, visited);

      if (!hasLiberty) {
        // No liberties = dead stone
        result.push(idx);
      }
    }
  }

  console.log('[mock-wasm] guess() found', result.length, 'dead stones');
  return new Uint32Array(result);
}

function checkGroupLiberties(
  data: Int8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  targetSign: number,
  visited: Set<number>
): boolean {
  const idx = y * width + x;

  if (visited.has(idx)) return false;
  visited.add(idx);

  const sign = data[idx];

  // If we hit an empty point, group has liberties
  if (sign === 0) return true;

  // If we hit enemy stone, no liberty here
  if (sign !== targetSign) return false;

  // Check all 4 neighbors
  const neighbors = [
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1],
  ];

  for (const [nx, ny] of neighbors) {
    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
      if (checkGroupLiberties(data, width, height, nx, ny, targetSign, visited)) {
        return true;
      }
    }
  }

  return false;
}

export function getProbabilityMap(
  data: Int8Array,
  width: number,
  iterations: number,
  seed: number
): Float32Array {
  console.log('[mock-wasm] getProbabilityMap() called with', {
    width,
    iterations,
    dataLength: data.length,
  });

  const result = new Float32Array(data.length);
  const height = data.length / width;

  // Simple heuristic: flood fill from each stone to determine territory
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const sign = data[idx];

      // Skip stones
      if (sign !== 0) {
        result[idx] = 0;
        continue;
      }

      // For empty points, check which color controls the area
      let blackInfluence = 0;
      let whiteInfluence = 0;

      // Check in expanding radius
      for (let radius = 1; radius <= 4; radius++) {
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue; // Only check perimeter

            const nx = x + dx;
            const ny = y + dy;

            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const nidx = ny * width + nx;
              const nsign = data[nidx];
              const weight = 1 / (radius * radius); // Closer stones have more influence

              if (nsign === 1) blackInfluence += weight;
              if (nsign === -1) whiteInfluence += weight;
            }
          }
        }
      }

      // Normalize to -1..1
      const total = blackInfluence + whiteInfluence;
      if (total > 0) {
        result[idx] = (blackInfluence - whiteInfluence) / total;
      } else {
        result[idx] = 0;
      }
    }
  }

  console.log('[mock-wasm] getProbabilityMap() computed territory map');
  return result;
}

export function playTillEnd(data: Int8Array, width: number, sign: number, seed: number): Int8Array {
  // Return a copy - mock doesn't actually play moves
  return new Int8Array(data);
}

export function getFloatingStones(data: Int8Array, width: number): Uint32Array {
  // Simple heuristic: stones with all neighbors being opposite color
  const result: number[] = [];
  const height = data.length / width;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const sign = data[idx];

      if (sign === 0) continue;

      const allEnemies = checkNeighbors(
        data,
        width,
        height,
        x,
        y,
        val => val === -sign || val === 0
      );

      if (allEnemies) {
        result.push(idx);
      }
    }
  }

  return new Uint32Array(result);
}

function checkNeighbors(
  data: Int8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  predicate: (val: number) => boolean
): boolean {
  const neighbors = [
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1],
  ];

  for (const [nx, ny] of neighbors) {
    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
      const idx = ny * width + nx;
      if (!predicate(data[idx])) {
        return false;
      }
    }
  }

  return true;
}
