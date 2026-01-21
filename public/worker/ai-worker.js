importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs/dist/tf.min.js');

// === 1. 极简围棋引擎 (Micro Go Engine) ===
class MicroBoard {
    constructor(size) {
        this.size = size;
        this.board = new Int8Array(size * size).fill(0); // 0:Empty, 1:Black, 2:White
        this.ko = -1; 
    }

    clone() {
        const newB = new MicroBoard(this.size);
        newB.board.set(this.board);
        newB.ko = this.ko;
        return newB;
    }

    get(x, y) { return this.board[y * this.size + x]; }
    set(x, y, c) { this.board[y * this.size + x] = c; }
    idx(x, y) { return y * this.size + x; }
    xy(idx) { return { x: idx % this.size, y: Math.floor(idx / this.size) }; }

    play(x, y, color) {
        if (x < 0 || x >= this.size || y < 0 || y >= this.size) return false;
        const idx = this.idx(x, y);
        if (this.board[idx] !== 0) return false;
        if (idx === this.ko) return false;

        const opponent = color === 1 ? 2 : 1;
        this.board[idx] = color;
        
        const neighbors = [idx-1, idx+1, idx-this.size, idx+this.size];
        let capturedCount = 0;
        let capturedStoneIdx = -1;
        const deadGroups = [];
        
        for (let nIdx of neighbors) {
            const nXY = this.xy(nIdx);
            const cXY = this.xy(idx);
            if (Math.abs(nXY.x - cXY.x) + Math.abs(nXY.y - cXY.y) !== 1) continue; 
            if (nIdx >= 0 && nIdx < this.board.length && this.board[nIdx] === opponent) {
                const group = this.getGroup(nIdx);
                if (group.liberties === 0) deadGroups.push(group.stones);
            }
        }

        for (let stones of deadGroups) {
            for (let sIdx of stones) {
                this.board[sIdx] = 0;
                capturedCount++;
                capturedStoneIdx = sIdx;
            }
        }

        const myGroup = this.getGroup(idx);
        if (myGroup.liberties === 0) {
            this.board[idx] = 0; 
            return false; 
        }

        if (capturedCount === 1 && myGroup.stones.length === 1) this.ko = capturedStoneIdx;
        else this.ko = -1;

        return true;
    }

    getGroup(startIdx) {
        const color = this.board[startIdx];
        const stack = [startIdx];
        const stones = new Set([startIdx]);
        let liberties = 0;
        const visitedLiberties = new Set();
        while(stack.length > 0) {
            const curr = stack.pop();
            const cXY = this.xy(curr);
            const neighbors = [curr-1, curr+1, curr-this.size, curr+this.size];
            for(let n of neighbors) {
                const nXY = this.xy(n);
                if (Math.abs(nXY.x - cXY.x) + Math.abs(nXY.y - cXY.y) !== 1) continue;
                if (n < 0 || n >= this.board.length) continue;
                const val = this.board[n];
                if (val === 0) {
                    if (!visitedLiberties.has(n)) { liberties++; visitedLiberties.add(n); }
                } else if (val === color && !stones.has(n)) {
                    stones.add(n); stack.push(n);
                }
            }
        }
        return { liberties, stones: Array.from(stones) };
    }
}

// === 2. AI 配置 ===
const MODEL_SIZE = 19; 
const INPUT_CHANNELS = 22; 
const MCTS_SIMULATIONS = 50; 

let model = null;
let isBusy = false;

// === 3. 定式库 ===
const OPENING_BOOK = {
    // 9路
    9: {
        0: [
            { x: 4, y: 4, weight: 100 }, // 天元
            { x: 2, y: 6, weight: 10 }, { x: 6, y: 2, weight: 10 }
        ],
        "4,4": [{ x: 2, y: 2, weight: 50 }, { x: 6, y: 6, weight: 50 }]
    },
    // 13路
    13: {
        0: [
            { x: 3, y: 3, weight: 50 }, { x: 9, y: 3, weight: 50 },
            { x: 3, y: 9, weight: 50 }, { x: 9, y: 9, weight: 50 },
            { x: 6, y: 6, weight: 80 }
        ]
    },
    // 19路
    19: {
        0: [
            { x: 15, y: 3, weight: 50 }, { x: 3, y: 15, weight: 50 },
            { x: 15, y: 15, weight: 50 }, { x: 3, y: 3, weight: 50 },
            { x: 16, y: 3, weight: 30 }, { x: 3, y: 16, weight: 30 }
        ]
    }
};

async function loadModel() {
    if (model) return;
    try {
        model = await tf.loadGraphModel('/models/model.json');
        postMessage({ type: 'init-complete' });
    } catch (e) {
        postMessage({ type: 'error', message: 'Model Load Error: ' + e.message });
    }
}

// === 4. MCTS 结构与特征 ===
class MCTSNode {
    constructor(parent = null, move = null, prior = 0) {
        this.parent = parent;
        this.move = move; 
        this.children = [];
        this.visits = 0;
        this.valueSum = 0;
        this.prior = prior; 
    }
    getScore(totalVisits) {
        if (this.visits === 0) return 10 + 100 * this.prior; 
        const Q = -this.valueSum / this.visits; 
        const U = 2.0 * this.prior * Math.sqrt(totalVisits) / (1 + this.visits); 
        return Q + U;
    }
}

function getLibertiesForFeatures(boardData, x, y, color, size) {
    const idx = y * size + x;
    const stack = [idx];
    const visited = new Set([idx]);
    let libs = 0;
    const visitedLibs = new Set();
    while(stack.length) {
        const p = stack.pop();
        const px = p % size, py = Math.floor(p / size);
        const neighbors = [];
        if(px>0) neighbors.push(p-1); if(px<size-1) neighbors.push(p+1);
        if(py>0) neighbors.push(p-size); if(py<size-1) neighbors.push(p+size);
        for(let n of neighbors) {
            if(boardData[n] === 0) { if(!visitedLibs.has(n)) { libs++; visitedLibs.add(n); } } 
            else if(boardData[n] === color && !visited.has(n)) { visited.add(n); stack.push(n); }
        }
    }
    return libs;
}

function generateTensorInput(microBoard, history, currentPlayer) {
    const realSize = microBoard.size;
    const offset = Math.floor((MODEL_SIZE - realSize) / 2);
    
    const features = new Float32Array(MODEL_SIZE * MODEL_SIZE * INPUT_CHANNELS).fill(0);
    const myColor = currentPlayer; 
    const opColor = currentPlayer === 1 ? 2 : 1;
    const logicalBoard = new Int8Array(MODEL_SIZE * MODEL_SIZE).fill(0);
    
    for(let y=0; y<realSize; y++) {
        for(let x=0; x<realSize; x++) {
            const val = microBoard.get(x, y);
            if (val !== 0) logicalBoard[(y+offset)*MODEL_SIZE + (x+offset)] = val;
        }
    }

    for(let i=0; i<MODEL_SIZE*MODEL_SIZE; i++) {
        const y = Math.floor(i / MODEL_SIZE), x = i % MODEL_SIZE;
        const pos = i * INPUT_CHANNELS;
        const stone = logicalBoard[i];
        features[pos] = 1.0; 
        if (stone === myColor) features[pos+1] = 1.0;
        if (stone === opColor) features[pos+2] = 1.0;
        if (stone !== 0) {
            const libs = getLibertiesForFeatures(logicalBoard, x, y, stone, MODEL_SIZE);
            if (libs === 1) features[pos+3] = 1.0;
            if (libs === 2) features[pos+4] = 1.0;
            if (libs >= 3) features[pos+5] = 1.0;
        }
    }
    
    if(history && history.length > 0) {
        const last = history[history.length-1];
        if (last && last.lastMove) {
            const lx = last.lastMove.x + offset, ly = last.lastMove.y + offset;
            if (lx >=0 && lx < MODEL_SIZE && ly >= 0 && ly < MODEL_SIZE) features[((ly*MODEL_SIZE)+lx)*INPUT_CHANNELS + 9] = 1.0;
        }
    }

    const globalInput = new Float32Array(19).fill(0);
    const selfKomi = (currentPlayer === 2 ? 7.5 : -7.5); 
    globalInput[5] = selfKomi / 20.0;
    return { features, globalInput, offset };
}

// === 5. MCTS 执行 ===

async function expandNode(node, board, history, color) {
    const { features, globalInput, offset } = generateTensorInput(board, history, color);
    
    const inputX = tf.tensor(features, [1, MODEL_SIZE * MODEL_SIZE, INPUT_CHANNELS]);
    const inputG = tf.tensor(globalInput, [1, 19]);

    const results = await model.executeAsync({
        "swa_model/bin_inputs": inputX,
        "swa_model/global_inputs": inputG
    });

    const rawPolicy = Array.isArray(results) ? results[1] : results;
    const rawValue = Array.isArray(results) ? results[2] : results;

    const policyProbs = tf.softmax(rawPolicy); 
    const policyData = await policyProbs.data();
    const valueData = await rawValue.data();
    
    inputX.dispose(); inputG.dispose(); policyProbs.dispose();
    if(Array.isArray(results)) results.forEach(r=>r.dispose()); else results.dispose();

    const value = valueData[0]; 

    const candidates = [];
    const size = board.size;
    
    for(let i=0; i<361; i++) {
        const my = Math.floor(i / MODEL_SIZE), mx = i % MODEL_SIZE;
        const ry = my - offset, rx = mx - offset;

        if (rx >= 0 && rx < size && ry >= 0 && ry < size) {
            if (board.get(rx, ry) === 0) {
                 candidates.push({ x: rx, y: ry, p: policyData[i] });
            }
        }
    }

    candidates.sort((a, b) => b.p - a.p);
    const topCandidates = candidates.slice(0, 30);
    node.children = topCandidates.map(c => new MCTSNode(node, {x: c.x, y: c.y}, c.p));

    return { value, scoreLead: valueData[2] * 20 };
}

function selectChild(node) {
    let best = null;
    let maxScore = -Infinity;
    if (node.children.length === 0) return null;
    for(let child of node.children) {
        const score = child.getScore(node.visits);
        if (score > maxScore) { maxScore = score; best = child; }
    }
    return best;
}

async function runMCTS(initialBoard, history, myColor, size) {
    // [定式检查]
    // 1. 查表 (9, 13, 19)
    if (history.length < 4 && OPENING_BOOK[size]) {
        let bookMoves = [];
        if (history.length === 0) {
            if (OPENING_BOOK[size][0]) bookMoves = OPENING_BOOK[size][0];
        } else if (history.length === 1) {
            const lastMove = history[0].lastMove;
            // 【关键修复】: 必须检查 lastMove 是否存在
            // 如果上一步是 Pass，lastMove 为 null，读取 .x 会报错
            if (lastMove) {
                const key = `${lastMove.x},${lastMove.y}`;
                if (OPENING_BOOK[size][key]) bookMoves = OPENING_BOOK[size][key];
            }
        }
        if (bookMoves.length > 0) {
            const totalWeight = bookMoves.reduce((sum, m) => sum + m.weight, 0);
            let randomVal = Math.random() * totalWeight;
            for (let move of bookMoves) {
                randomVal -= move.weight;
                if (randomVal <= 0) return { move: {x: move.x, y: move.y}, winRate: 50, scoreLead: 0 };
            }
        }
    }
    // 2. 泛化策略：对于所有小于 13 的奇数棋盘 (5, 7, 11)，第一手必下天元
    if (history.length === 0 && size < 13 && size % 2 !== 0 && !OPENING_BOOK[size]) {
        const center = Math.floor(size / 2);
        return { move: {x: center, y: center}, winRate: 55, scoreLead: 0 };
    }

    // [MCTS 开始]
    const rootBoard = new MicroBoard(size);
    for(let y=0; y<size; y++) {
        for(let x=0; x<size; x++) {
            if (initialBoard[y][x]) rootBoard.set(x, y, initialBoard[y][x].color === 'black' ? 1 : 2);
        }
    }
    const myColorVal = myColor === 'black' ? 1 : 2;
    const root = new MCTSNode(null, null, 0);

    const { scoreLead } = await expandNode(root, rootBoard, history, myColorVal);

    for(let i=0; i<MCTS_SIMULATIONS; i++) {
        let node = root;
        let simBoard = rootBoard.clone();
        let currColor = myColorVal;

        while(node.children.length > 0) {
            const nextNode = selectChild(node);
            if (!nextNode) break;
            node = nextNode;
            const success = simBoard.play(node.move.x, node.move.y, currColor);
            if (!success) { node.valueSum -= 100; break; }
            currColor = currColor === 1 ? 2 : 1;
        }

        if (node.visits > 0 && node.children.length === 0) {
             const { value } = await expandNode(node, simBoard, [], currColor);
             let backVal = value;
             let currNode = node;
             while(currNode) {
                 currNode.visits++;
                 currNode.valueSum += backVal;
                 backVal = -backVal;
                 currNode = currNode.parent;
             }
        } else {
             let currNode = node;
             while(currNode) { currNode.visits++; currNode = currNode.parent; }
        }
    }

    let bestChild = null;
    let maxVisits = -1;
    for (let child of root.children) {
        if (child.visits > maxVisits) { maxVisits = child.visits; bestChild = child; }
    }

    const winRate = (1 / (1 + Math.exp(-0.3 * scoreLead))) * 100;

    return {
        move: bestChild ? bestChild.move : null,
        winRate: winRate,
        scoreLead: scoreLead 
    };
}

onmessage = async function(e) {
    const { type, data } = e.data;
    if (type === 'init') { await loadModel(); return; }
    
    if (type === 'compute') {
        if (!model) await loadModel();
        if (isBusy) return;
        isBusy = true;
        try {
            const { board, history, color, size } = data;
            const result = await runMCTS(board, history, color, size);
            
            // 认输判断 (胜率 < 5% 且 手数 > 30)
            if (result.winRate < 5.0 && history.length > 30) {
                postMessage({ type: 'ai-resign', data: { winRate: result.winRate } });
                isBusy = false; return;
            }

            let finalMove = result.move;
            // 兜底随机落子
            if (!finalMove) {
                for(let y=0; y<size; y++) {
                    for(let x=0; x<size; x++) { if (!board[y][x]) { finalMove = {x, y}; break; } }
                    if(finalMove) break;
                }
            }

            postMessage({
                type: 'ai-response',
                data: {
                    move: finalMove,
                    winRate: Math.max(0.1, Math.min(99.9, result.winRate)),
                    scoreLead: result.scoreLead 
                }
            });
        } catch (err) {
            console.error(err);
            postMessage({ type: 'error', message: err.message });
        } finally {
            isBusy = false;
        }
    }
};