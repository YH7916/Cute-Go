importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs/dist/tf.min.js');

// === 1. 极简围棋引擎 (Micro Go Engine) ===
class MicroBoard {
    constructor(size) {
        this.size = size;
        this.board = new Int8Array(size * size).fill(0); // 0:Empty, 1:Black, 2:White
        this.ko = -1; // 劫争点索引
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

    // [新增] 纯判断：这步棋是否符合围棋规则（不修改棋盘）
    isLegal(x, y, color) {
        const idx = this.idx(x, y);
        
        // 1. 基础检查
        if (x < 0 || x >= this.size || y < 0 || y >= this.size) return false;
        if (this.board[idx] !== 0) return false;
        if (idx === this.ko) return false; // 打劫禁入

        const opponent = color === 1 ? 2 : 1;
        const neighbors = [idx-1, idx+1, idx-this.size, idx+this.size];
        
        let wouldCapture = false;
        
        // 2. 检查是否提子
        // 这是一个轻量级检查，为了性能不做全盘拷贝，而是检查邻居的气
        for (let nIdx of neighbors) {
            const nXY = this.xy(nIdx);
            const cXY = this.xy(idx);
            // 边界检查
            if (Math.abs(nXY.x - cXY.x) + Math.abs(nXY.y - cXY.y) !== 1) continue;
            
            if (nIdx >= 0 && nIdx < this.board.length && this.board[nIdx] === opponent) {
                // 如果对手这块棋只有1口气，而我又填住了这口气 -> 提子 -> 合法
                if (this.getLibertiesCount(nIdx) === 1) {
                    wouldCapture = true;
                    break; // 只要能提子，就不可能是自杀，直接合法
                }
            }
        }

        if (wouldCapture) return true;

        // 3. 检查自杀 (Suicide)
        // 如果没提子，自己必须有气，或者能连接到有气的队友
        // 简单的自杀预判：假设放上去，看有没有气
        // 为了准确，这里需要做一个临时的虚拟落子（不污染当前 board）
        // 由于 JS 单线程，我们可以临时修改再回退，比 clone 快
        this.board[idx] = color;
        const liberties = this.getLibertiesCount(idx);
        this.board[idx] = 0; // 恢复

        if (liberties === 0) return false; // 自杀禁入

        return true;
    }

    // 快速算气 (仅返回数量)
    getLibertiesCount(startIdx) {
        const color = this.board[startIdx];
        const stack = [startIdx];
        const visited = new Set([startIdx]);
        let libs = 0;
        const visitedLibs = new Set();

        while(stack.length > 0) {
            const curr = stack.pop();
            const neighbors = [curr-1, curr+1, curr-this.size, curr+this.size];
            const cXY = this.xy(curr);

            for(let n of neighbors) {
                const nXY = this.xy(n);
                if (Math.abs(nXY.x - cXY.x) + Math.abs(nXY.y - cXY.y) !== 1) continue;
                if (n < 0 || n >= this.board.length) continue;

                const val = this.board[n];
                if (val === 0) {
                    if (!visitedLibs.has(n)) { libs++; visitedLibs.add(n); }
                } else if (val === color && !visited.has(n)) {
                    visited.add(n); stack.push(n);
                }
            }
        }
        return libs;
    }

    // 检查并返回提子数量 (用于 Heuristics)
    checkCapture(x, y, color) {
        if (!this.isLegal(x, y, color)) return 0; // 如果非法，自然提不了子(或者是自杀)
        
        const idx = this.idx(x, y);
        const opponent = color === 1 ? 2 : 1;
        const neighbors = [idx-1, idx+1, idx-this.size, idx+this.size];
        let capturedCount = 0;

        for (let nIdx of neighbors) {
            const nXY = this.xy(nIdx);
            const cXY = this.xy(idx);
            if (Math.abs(nXY.x - cXY.x) + Math.abs(nXY.y - cXY.y) !== 1) continue;
            
            if (nIdx >= 0 && nIdx < this.board.length && this.board[nIdx] === opponent) {
                if (this.getLibertiesCount(nIdx) === 1) {
                    // 粗略估算：这里只算连通块的数量，实际上应该算具体子数
                    // 但为了性能，只要能提，就给高分
                    capturedCount += 1; 
                }
            }
        }
        return capturedCount;
    }

    // 执行落子 (状态更新)
    play(x, y, color) {
        // 在 play 内部再次检查合法性
        if (!this.isLegal(x, y, color)) return false;

        const idx = this.idx(x, y);
        const opponent = color === 1 ? 2 : 1;
        this.board[idx] = color;
        
        const neighbors = [idx-1, idx+1, idx-this.size, idx+this.size];
        let capturedCount = 0;
        let capturedStoneIdx = -1;
        const deadGroups = [];
        
        // 提子执行
        for (let nIdx of neighbors) {
            const nXY = this.xy(nIdx);
            const cXY = this.xy(idx);
            if (Math.abs(nXY.x - cXY.x) + Math.abs(nXY.y - cXY.y) !== 1) continue; 
            if (nIdx >= 0 && nIdx < this.board.length && this.board[nIdx] === opponent) {
                // 这里为了准确提子，需要获取 Group 详情
                const groupInfo = this.getGroupInfo(nIdx);
                if (groupInfo.liberties === 0) deadGroups.push(groupInfo.stones);
            }
        }

        for (let stones of deadGroups) {
            for (let sIdx of stones) {
                this.board[sIdx] = 0;
                capturedCount += 1; // 修正：按子数计算
                capturedStoneIdx = sIdx;
            }
        }

        // 更新劫 (Ko)
        if (capturedCount === 1 && deadGroups.length === 1 && this.getLibertiesCount(idx) === 1) {
             // 简单的打劫判断：提一子，且自己只剩一气
             // 这里稍微简化了，但也够用了
             this.ko = capturedStoneIdx;
        } else {
             this.ko = -1;
        }

        return true;
    }

    getGroupInfo(startIdx) {
        const color = this.board[startIdx];
        const stack = [startIdx];
        const stones = new Set([startIdx]);
        let liberties = 0;
        const visitedLibs = new Set();
        while(stack.length > 0) {
            const curr = stack.pop();
            const neighbors = [curr-1, curr+1, curr-this.size, curr+this.size];
            const cXY = this.xy(curr);
            for(let n of neighbors) {
                const nXY = this.xy(n);
                if (Math.abs(nXY.x - cXY.x) + Math.abs(nXY.y - cXY.y) !== 1) continue;
                if (n < 0 || n >= this.board.length) continue;
                const val = this.board[n];
                if (val === 0) {
                    if (!visitedLibs.has(n)) { liberties++; visitedLibs.add(n); }
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
let stopRequested = false;

// === 3. 定式库 ===
const OPENING_BOOK = {
    9: {
        0: [{ x: 4, y: 4, weight: 100 }],
        "4,4": [{ x: 2, y: 2, weight: 50 }, { x: 6, y: 6, weight: 50 }, { x: 2, y: 6, weight: 50 }, { x: 6, y: 2, weight: 50 }],
        "2,2": [{ x: 4, y: 4, weight: 90 }, { x: 6, y: 6, weight: 30 }],
        "6,2": [{ x: 4, y: 4, weight: 90 }, { x: 2, y: 6, weight: 30 }],
        "2,6": [{ x: 4, y: 4, weight: 90 }, { x: 6, y: 2, weight: 30 }],
        "6,6": [{ x: 4, y: 4, weight: 90 }, { x: 2, y: 2, weight: 30 }]
    },
    13: {
        0: [{ x: 6, y: 6, weight: 80 }, { x: 3, y: 3, weight: 50 }]
    }
};

// [修改] 接收 modelPath 参数
async function loadModel(modelPath) {
    if (model) return;
    try {
        // 如果主线程没传，就用默认值（兜底），但主要靠传参
        const path = modelPath || 'models/model.json';
        console.log("[Worker] Loading model from:", path);
        
        // 使用传入的动态路径加载
        model = await tf.loadGraphModel(path);
        
        postMessage({ type: 'init-complete' });
    } catch (e) {
        console.error("[Worker] Model Load Error:", e);
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

    // 简易算气用于特征
    function simpleLibs(idx, color, board) {
        let l=0; let visited=new Set(); let q=[idx]; visited.add(idx); let counted=new Set();
        while(q.length){
            let p=q.pop(); let nbs=[p-1,p+1,p-19,p+19];
            for(let n of nbs){
                if(n<0||n>=361)continue; 
                if(board[n]===0){if(!counted.has(n)){l++;counted.add(n);}}
                else if(board[n]===color && !visited.has(n)){visited.add(n);q.push(n);}
            }
        }
        return l;
    }

    for(let i=0; i<MODEL_SIZE*MODEL_SIZE; i++) {
        const stone = logicalBoard[i];
        const pos = i * INPUT_CHANNELS;
        features[pos] = 1.0; 
        if (stone === myColor) features[pos+1] = 1.0;
        if (stone === opColor) features[pos+2] = 1.0;
        if (stone !== 0) {
            const libs = simpleLibs(i, stone, logicalBoard);
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

// === 5. 混合启发式评估 ===
function heuristicEval(board, x, y, color, size, historyLength) {
    // 1. 战术检查：提子 (Capture)
    // 这是一个巨大的加分项，保证 AI 只要能吃子，就会去吃
    const captured = board.checkCapture(x, y, color);
    if (captured > 0) {
        return 10.0 + captured * 2.0; 
    }

    // 2. 位置评分
    const center = (size - 1) / 2;
    const distToCenter = Math.abs(x - center) + Math.abs(y - center);
    let score = 1.0;

    // 3. 边缘惩罚 (布局阶段)
    if (historyLength < 30) {
        const dX = Math.min(x, size - 1 - x);
        const dY = Math.min(y, size - 1 - y);
        const minEdge = Math.min(dX, dY);

        if (minEdge === 0) {
            score = 0.01; // 死亡线
        } else if (minEdge === 1) {
            const isCorner = (dX === 1 && dY === 1);
            if (!isCorner) score = 0.4; // 二路爬
            else score = 1.2; // 3-3点
        } else {
            score += (Math.max(0, 4 - distToCenter) * 0.1); // 中腹
        }
    }
    return score;
}

// === 6. MCTS 执行 ===
async function expandNode(node, board, history, color) {
    const { features, globalInput, offset } = generateTensorInput(board, history, color);
    let policyData, valueData;
    
    try {
        const inputX = tf.tensor(features, [1, MODEL_SIZE * MODEL_SIZE, INPUT_CHANNELS]);
        const inputG = tf.tensor(globalInput, [1, 19]);
        const results = await model.executeAsync({
            "swa_model/bin_inputs": inputX, "swa_model/global_inputs": inputG
        });
        const rawPolicy = Array.isArray(results) ? results[1] : results;
        const rawValue = Array.isArray(results) ? results[2] : results;
        const policyProbs = tf.softmax(rawPolicy); 
        policyData = await policyProbs.data();
        valueData = await rawValue.data();
        inputX.dispose(); inputG.dispose(); policyProbs.dispose();
        if(Array.isArray(results)) results.forEach(r=>r.dispose()); else results.dispose();
    } catch (e) {
        console.error("Model exec error", e);
        return { value: 0, scoreLead: 0 };
    }

    const value = valueData[0]; 
    const candidates = [];
    const size = board.size;

    for(let i=0; i<361; i++) {
        const my = Math.floor(i / MODEL_SIZE), mx = i % MODEL_SIZE;
        const ry = my - offset, rx = mx - offset;

        // 边界检查
        if (rx >= 0 && rx < size && ry >= 0 && ry < size) {
            // 【关键修改】: 在生成候选点时，直接检查 isLegal
            // 如果 MicroBoard 说这步棋非法（自杀/打劫），直接跳过
            // 这样就能保证选出来的 Top-K 全部都是合法的
            if (board.isLegal(rx, ry, color)) {
                 let p = policyData[i];
                 
                 // 应用启发式
                 const hScore = heuristicEval(board, rx, ry, color, size, history.length);
                 p = p * hScore;

                 candidates.push({ x: rx, y: ry, p: p });
            }
        }
    }

    // 兜底：如果所有候选都被过滤了（极罕见，比如全盘只剩单官且全是劫材）
    // 强制寻找任何一个合法点
    if (candidates.length === 0) {
        for(let y=0; y<size; y++) {
            for(let x=0; x<size; x++) {
                if(board.isLegal(x, y, color)) {
                    candidates.push({x,y,p:0.01});
                }
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
    stopRequested = false;
    // 1. 定式与开局逻辑
    if (history.length < 4 && OPENING_BOOK[size]) {
        let bookMoves = [];
        if (history.length === 0 && OPENING_BOOK[size][0]) {
             bookMoves = OPENING_BOOK[size][0];
        } else if (history.length === 1) {
            const lastMove = history[0].lastMove;
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
    if (history.length === 0 && size < 13 && size % 2 !== 0 && !OPENING_BOOK[size]) {
        const center = Math.floor(size / 2);
        return { move: {x: center, y: center}, winRate: 55, scoreLead: 0 };
    }

    // 2. MCTS
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
        if (stopRequested) {
            return null;
        }
        let node = root;
        let simBoard = rootBoard.clone();
        let currColor = myColorVal;

        while(node.children.length > 0) {
            const nextNode = selectChild(node);
            if (!nextNode) break;
            node = nextNode;
            
            // 这里因为 expandNode 已经保证了 candidates 合法，
            // 理论上这里 play 一定成功，但为了保险，还是保留检查
            const success = simBoard.play(node.move.x, node.move.y, currColor);
            if (!success) { 
                node.valueSum -= 10000; // 极刑
                // 并将此节点从父节点移除？太复杂，直接降权即可
                break; 
            }
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

    // 兜底：确保最终返回的一定是合法点
    let finalMove = bestChild ? bestChild.move : null;
    
    // 如果 MCTS 失败，随机找一个合法的
    if (!finalMove) {
        for(let y=0; y<size; y++) {
            for(let x=0; x<size; x++) {
                if (rootBoard.isLegal(x, y, myColorVal)) {
                    finalMove = {x, y};
                    break;
                }
            }
            if (finalMove) break;
        }
    }

    if (stopRequested) return null;
    
    const winRate = (1 / (1 + Math.exp(-0.3 * scoreLead))) * 100;
    return {
        move: finalMove,
        winRate: winRate,
        scoreLead: scoreLead 
    };
}

onmessage = async function(e) {
    // [注意] e.data 有时候直接是消息体，有时候包了一层，取决于你怎么发
    // 根据你的 useWebKataGo.ts，你是直接发对象的，所以解构没问题
    const { type, data, payload } = e.data; // [新增] 解构 payload

    if (type === 'init') { 
        // [修改] 从 payload 中获取 modelPath 并传给 loadModel
        const modelPath = payload ? payload.modelPath : null;
        await loadModel(modelPath); 
        return; 
    }
    
    if (type === 'stop') {
        stopRequested = true;
        isBusy = false;
        return;
    }
    
    if (type === 'compute') {
        // compute 时如果模型还没加载（理论上 init 已经加载了，这里是双保险）
        // 这里很难拿到 modelPath，所以最好保证 init 必须先成功
        if (!model) {
             console.warn("Compute called before model loaded!");
             // 紧急尝试用默认路径，或者直接报错
             await loadModel('models/model.json'); 
        }
        
        if (isBusy) return;
        isBusy = true;
        stopRequested = false;
        try {
            const { board, history, color, size } = data;
            const result = await runMCTS(board, history, color, size);
            
            // 如果 stopRequested 为真，runMCTS 可能返回 null
            if (!result && stopRequested) {
                 isBusy = false;
                 return;
            }
            
            // 如果 MCTS 失败（比如无处可下），给一个兜底 Pass
            if (!result) {
                postMessage({
                    type: 'ai-response',
                    data: { move: null, winRate: 50, scoreLead: 0 }
                });
                isBusy = false;
                return;
            }
            
            if (result.winRate < 5.0 && history.length > 30) {
                postMessage({ type: 'ai-resign', data: { winRate: result.winRate } });
            } else {
                postMessage({
                    type: 'ai-response',
                    data: {
                        move: result.move,
                        winRate: Math.max(0.1, Math.min(99.9, result.winRate)),
                        scoreLead: result.scoreLead 
                    }
                });
            }
        } catch (err) {
            console.error(err);
            postMessage({ type: 'error', message: err.message });
        } finally {
            isBusy = false;
        }
    }
};