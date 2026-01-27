import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../utils/supabaseClient'; 
import { DisplayAchievement, AchievementDef } from '../types';
import { BoardState, Player } from '../types';
import { unlockTapTapAchievement } from '../utils/tapTapBridge';

// 定义硬编码的成就列表 (为了减少 DB 读取，也可以选择从 DB 拉取)
const ACHIEVEMENTS_LIST: AchievementDef[] = [
  { code: 'FIRST_BLOOD', name: '初出茅庐', description: '完成第一场有效对局', icon: 'Sword', category: 'milestone', target_value: 1 },
  { code: 'WINNER_1', name: '首尝胜果', description: '获得第一场胜利', icon: 'Trophy', category: 'milestone', target_value: 1 },
  { code: 'TENGEN_LOVER', name: '宇宙中心呼唤爱', description: '第一手棋下在天元', icon: 'Disc', category: 'fun', target_value: 1 },
  { code: 'BIG_EATER', name: '大胃王', description: '单局提子超过 20 颗', icon: 'Utensils', category: 'skill', target_value: 1 },
  { code: 'LUCKY_DOG', name: '半目险胜', description: '以 0.5 目差距获胜', icon: 'Clover', category: 'skill', target_value: 1 },
  { code: 'COMPANION_3', name: '初识之缘', description: '连续登录 3 天，感谢有你', icon: 'Heart', category: 'social', target_value: 3 },
  { code: 'COMPANION_10', name: '友谊长存', description: '连续登录 10 天，情谊渐深', icon: 'Medal', category: 'social', target_value: 10 },
  { code: 'COMPANION_30', name: '不离不弃', description: '连续登录 30 天，长情告白', icon: 'Crown', category: 'social', target_value: 30 },
];

export const useAchievements = (userId: string | undefined) => {
  const [userAchievements, setUserAchievements] = useState<Record<string, any>>({});
  const [newUnlocked, setNewUnlocked] = useState<DisplayAchievement | null>(null);

  // 1. 初始化加载用户进度 & 连续登录检测
  useEffect(() => {
    if (!userId) return;
    const fetchProgress = async () => {
      const { data } = await supabase.from('user_achievements').select('*').eq('user_id', userId);
      const map: Record<string, any> = {};
      data?.forEach(item => map[item.achievement_code] = item);
      setUserAchievements(map);
      
      // [新增] 连续登录检查 (依赖 map 中已有的数据)
      checkLoginStreak(userId, map);
    };
    fetchProgress();
  }, [userId]);

  // 1.1 自动关闭弹窗的副作用
  useEffect(() => {
    if (newUnlocked) {
      const timer = setTimeout(() => {
        setNewUnlocked(null);
      }, 5000); // 5秒后自动关闭
      return () => clearTimeout(timer);
    }
  }, [newUnlocked]);

  // 2. 通用的更新进度函数
  const updateProgress = useCallback(async (code: string, increment: number = 1, setValue?: number) => {
    if (!userId) return;

    const def = ACHIEVEMENTS_LIST.find(a => a.code === code);
    if (!def) return;

    const current = userAchievements[code] || { current_value: 0, is_unlocked: false };
    if (current.is_unlocked) return; // 已经解锁的不需要再处理

    let newValue = setValue !== undefined ? setValue : current.current_value + increment;
    let unlocked = newValue >= def.target_value;

    // 更新本地状态
    setUserAchievements(prev => ({
      ...prev,
      [code]: { ...current, current_value: newValue, is_unlocked: unlocked }
    }));

    // 更新数据库
    const { error } = await supabase.from('user_achievements').upsert({
      user_id: userId,
      achievement_code: code,
      current_value: newValue,
      is_unlocked: unlocked,
      unlocked_at: unlocked ? new Date().toISOString() : null
    });

    if (!error && unlocked) {
      setNewUnlocked({ ...def, progress: { ...current, is_unlocked: true } });
      
      // [New] Sync to TapTap if applicable
      const isTapTapUser = localStorage.getItem('is_taptap_user') === 'true';
      if (isTapTapUser) {
        unlockTapTapAchievement(code);
      }

      const audio = new Audio('/achievement.mp3');
      audio.play().catch(() => {});
    }
  }, [userId, userAchievements]);

  // [新增] 连续登录逻辑 (支持多档位)
  const checkLoginStreak = async (uid: string, currentAchievementsMap: Record<string, any>) => {
    const today = new Date().toDateString(); // "Mon Jan 20 2026"
    const lastLoginDate = localStorage.getItem(`last_login_date_${uid}`);

    // 如果今天已经登录过，就不再触发计算逻辑
    if (lastLoginDate === today) return; 

    localStorage.setItem(`last_login_date_${uid}`, today);

    // 计算当前的 Streak
    // 注意：所有档位共享同一个逻辑天数，所以我们只需要算出一个 newStreak，然后去更新这三个成就的状态
    let newStreak = 1;
    
    // 取任意一个伴随成就的当前值作为基准 (如果有的话)
    // 这里我们假设所有相关成就的 current_value 应该是同步的，或者取最大值
    const companionCodes = ['COMPANION_3', 'COMPANION_10', 'COMPANION_30'];
    const maxCurrent = Math.max(...companionCodes.map(c => currentAchievementsMap[c]?.current_value || 0));

    if (lastLoginDate) {
      const oneDay = 24 * 60 * 60 * 1000;
      const d1 = new Date(new Date().toDateString());
      const d2 = new Date(new Date(lastLoginDate).toDateString());
      const diff = Math.round(Math.abs((d1.getTime() - d2.getTime()) / oneDay));

      if (diff === 1) {
         newStreak = maxCurrent + 1;
      } else {
         newStreak = 1; // 断更了
      }
    }

    // 遍历所有关联成就进行更新
    for (const code of companionCodes) {
        const def = ACHIEVEMENTS_LIST.find(a => a.code === code);
        if (!def) continue;

        const currentRecord = currentAchievementsMap[code];
        // 如果已经解锁了，就不需要再弹窗了，但可能需要更新数值(比如 3天档解锁后，数值还要继续涨到30)
        // 不过在这个逻辑里，解锁也就意味着 is_unlocked = true。
        // 为了保持数值同步，我们还是更新数值
        
        const unlocked = newStreak >= def.target_value;
        const isNewUnlock = unlocked && !currentRecord?.is_unlocked;

        // 如果数值没变且状态没变，跳过 DB
        if (currentRecord && currentRecord.current_value === newStreak && currentRecord.is_unlocked === unlocked) {
            continue;
        }

        await supabase.from('user_achievements').upsert({
            user_id: uid,
            achievement_code: code,
            current_value: newStreak,
            is_unlocked: unlocked,
            unlocked_at: unlocked ? new Date().toISOString() : null
        });

        // 更新本地 state
        setUserAchievements(prev => ({
            ...prev,
            [code]: { 
                achievement_code: code, 
                current_value: newStreak, 
                is_unlocked: unlocked, 
                unlocked_at: unlocked ? new Date().toISOString() : null // 简单的本地模拟时间
            }
        }));

        // 如果是新解锁，触发弹窗 (一次只弹一个高级的，或者都弹)
        // 为了体验，如果是第3天，只弹 COMPANION_3。如果是第10天，只弹 COMPANION_10。不会同时满足两个刚解锁的情况。
        if (isNewUnlock) {
            setNewUnlocked({ ...def, progress: { current_value: newStreak, is_unlocked: true, achievement_code: code, unlocked_at: new Date().toISOString() } });
            
            // [New] Sync to TapTap if applicable
            const isTapTapUser = localStorage.getItem('is_taptap_user') === 'true';
            if (isTapTapUser) {
              unlockTapTapAchievement(code);
            }

            const audio = new Audio('/achievement.mp3');
            audio.play().catch(() => {});
        }
    }
  };

  // --- 具体的检测逻辑 ---

  // 场景 A: 对局结束时检测 (End Game Check)
  const checkEndGameAchievements = async (
    params: {
      winner: Player | null,
      myColor: Player,
      score: { black: number, white: number } | null,
      captures: { black: number, white: number },
      boardSize: number
    }
  ) => {
    if (!userId) return;

    const { winner, myColor, score, captures, boardSize } = params;
    const isWin = winner === myColor;

    // 1. 里程碑：完成对局
    await updateProgress('FIRST_BLOOD');

    // 2. 里程碑：首胜
    if (isWin) {
      await updateProgress('WINNER_1');
    }

    // 3. 技术：大胃王 (吃子 > 20)
    const myCaptures = myColor === 'black' ? captures.black : captures.white;
    if (myCaptures >= 20) {
      await updateProgress('BIG_EATER', 0, 20); // 直接设为达成
    }

    // 4. 技术：半目险胜
    if (isWin && score) {
      const diff = Math.abs(score.black - score.white);
      if (diff === 0.5 || diff === 1) { // 考虑到不同规则，有时候是1目
         await updateProgress('LUCKY_DOG');
      }
    }
  };

  // 场景 B: 落子时检测 (Move Check)
  const checkMoveAchievements = (
    move: { x: number, y: number, color: Player, moveNumber: number, boardSize: number }
  ) => {
    if (!userId) return;

    // 1. 趣味：第一手天元
    if (move.moveNumber === 1) {
      const center = Math.floor(move.boardSize / 2);
      if (move.x === center && move.y === center) {
        updateProgress('TENGEN_LOVER');
      }
    }
  };

  return {
    achievementsList: ACHIEVEMENTS_LIST,
    userAchievements,
    newUnlocked,     // 用于前端显示弹窗
    clearNewUnlocked: () => setNewUnlocked(null), // 关闭弹窗
    checkEndGameAchievements,
    checkMoveAchievements
  };
};
