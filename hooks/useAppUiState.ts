import { useEffect, useState } from 'react';

// Application overlays and transient feedback have one lifecycle owner.
export function useAppUiState(skipStartScreen: boolean) {
  const [showMenu, setShowMenu] = useState(false);
  const [showUserPage, setShowUserPage] = useState(false);
  const [showPassModal, setShowPassModal] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showStartScreen, setShowStartScreen] = useState(!skipStartScreen);
  const [showSkinShop, setShowSkinShop] = useState(false);
  const [showTerritory, setShowTerritory] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!localStorage.getItem('cute_go_tutorial_seen')) setShowTutorial(true);
  }, []);
  useEffect(() => {
    if (!toastMsg) return;
    const timer = setTimeout(() => setToastMsg(null), 3000);
    return () => clearTimeout(timer);
  }, [toastMsg]);
  return {
    showMenu, setShowMenu, showUserPage, setShowUserPage, showPassModal, setShowPassModal,
    showStartScreen, setShowStartScreen, showTutorial, setShowTutorial,
    showSkinShop, setShowSkinShop, showTerritory, setShowTerritory, showAboutModal, setShowAboutModal,
    toastMsg, setToastMsg,
  };
}
