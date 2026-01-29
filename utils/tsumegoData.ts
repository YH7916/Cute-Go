import { SGFNode, parseSGFToTree } from './sgfParser';

export interface TsumegoLevel {
    id: string;
    title: string;
    difficulty: number; // 1-5
    sgf: string;
    description: string;
    chapterId: string;
}

export interface TsumegoChapter {
    id: string;
    title: string;
    subtitle: string;
    levels: TsumegoLevel[];
}

const CHAPTER_1_LEVELS_SGF = [
    // Level 1: Liberties
    `(;GM[1]FF[4]CA[UTF-8]AP[CuteGo:1.0]ST[2]SZ[9]GN[第一关-数气与吃子]AB[gc][fd][ed]AW[fc]PL[B]C[黑先。中间这颗白子（F7）被黑棋包围了三面，只剩下最后一口气。请下在那个位置，把它拿离棋盘！](;B[ec]C[正确！你堵住了白棋最后一口气，白棋被“提吃”了。])(;B[eb]C[错误。这里虽然贴着白棋，但没有堵住它的气。]))`,
    
    // Level 2: Direction of Atari
    `(;GM[1]FF[4]CA[UTF-8]AP[CuteGo:1.0]ST[2]SZ[9]GN[第二关-打吃的方向]AB[cc][dd][ee]AW[dc]PL[B]C[黑先。白棋（D7）还有两口气。如果你从错误的方向打吃，它就会逃跑。请把它赶向棋盘边缘吃掉！](;B[db]C[错误。白棋会往 E7 跑，气变多了，黑棋反而拦不住。];W[ec])(;B[ec]C[正确！利用棋盘边缘（死亡线）挡住去路，白棋无路可逃。]))`,
    
    // Level 3: The Gate
    `(;GM[1]FF[4]CA[UTF-8]AP[CuteGo:1.0]ST[2]SZ[13]GN[第三关-关门吃]AB[dj][ej][fj]AW[ek]AB[el][fl]PL[B]C[黑先。白棋（E9）想要从缺口逃跑。黑棋不要贴着它走，而是要把门“关”上。](;B[dk]C[错误。虽然挡住了左边，但白棋可以往 F9 跑，门没关紧。])(;B[fk]C[正确！这就是“关门吃”。白棋撞到左边黑棋挡，撞到右边黑棋也挡，插翅难飞。]))`,
    
    // Level 4: Double Atari
    `(;GM[1]FF[4]CA[UTF-8]AP[CuteGo:1.0]ST[2]SZ[13]GN[第四关-双打吃]AB[jd][kd]AW[jc][kc]AB[lb][kb]AW[lc][mc]PL[B]C[黑先。观察白棋的连接点。有一步棋可以同时叫吃两边的白子，白棋救不了一边，肯定会死另一边。](;B[ld]C[正确！这就是“双打吃”。攻击白棋的断点，必有收获。](;W[md]C[白接右边];B[jb]C[黑提左边])(;W[jb]C[白接左边];B[md]C[黑提右边]))(;B[jb]C[错误。只吃掉了一边，而且白棋接上 M10 后变得很厚实。]))`,
    
    // Level 5: Atari & Capture
    `(;GM[1]FF[4]CA[UTF-8]AP[CuteGo:1.0]ST[2]SZ[13]GN[第五关-抱吃]AB[jj][kj][lj]AW[jk]AB[ik][hk]PL[B]C[黑先。白棋（K9）想要逃跑。请给它最后一击，把它牢牢抱住吃掉。](;B[kk]C[正确！这叫“抱吃”。白棋逃跑的路线被完全封死。])(;B[il]C[错误。方向反了，白棋往 K8 跑，反而把黑棋分断了。]))`,
    
    // Level 6: The Net
    `(;GM[1]FF[4]CA[UTF-8]AP[CuteGo:1.0]ST[2]SZ[13]GN[第六关-枷吃]AB[cd][dd][ed]AW[ce][de]AB[cf][cg]AW[df][ef]PL[B]C[黑先。白棋这两颗子气势汹汹要冲出来。如果你一直贴着它打吃，它就会跑掉。试着“罩”住它！](;B[dg]C[错误。这是“冲”，白棋挡住后气长了，黑棋反而不好办。])(;B[eg]C[正确！这叫“枷吃”（瓮中捉鳖）。白棋往哪里冲，黑棋就挡哪里，白棋必死。](;W[dg]C[白冲];B[ch]C[黑挡])(;W[ee]C[白冲];B[fe]C[黑挡])))`,
    
    // Level 7: Making an Eye
    `(;GM[1]FF[4]CA[UTF-8]AP[CuteGo:1.0]ST[2]SZ[13]GN[第七关-真眼]AB[ka][la][ma]AB[kb][mb]AB[kc][lc][mc]AW[ja][jb][jc][jd][kd][ld][md][nd]PL[B]C[黑先。黑棋这块棋现在还没有完全活。如果在 K13（顶部中间）被白棋扑进来，那就变成假眼了。请补棋做成真眼。](;B[lb]C[正确！连接在这里，黑棋就有了两个清晰的“房间”（真眼），神仙也杀不死了。])(;B[tt]C[错误。];W[lb]C[白棋扑入，黑棋如果不提就是假眼；如果提子，眼形也不完整。]))`,
    
    // Level 8: Living Group
    `(;GM[1]FF[4]CA[UTF-8]AP[CuteGo:1.0]ST[2]SZ[13]GN[第八关-两眼活棋]AB[ij][hj]AB[ik][hk]AB[il][hl]AW[gj][gk][gl][gm][hm][im][jm][jl][jk][jj]PL[B]C[黑先。黑棋被白棋团团包围了。这块棋内部有三个空点（直三）。如果不走，会被白棋点死。请做活！](;B[hk]C[注意：坐标可能需要映射到棋盘系统的 I11/J11。这里 SGF 使用的是直三形状。])(;B[ii]C[正确！占据直三的中间点，分出两个眼，活棋。])(;B[tt]C[错误。];W[ii]C[白棋点在中间，黑棋死。]))`
];

export const TSUMEGO_DATA: TsumegoChapter[] = [
    {
        id: 'chapter1',
        title: '第一模块：规则与气',
        subtitle: 'Rules & Liberties',
        levels: [
            { id: '1-1', title: '数气与吃子', difficulty: 1, sgf: CHAPTER_1_LEVELS_SGF[0], chapterId: 'chapter1', description: '教学目的：最基础的动作——堵住最后一口气。' },
            { id: '1-2', title: '打吃的方向', difficulty: 1, sgf: CHAPTER_1_LEVELS_SGF[1], chapterId: 'chapter1', description: '教学目的：不能盲目叫吃，要把对手赶向“死路”。' },
            { id: '1-3', title: '关门吃', difficulty: 2, sgf: CHAPTER_1_LEVELS_SGF[2], chapterId: 'chapter1', description: '教学目的：学会“封锁”，而不是“追逐”。' },
            { id: '1-4', title: '双打吃', difficulty: 2, sgf: CHAPTER_1_LEVELS_SGF[3], chapterId: 'chapter1', description: '教学目的：一石二鸟，必得其一。' },
            { id: '1-5', title: '抱吃', difficulty: 2, sgf: CHAPTER_1_LEVELS_SGF[4], chapterId: 'chapter1', description: '教学目的：将对方一子抱在怀里吃掉。' },
            { id: '1-6', title: '枷吃', difficulty: 3, sgf: CHAPTER_1_LEVELS_SGF[5], chapterId: 'chapter1', description: '教学目的：针对“只能跑一步”的棋子，用宽宽松松的网罩住它。' },
            { id: '1-7', title: '什么是眼', difficulty: 2, sgf: CHAPTER_1_LEVELS_SGF[6], chapterId: 'chapter1', description: '教学目的：区分“真眼”和“假眼”。' },
            { id: '1-8', title: '两眼活棋', difficulty: 3, sgf: CHAPTER_1_LEVELS_SGF[7], chapterId: 'chapter1', description: '教学目的：在被包围的情况下，做出两个眼。' }
        ]
    }
];

export const getTsumegoLevelById = (id: string): TsumegoLevel | undefined => {
    for (const chapter of TSUMEGO_DATA) {
        const level = chapter.levels.find(l => l.id === id);
        if (level) return level;
    }
    return undefined;
};
