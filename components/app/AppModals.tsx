import React, { useMemo } from 'react';
import { SettingsModal } from '../SettingsModal';
import { UserPage } from '../UserPage';
import { OnlineMenu } from '../OnlineMenu';
import { ImportExportModal } from '../ImportExportModal';
import { EndGameModal } from '../EndGameModal';
import { TutorialModal } from '../TutorialModal';
import { OfflineLoadingModal } from '../OfflineLoadingModal';
import { LoginModal } from '../LoginModal';
import { AboutModal } from '../AboutModal';
import { TsumegoListModal } from '../TsumegoListModal';
import TsumegoResultModal from '../TsumegoResultModal';
import { TsumegoHub } from '../Tsumego/TsumegoHub';
import { SkinShopModal } from '../SkinShopModal';
import { parseSGFToTree } from '../../utils/sgfParser';
import { fetchProblemSGF } from '../../utils/tsumegoData';
import { platform } from '../../services/platform';
import type { AppViewModel } from './AppViewModel';

interface AppModalsProps {
  vm: AppViewModel;
}

export const AppModals: React.FC<AppModalsProps> = ({ vm }) => {
  const {
    achievementsList,
    cancelMatchmaking,
    completedLevelIds,
    createRoom,
    eloDiffStyle,
    eloDiffText,
    exitTsumegoMode,
    gameCopied,
    gameState,
    handleApplySettings,
    handleCopy,
    handleExportSGF,
    handleImport,
    handleNextTsumego,
    handleRetryTsumego,
    handleSignOut,
    handleTapTapLogin,
    handleUpdateNickname,
    hasNextProblem,
    hideOfflineLoading,
    importKey,
    isCreatingRoom,
    isFirstRun,
    isJoiningRoom,
    isMatching,
    joinRoom,
    isWebInitializing,
    matchBoardSize,
    matchTime,
    onlineStatus,
    roomId,
    resetGame,
    session,
    setCurrentTsumegoLevel,
    setHideOfflineLoading,
    setImportKey,
    setShowAboutModal,
    setShowImportModal,
    setShowLoginModal,
    setShowMenu,
    setShowOnlineMenu,
    setShowSkinShop,
    setShowStartScreen,
    setShowTsumegoLevelSelector,
    setShowTsumegoList,
    setShowTsumegoResult,
    setShowTutorial,
    setShowUserPage,
    setToastMsg,
    setTsumegoCollection,
    settings,
    showAboutModal,
    showImportModal,
    showLoginModal,
    showMenu,
    showOnlineMenu,
    showSkinShop,
    showTsumegoLevelSelector,
    showTsumegoList,
    showTsumegoResult,
    showTutorial,
    showUserPage,
    startMatchmaking,
    startTsumego,
    tsumegoCollection,
    tsumegoIsCorrect,
    tsumegoResultMsg,
    tsumegoSetTitle,
    userAchievements,
    userProfile,
    vibrate,
  } = vm;

  const currentGameSettings = useMemo(() => ({
    boardSize: settings.boardSize,
    gameType: settings.gameType,
    gameMode: settings.gameMode,
    difficulty: settings.difficulty,
    userColor: settings.userColor,
  }), [settings.boardSize, settings.gameType, settings.gameMode, settings.difficulty, settings.userColor]);

  return (
    <>
      <TutorialModal
        isOpen={showTutorial}
        onClose={() => {
          setShowTutorial(false);
          localStorage.setItem('cute_go_tutorial_seen', 'true');
        }}
      />

      <SettingsModal
        isOpen={showMenu}
        onClose={() => setShowMenu(false)}
        currentGameSettings={currentGameSettings}
        onApplyGameSettings={handleApplySettings}
        showQi={settings.showQi} setShowQi={settings.setShowQi}
        showWinRate={settings.showWinRate} setShowWinRate={settings.setShowWinRate}
        showCoordinates={settings.showCoordinates} setShowCoordinates={settings.setShowCoordinates}
        musicVolume={settings.musicVolume} setMusicVolume={settings.setMusicVolume}
        hapticEnabled={settings.hapticEnabled} setHapticEnabled={settings.setHapticEnabled}
        vibrate={vibrate}
        skipStartScreen={settings.skipStartScreen} setSkipStartScreen={settings.setSkipStartScreen}
        onStartSetup={() => { exitTsumegoMode('PvP'); resetGame(false); gameState.setAppMode('setup'); setShowMenu(false); }}
        onOpenImport={() => { setShowImportModal(true); setShowMenu(false); }}
        onOpenOnline={() => setShowOnlineMenu(true)}
        onOpenAbout={() => { setShowAboutModal(true); setShowMenu(false); }}
        onOpenTutorial={() => { setShowTutorial(true); setShowMenu(false); }}
        onOpenTsumego={() => setShowTsumegoLevelSelector(true)}
        onOpenSkinShop={() => setShowSkinShop(true)}
        separatePieces={settings.separatePieces}
        setSeparatePieces={settings.setSeparatePieces}
      />

      <SkinShopModal
        isOpen={showSkinShop}
        onClose={() => setShowSkinShop(false)}
        currentBoardSkin={settings.boardSkin}
        currentStoneSkin={settings.stoneSkin}
        onSetBoardSkin={settings.setBoardSkin}
        onSetStoneSkin={settings.setStoneSkin}
      />

      {showTsumegoList && (
        <TsumegoListModal
          onClose={() => setShowTsumegoList(false)}
          onSelectSet={vm.handleSelectTsumegoSet}
          collection={tsumegoCollection}
          currentSetTitle={tsumegoSetTitle}
          onBackToSets={() => setTsumegoCollection(null)}
          onSelectProblem={(node) => {
            startTsumego(node);
            setShowTsumegoList(false);
          }}
        />
      )}

      <UserPage
        isOpen={showUserPage}
        onClose={() => setShowUserPage(false)}
        session={session}
        userProfile={userProfile}
        achievementsList={achievementsList}
        userAchievements={userAchievements}
        onLoginClick={() => { setShowLoginModal(true); setShowUserPage(false); }}
        onSignOutClick={handleSignOut}
        onTapTapLeaderboardClick={() => {
          platform.leaderboard.openEloLeaderboard();
        }}
        onUpdateNickname={handleUpdateNickname}
      />

      <OnlineMenu
        isOpen={showOnlineMenu}
        onClose={() => setShowOnlineMenu(false)}
        isMatching={isMatching}
        onCancelMatch={cancelMatchmaking}
        onStartMatch={startMatchmaking}
        onCreateRoom={createRoom}
        onJoinRoom={joinRoom}
        matchBoardSize={matchBoardSize}
        matchTime={matchTime}
        onlineStatus={onlineStatus}
        roomId={roomId}
        isCreatingRoom={isCreatingRoom}
        isJoiningRoom={isJoiningRoom}
      />

      <ImportExportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        importKey={importKey}
        setImportKey={setImportKey}
        onImport={handleImport}
        onCopy={handleCopy}
        onExportSGF={handleExportSGF}
        isCopied={gameCopied}
      />

      <EndGameModal
        isOpen={gameState.gameOver && !showMenu}
        winner={gameState.winner}
        winReason={gameState.winReason}
        eloDiffText={eloDiffText}
        eloDiffStyle={eloDiffStyle}
        finalScore={gameState.finalScore}
        onRestart={() => resetGame(true)}
        onReview={() => { gameState.setAppMode('review'); gameState.setReviewIndex(gameState.history.length - 1); gameState.setGameOver(false); }}
      />

      <OfflineLoadingModal
        isInitializing={isWebInitializing && !hideOfflineLoading}
        isFirstRun={isFirstRun}
        onClose={() => { setHideOfflineLoading(true); localStorage.setItem('has_run_ai_before', 'true'); }}
      />

      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onTapTapLogin={handleTapTapLogin}
      />

      <AboutModal
        isOpen={showAboutModal}
        onClose={() => setShowAboutModal(false)}
        vibrate={vibrate}
      />

      <TsumegoResultModal
        isOpen={showTsumegoResult}
        isCorrect={tsumegoIsCorrect}
        message={tsumegoResultMsg}
        onNext={handleNextTsumego}
        onRetry={handleRetryTsumego}
        onClose={() => setShowTsumegoResult(false)}
        hasNext={hasNextProblem}
      />

      {showTsumegoLevelSelector && (
        <TsumegoHub
          onClose={() => setShowTsumegoLevelSelector(false)}
          completedLevelIds={completedLevelIds}
          onSelectLevel={async (level) => {
            try {
              setToastMsg("正在加载...");
              const sgf = await fetchProblemSGF(level.filename);

              setCurrentTsumegoLevel(level);
              setShowTsumegoLevelSelector(false);
              setShowStartScreen(false);
              settings.setGameMode('Tsumego');

              const nodes = parseSGFToTree(sgf);
              if (!nodes || nodes.length === 0) throw new Error("Invalid SGF");
              startTsumego(nodes[0]);

              vibrate(20);
              setToastMsg(null);
            } catch (error) {
              console.error(error);
              setToastMsg("加载失败");
              setTimeout(() => setToastMsg(null), 2000);
            }
          }}
        />
      )}
    </>
  );
};
