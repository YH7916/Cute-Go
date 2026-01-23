# @kaya/shudan

Go board rendering component for Kaya - minimal MVP implementation with extensible architecture.

## Overview

This package provides a React-based Go board component for rendering game positions, handling user interaction, and displaying coordinates. It's designed as a **minimal viable product** with a clean API that allows future expansion to full Shudan features.

## Features

### Current (MVP)

- ✅ Grid rendering with hoshi (star) points
- ✅ Stone rendering (black/white)
- ✅ Coordinate labels (A-T, 1-19)
- ✅ Click interaction handlers
- ✅ Partial board display (rangeX/Y)
- ✅ Customizable vertex size
- ✅ CSS theming with custom properties

### Future Expansion (Architecture Ready)

- 🔜 Markers (circle, square, triangle, cross, label)
- 🔜 Ghost stones (variation preview)
- 🔜 Paint map (territory overlay)
- 🔜 Heat map (analysis visualization)
- 🔜 Lines and arrows
- 🔜 Stone animations
- 🔜 Fuzzy stone placement
- 🔜 Selected/dimmed vertices

## Installation

This is an internal workspace package:

```json
{
  "dependencies": {
    "@kaya/shudan": "workspace:*"
  }
}
```

## Usage

### Basic Board

```tsx
import { Goban } from '@kaya/shudan';
import '@kaya/shudan/goban.css';

function App() {
  // Create empty 19x19 board
  const signMap = Array(19)
    .fill(null)
    .map(() => Array(19).fill(0));

  return <Goban vertexSize={32} signMap={signMap} showCoordinates={true} />;
}
```

### With Stones

```tsx
import { Goban } from '@kaya/shudan';
import type { SignMap } from '@kaya/shudan';

function GameBoard() {
  const signMap: SignMap = Array(19)
    .fill(null)
    .map(() => Array(19).fill(0));

  // Place some stones
  signMap[3][3] = 1; // Black stone at D4
  signMap[15][15] = -1; // White stone at Q16
  signMap[3][15] = 1; // Black stone at D16
  signMap[15][3] = -1; // White stone at Q4

  return <Goban vertexSize={28} signMap={signMap} showCoordinates={true} />;
}
```

### Interactive Board

```tsx
import { useState } from 'react';
import { Goban } from '@kaya/shudan';
import type { SignMap, Vertex } from '@kaya/shudan';

function InteractiveBoard() {
  const [signMap, setSignMap] = useState<SignMap>(
    Array(19)
      .fill(null)
      .map(() => Array(19).fill(0))
  );
  const [currentPlayer, setCurrentPlayer] = useState<1 | -1>(1);

  const handleVertexClick = (evt: React.MouseEvent, vertex: Vertex) => {
    const [x, y] = vertex;

    // Skip if already occupied
    if (signMap[y][x] !== 0) return;

    // Place stone
    const newSignMap = signMap.map(row => [...row]);
    newSignMap[y][x] = currentPlayer;
    setSignMap(newSignMap);

    // Switch player
    setCurrentPlayer(currentPlayer === 1 ? -1 : 1);
  };

  return (
    <Goban
      vertexSize={32}
      signMap={signMap}
      showCoordinates={true}
      onVertexClick={handleVertexClick}
    />
  );
}
```

### Integration with @kaya/goboard

```tsx
import { useState } from 'react';
import { Goban } from '@kaya/shudan';
import { GoBoard } from '@kaya/goboard';
import type { Vertex, Sign } from '@kaya/shudan';

function GoGame() {
  const [board, setBoard] = useState(() => GoBoard.fromDimensions(19));
  const [currentPlayer, setCurrentPlayer] = useState<Sign>(1);

  const handleVertexClick = (evt: React.MouseEvent, vertex: Vertex) => {
    try {
      // Validate and make move
      const newBoard = board.makeMove(currentPlayer, vertex);
      setBoard(newBoard);

      // Switch player
      setCurrentPlayer(currentPlayer === 1 ? -1 : 1);
    } catch (error) {
      // Invalid move (ko, suicide, occupied)
      console.log('Invalid move:', error);
    }
  };

  return (
    <div>
      <div>Current player: {currentPlayer === 1 ? 'Black' : 'White'}</div>
      <Goban
        vertexSize={32}
        signMap={board.signMap}
        showCoordinates={true}
        onVertexClick={handleVertexClick}
      />
    </div>
  );
}
```

### Partial Board Display

```tsx
<Goban
  vertexSize={40}
  signMap={signMap}
  rangeX={[6, 12]} // Show columns G-M
  rangeY={[6, 12]} // Show rows 7-13
  showCoordinates={true}
/>
```

### Custom Coordinates

```tsx
<Goban
  vertexSize={32}
  signMap={signMap}
  showCoordinates={true}
  coordX={x => String.fromCharCode(65 + x)} // A, B, C, D...
  coordY={y => y + 1} // 1, 2, 3, 4...
/>
```

## API Reference

### `<Goban>` Props

#### Board Configuration

- **`vertexSize`**: `number` (default: `24`)  
  Pixel size of each vertex/intersection

- **`signMap`**: `SignMap` (default: `[]`)  
  2D array representing board state. `signMap[y][x]` gives sign at position (x, y)
  - `1`: Black stone
  - `0`: Empty
  - `-1`: White stone

- **`showCoordinates`**: `boolean` (default: `false`)  
  Display coordinate labels (A-T, 1-19)

- **`coordX`**: `(x: number) => string | number`  
  Custom X coordinate formatter. Default: A-T (skipping I)

- **`coordY`**: `(y: number) => string | number`  
  Custom Y coordinate formatter. Default: 1-19 from bottom

- **`rangeX`**: `[start: number, end: number]`  
  Range of X coordinates to display (for partial boards)

- **`rangeY`**: `[start: number, end: number]`  
  Range of Y coordinates to display (for partial boards)

#### Interaction Handlers

- **`onVertexClick`**: `(evt: MouseEvent, vertex: Vertex) => void`  
  Called when a vertex is clicked

- **`onVertexMouseUp`**: `(evt: MouseEvent, vertex: Vertex) => void`  
  Called when mouse button is released on a vertex

- **`onVertexMouseDown`**: `(evt: MouseEvent, vertex: Vertex) => void`  
  Called when mouse button is pressed on a vertex

#### DOM Props

- **`id`**: `string`
- **`className`**: `string`
- **`style`**: `CSSProperties`

### Types

```typescript
// Vertex: [x, y] coordinates (0-indexed)
type Vertex = [x: number, y: number];

// Sign: Stone color or empty
type Sign = -1 | 0 | 1;

// SignMap: 2D board state
type SignMap = Sign[][];
```

## Theming

Customize colors using CSS custom properties:

```css
:root {
  --shudan-board-background-color: #daa520; /* Board color */
  --shudan-board-foreground-color: rgba(0, 0, 0, 0.7); /* Grid lines */
  --shudan-black-color: #000; /* Black stones */
  --shudan-white-color: #fff; /* White stones */
  --shudan-coord-color: rgba(0, 0, 0, 0.6); /* Coordinates */
}

/* Dark theme example */
.dark-theme {
  --shudan-board-background-color: #2c3e50;
  --shudan-board-foreground-color: rgba(255, 255, 255, 0.5);
  --shudan-coord-color: rgba(255, 255, 255, 0.6);
}
```

## Architecture Notes

### Extensibility

The component is designed for incremental feature expansion:

1. **Type definitions** include reserved props (commented out) for future features
2. **CSS classes** are prefixed with `shudan-` for consistency
3. **Reserved CSS classes** documented for markers, ghost stones, etc.
4. **Event handler pattern** is consistent and extensible

### Future Features

When implementing advanced Shudan features, follow this pattern:

```typescript
// 1. Uncomment reserved prop in GobanProps
export interface GobanProps {
  // ...existing props
  markerMap?: BoardMap<Marker>; // Uncomment when implementing
}

// 2. Add rendering logic in Goban component
// 3. Add styles to goban.css
// 4. Update README with examples
```

### Differences from Original Shudan

This MVP implementation differs from SabakiHQ/Shudan:

- **Framework**: React 18 (not Preact)
- **Scope**: Essential features only (no animations, markers, etc. yet)
- **Styling**: Inline styles + minimal CSS (not full CSS module)
- **Architecture**: Extensible foundation for gradual feature addition

## Development

```bash
# Type check
bun run --filter @kaya/shudan type-check

# Build
bun run --filter @kaya/shudan build

# Use in apps
cd apps/desktop
bun run tauri:dev
```

## License

MIT
