import { useCallback } from 'react';
import type { Player } from '../../types';
import { calculateScore, cleanBoardWithTerritory } from '../../utils/goLogic';
import { calculateElo, calculateNewRating, getAiRating } from '../../utils/helpers';
import { platform } from '../../services/platform';
import type { UseGameActionsOptions } from './types';

export const useEndGameAction = ({
  aiTimerRef,
  aiTurnLock,
  checkEndGameAchievements,
  displayTerritory,
  fetchProfile,
  gameState,
  myColor,
  onlineStatus,
  opponentProfile,
  playSfx,
  session,
  setEloDiffStyle,
  setEloDiffText,
  setIsThinking,
  settings,
  userProfile,
  vibrate,
}: UseGameActionsOptions) => useCallback(async (winnerColor: Player, reason: string) => {
  gameState.setGameOver(true);
  aiTurnLock.current = false;
  setIsThinking(false);
  if (aiTimerRef.current) {
    clearTimeout(aiTimerRef.current);
    aiTimerRef.current = null;
  }

  gameState.setWinner(winnerColor);
  gameState.setWinReason(reason);
  vibrate([50, 50, 50, 50]);
  playSfx('win');

  if (session?.user?.id && (settings.gameMode === 'PvAI' || onlineStatus === 'connected')) {
    const myPlayerColor = onlineStatus === 'connected' ? myColor : settings.userColor;

    let finalBoard = gameState.boardRef.current;
    if (settings.gameMode === 'PvAI' && displayTerritory && displayTerritory.length === settings.boardSize * settings.boardSize) {
      console.log("[EndGame] Applying AI Dead Stone Removal...");
      finalBoard = cleanBoardWithTerritory(finalBoard, displayTerritory);
      gameState.setBoard(finalBoard);
    }

    const komi = settings.boardSize === 9 ? 6.5 : 7.5;
    const currentScore = calculateScore(finalBoard, undefined, komi);
    checkEndGameAchievements({
      winner: winnerColor,
      myColor: myPlayerColor || 'black',
      score: currentScore,
      captures: { black: gameState.blackCaptures, white: gameState.whiteCaptures },
    });
  }

  if (
    onlineStatus === 'connected' &&
    session &&
    userProfile &&
    opponentProfile &&
    typeof opponentProfile.elo === 'number' &&
    myColor
  ) {
    const isWin = myColor === winnerColor;
    const result = isWin ? 'win' : 'loss';
    const newElo = calculateElo(userProfile.elo, opponentProfile.elo, result);
    const eloDiff = newElo - userProfile.elo;
    const diffText = eloDiff > 0 ? `+${eloDiff}` : `${eloDiff}`;
    gameState.setWinReason(`${reason} (积分 ${diffText})`);
    setEloDiffText(diffText);
    setEloDiffStyle(eloDiff > 0 ? 'normal' : 'negative');

    if (isWin) {
      const winnerNewElo = calculateElo(userProfile.elo, opponentProfile.elo, 'win');
      const loserNewElo = calculateElo(opponentProfile.elo, userProfile.elo, 'loss');
      await platform.profile.applyOnlineMatchResult({
        winnerId: session.user.id,
        loserId: opponentProfile.id,
        winnerNewElo,
        loserNewElo,
      });

      fetchProfile(session.user.id);
    } else {
      setTimeout(() => fetchProfile(session.user.id), 2000);
    }
  }
  else if (onlineStatus === 'connected' && session?.provider === 'taptap') {
    gameState.setWinReason(reason);
    setEloDiffText(null);
    setEloDiffStyle(null);
  }
  else if (settings.gameMode === 'PvAI' && session && userProfile) {
    const isWin = winnerColor === settings.userColor;
    const resultScore: 0 | 0.5 | 1 = isWin ? 1 : 0;
    const aiRating = getAiRating(settings.difficulty);
    const newElo = calculateNewRating(userProfile.elo, aiRating, resultScore, 16);
    const eloDiff = newElo - userProfile.elo;
    const diffText = eloDiff > 0 ? `+${eloDiff}` : `${eloDiff}`;

    if (isWin && userProfile.elo <= 1200 && aiRating >= 1800) {
      gameState.setWinReason(`史诗级胜利！战胜了强敌！ (积分 ${diffText})`);
      setEloDiffStyle('gold');
    } else {
      gameState.setWinReason(`${reason} (积分 ${diffText})`);
      setEloDiffStyle(eloDiff > 0 ? 'normal' : 'negative');
    }
    setEloDiffText(diffText);
    await platform.profile.updateElo(session.user.id, newElo);

    fetchProfile(session.user.id);
  }
}, [
  aiTimerRef,
  aiTurnLock,
  checkEndGameAchievements,
  displayTerritory,
  fetchProfile,
  gameState,
  myColor,
  onlineStatus,
  opponentProfile,
  playSfx,
  session,
  setEloDiffStyle,
  setEloDiffText,
  setIsThinking,
  settings,
  userProfile,
  vibrate,
]);
