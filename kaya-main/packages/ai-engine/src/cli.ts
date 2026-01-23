#!/usr/bin/env bun

import { readFileSync } from 'fs';
import { OnnxEngine } from './index';
import { analyzeSGF } from './analyze';
import { formatWinRate, formatScoreLead, getPlayerName } from './analysis-utils';
import type { MoveSuggestion } from './types';

async function main() {
  // Get command line arguments
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');
  const filteredArgs = args.filter(arg => arg !== '--json');

  const sgfFile = filteredArgs[0];
  const modelFile = filteredArgs[1];
  const moveNumberArg = filteredArgs[2]; // Optional: move number to analyze

  if (!sgfFile || !modelFile) {
    if (!jsonOutput) {
      console.error('Usage: bun run analyze <sgf-file> <model-file> [move-number]');
    }
    process.exit(1);
  }

  if (!jsonOutput) {
    console.log('🧪 KataGo Analysis (ONNX)');
    console.log('');
  }

  // Read SGF file
  if (!jsonOutput) console.log(`📖 Reading SGF file: ${sgfFile}`);
  const sgfContent = readFileSync(sgfFile, 'utf-8');

  // Read Model file
  if (!jsonOutput) console.log(`📦 Reading Model file: ${modelFile}`);
  const modelBuffer = readFileSync(modelFile);

  // Initialize engine
  if (!jsonOutput) console.log('🧠 Initializing ONNX engine...');
  const engine = new OnnxEngine({
    maxMoves: 10,
    modelBuffer: modelBuffer.buffer as ArrayBuffer,
  });

  try {
    await engine.initialize();
  } catch (error) {
    console.error('❌ Failed to initialize engine:', error);
    process.exit(1);
  }

  if (!jsonOutput) console.log('');

  // Parse move number argument
  let targetMove: number | undefined;
  if (moveNumberArg) {
    targetMove = parseInt(moveNumberArg, 10);
    if (isNaN(targetMove) || targetMove < 0) {
      console.error(`❌ Invalid move number: ${moveNumberArg}`);
      process.exit(1);
    }
  }

  // Analyze position
  if (!jsonOutput) {
    console.log('🤖 Analyzing position...');
    console.log('');
  }

  let result;
  try {
    result = await analyzeSGF(engine, sgfContent, {
      moveNumber: targetMove,
      maxMoves: 10,
    });
  } catch (error) {
    console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  const { file, analysis } = result;
  const { processed, boardInfo } = analysis;
  const currentPlayer = getPlayerName(analysis.currentTurn);
  const opponent = getPlayerName(analysis.currentTurn === 'B' ? 'W' : 'B');
  const leadingPlayer = getPlayerName(processed.leadingPlayer);

  // JSON output
  if (jsonOutput) {
    const jsonResult = {
      file: sgfFile,
      boardSize: file.boardSize,
      totalMoves: file.totalMoves,
      analyzedMove: file.analyzedMove,
      stonesOnBoard: boardInfo.moveCount,
      currentTurn: analysis.currentTurn,
      analysis: {
        winRate: {
          black: processed.blackWinRate,
          white: processed.whiteWinRate,
        },
        scoreLead: {
          black: processed.blackScoreLead,
          white: processed.whiteScoreLead,
        },
        moveSuggestions: analysis.moveSuggestions.map((move: MoveSuggestion) => ({
          move: move.move,
          probability: move.probability,
        })),
      },
    };
    console.log(JSON.stringify(jsonResult, null, 2));
    return;
  }

  // Human-readable output
  console.log('📊 Analysis Results');
  console.log('='.repeat(70));
  console.log(
    `Position: Move ${file.analyzedMove} of ${file.totalMoves} (${boardInfo.moveCount} stones on board)`
  );
  console.log(`Board size: ${file.boardSize}x${file.boardSize}`);
  console.log(`Current turn: ${currentPlayer}`);
  console.log('');
  console.log(`Win rate for Black ⚫: ${formatWinRate(processed.blackWinRate)}`);
  console.log(`Win rate for White ⚪: ${formatWinRate(processed.whiteWinRate)}`);
  console.log('');
  console.log(
    `Score estimate: ${leadingPlayer} leading by ${processed.leadAmount.toFixed(1)} points`
  );
  console.log(
    `   (Black: ${formatScoreLead(processed.blackScoreLead)}, White: ${formatScoreLead(processed.whiteScoreLead)})`
  );
  console.log('');

  console.log(`Top move suggestions for ${currentPlayer}:`);
  console.log('-'.repeat(70));
  console.log("Probability: Neural network's move probability");
  console.log('');
  console.log(' #  Move        Probability');
  console.log('-'.repeat(70));

  analysis.moveSuggestions.forEach((move: MoveSuggestion, index: number) => {
    const num = `${index + 1}.`.padEnd(4);
    const moveStr = move.move.padEnd(10);
    const probStr = `${(move.probability * 100).toFixed(1)}%`.padEnd(10);

    console.log(`${num} ${moveStr} ${probStr}`);
  });

  console.log('='.repeat(70));
  console.log('');
  console.log('✅ Analysis complete using TensorFlow.js neural network!');
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
