
import { createBoard, getAIMove, attemptMove } from './utils/goLogic';

const runTest = () => {
  const size = 15;
  let board = createBoard(size);

  // Test 1: Block a simple 3 (Open 3)
  console.log("Test 1: Opponent has open 3. AI (White) should block.");
  // Black at (7,7), (8,7), (9,7)
  board[7][7] = { color: 'black', x: 7, y: 7, id: '1' };
  board[7][8] = { color: 'black', x: 8, y: 7, id: '2' };
  board[7][9] = { color: 'black', x: 9, y: 7, id: '3' };
  
  // AI is White
  const move = getAIMove(board, 'white', 'Gomoku', 'Hard', null);
  console.log('AI Move:', move);
  
  if (move && (move.x === 6 || move.x === 10) && move.y === 7) {
      console.log("SUCCESS: Blocked open 3");
  } else {
      console.log("FAILURE: Did not block open 3");
  }

  // Test 2: Win if has 4
  console.log("\nTest 2: AI has 4. AI should win.");
  board = createBoard(size);
  board[7][7] = { color: 'white', x: 7, y: 7, id: '1' };
  board[7][8] = { color: 'white', x: 8, y: 7, id: '2' };
  board[7][9] = { color: 'white', x: 9, y: 7, id: '3' };
  board[7][10] = { color: 'white', x: 10,y: 7, id: '4' };

  const winMove = getAIMove(board, 'white', 'Gomoku', 'Hard', null);
  console.log('AI Win Move:', winMove);
    if (winMove && (winMove.x === 6 || winMove.x === 11) && winMove.y === 7) {
      console.log("SUCCESS: Found winning move");
  } else {
      console.log("FAILURE: Missed winning move");
  }
};

runTest();
