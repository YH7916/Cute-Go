# @kaya/gtp

GTP (Go Text Protocol) implementation for Kaya - minimal TypeScript library for KataGo communication.

## Overview

This package provides TypeScript implementations of GTP Command and Response parsing/serialization. It's based on [@sabaki/gtp](https://github.com/SabakiHQ/gtp) but simplified for TypeScript and Tauri integration.

**Current Status**: **Command/Response Parsing Only** ✅

Future expansion will include StreamController for full protocol handling.

## Features

### Current (MVP)

- ✅ Command parsing and serialization
- ✅ Response parsing and serialization
- ✅ TypeScript types for GTP protocol
- ✅ Full type safety

### Future Expansion

- 🔜 StreamController for async command/response handling
- 🔜 Event emitter for command-sent/response-received
- 🔜 Line-by-line subscriber support
- 🔜 Controller for process management (or integrate with Tauri)

## Installation

This is an internal workspace package:

```json
{
  "dependencies": {
    "@kaya/gtp": "workspace:*"
  }
}
```

## Usage

### Command Parsing

```typescript
import { parseCommand, stringifyCommand } from '@kaya/gtp';

// Parse GTP command strings
const cmd1 = parseCommand('quit');
// { id: null, name: 'quit', args: [] }

const cmd2 = parseCommand('43 list_commands');
// { id: 43, name: 'list_commands', args: [] }

const cmd3 = parseCommand('play B d4');
// { id: null, name: 'play', args: ['B', 'd4'] }

// Serialize commands
const cmdStr = stringifyCommand({ id: 5, name: 'genmove', args: ['B'] });
// '5 genmove B'
```

### Response Parsing

```typescript
import { parseResponse, stringifyResponse } from '@kaya/gtp';

// Parse GTP response strings
const res1 = parseResponse('=');
// { id: null, content: '', error: false }

const res2 = parseResponse('=43 ok');
// { id: 43, content: 'ok', error: false }

const res3 = parseResponse('?4 connection lost');
// { id: 4, content: 'connection lost', error: true }

const res4 = parseResponse('= D4\nmultiline content');
// { id: null, content: 'D4\nmultiline content', error: false }

// Serialize responses
const resStr = stringifyResponse({ id: 54, content: 'D4' });
// '=54 D4'

const errStr = stringifyResponse({ content: 'invalid move', error: true });
// '? invalid move'
```

### TypeScript Types

```typescript
import type { Command, Response } from '@kaya/gtp';

interface Command {
  id?: number | null;
  name: string;
  args?: string[];
}

interface Response {
  id?: number | null;
  content: string;
  error?: boolean;
}
```

## Integration with Tauri

For the Kaya desktop app, GTP engine communication will be handled by the Tauri backend:

```typescript
// Frontend (TypeScript)
import { invoke } from '@tauri-apps/api/core';
import { stringifyCommand, parseResponse } from '@kaya/gtp';

async function sendGTPCommand(command: Command): Promise<Response> {
  const cmdStr = stringifyCommand(command);
  const resStr = await invoke<string>('gtp_send_command', { command: cmdStr });
  return parseResponse(resStr);
}

// Example usage
const response = await sendGTPCommand({ name: 'genmove', args: ['B'] });
if (!response.error) {
  console.log('KataGo suggests:', response.content);
}
```

```rust
// Backend (Rust)
#[tauri::command]
async fn gtp_send_command(command: String) -> Result<String, String> {
    // Send command to KataGo process via stdin
    // Read response from stdout
    // Return GTP response string
}
```

## GTP Protocol Reference

### Command Format

```
[id] command_name [arg1] [arg2] ...
```

- `id`: Optional integer identifier
- `command_name`: Name of the command (e.g., 'genmove', 'play', 'quit')
- `args`: Space-separated arguments

### Response Format

Success:

```
=[id] content
```

Error:

```
?[id] error_message
```

- Responses start with `=` (success) or `?` (error)
- Optional `id` matches the command ID
- Content/error message follows
- Empty line marks end of response

### Common GTP Commands

**Standard GTP:**

- `protocol_version` - Get GTP protocol version
- `name` - Get engine name
- `version` - Get engine version
- `list_commands` - List supported commands
- `quit` - Shut down engine
- `boardsize <size>` - Set board size
- `clear_board` - Clear the board
- `komi <komi>` - Set komi
- `play <color> <vertex>` - Play a move
- `genmove <color>` - Generate a move
- `undo` - Undo last move

**KataGo Extensions:**

- `kata-analyze <interval> <maxMoves>` - Analyze position
- `kata-genmove_analyze <color> <interval> <maxMoves>` - Generate move with analysis
- `kata-set-rules <rules>` - Set Go rules variant

## API Reference

### `parseCommand(input: string): Command`

Parse a GTP command string.

**Parameters:**

- `input`: GTP command string

**Returns:** `Command` object

### `stringifyCommand(command: Command): string`

Serialize a Command object to GTP format.

**Parameters:**

- `command`: Command object

**Returns:** GTP command string

### `parseResponse(input: string): Response`

Parse a GTP response string.

**Parameters:**

- `input`: GTP response string

**Returns:** `Response` object

### `stringifyResponse(response: Response): string`

Serialize a Response object to GTP format.

**Parameters:**

- `response`: Response object

**Returns:** GTP response string

## Future: StreamController

The next iteration will include a `StreamController` class for managing async GTP communication:

```typescript
// Future API (not yet implemented)
import { StreamController } from '@kaya/gtp';

const controller = new StreamController(stdin, stdout);

// Send command and wait for response
const response = await controller.sendCommand({ name: 'genmove', args: ['B'] });

// Subscribe to line-by-line updates
controller.on('command-sent', ({ command, subscribe, getResponse }) => {
  subscribe(({ line, end }) => {
    console.log('Line:', line);
    if (end) console.log('Response complete');
  });
});
```

## Architecture Notes

### Why Minimal Implementation?

1. **Tauri Integration**: Process management is better handled by Tauri backend (Rust), not frontend
2. **Type Safety**: Focus on TypeScript types and parsing logic first
3. **Incremental Development**: Get basic parsing working, add StreamController later
4. **Testing**: Can test parsing/serialization independently

### Differences from @sabaki/gtp

- **Language**: TypeScript (not JavaScript)
- **Scope**: Parsing only (no StreamController/Controller yet)
- **Integration**: Designed for Tauri (process management in Rust backend)
- **Dependencies**: Zero dependencies (self-contained)

## Development

```bash
# Type check
bun run --filter @kaya/gtp type-check

# Build
bun run --filter @kaya/gtp build
```

## License

AGPL-3.0
