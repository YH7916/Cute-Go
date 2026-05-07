import { useCallback, useEffect, useRef, useState } from 'react';
import { platform } from '../services/platform';
import type { AppProfile, AppSession } from '../services/platform';
import { logEvent } from '../utils/logger';

interface UseAppAuthProfileOptions {
  setToastMsg: (message: string | null) => void;
}

export const useAppAuthProfile = ({ setToastMsg }: UseAppAuthProfileOptions) => {
  const [session, setSession] = useState<AppSession | null>(null);
  const [userProfile, setUserProfile] = useState<AppProfile | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const isSigningOutRef = useRef(false);

  const fetchProfile = useCallback(async (userId: string) => {
    const profile = await platform.profile.getByUserId(userId);
    setUserProfile(profile);
  }, []);

  useEffect(() => {
    logEvent('app_start');

    platform.auth.restoreSession().then(({ session, profile }) => {
      setSession(session);
      setUserProfile(profile);
    });

    const unsubscribe = platform.auth.onSessionChange(({ session, profile }) => {
      setSession(session);
      setUserProfile(profile);
      if (session) setShowLoginModal(false);
    });
    return unsubscribe;
  }, []);

  const handleTapTapLogin = useCallback(async () => {
    const result = await platform.auth.signInWithTapTap();
    if (result.error) {
      setToastMsg(result.error);
      setTimeout(() => setToastMsg(null), 8000);
      return;
    }

    setSession(result.session);
    setUserProfile(result.profile);
    setToastMsg(result.message || 'TapTap 登录成功');
    setShowLoginModal(false);
  }, [setToastMsg]);

  const handleUpdateNickname = useCallback(async (newNickname: string) => {
    if (!session?.user?.id) return;

    setToastMsg('正在更新昵称...');
    const updated = await platform.profile.updateNickname(session.user.id, newNickname);

    if (!updated) {
      setToastMsg('更新失败');
    } else {
      setUserProfile(updated);
      setToastMsg('昵称修改成功！');
    }
    setTimeout(() => setToastMsg(null), 3000);
  }, [session?.user?.id, setToastMsg]);

  const handleSignOut = useCallback(async () => {
    if (isSigningOutRef.current) return;
    isSigningOutRef.current = true;
    try {
      await platform.auth.signOut();
      setSession(null);
      setUserProfile(null);
    } finally {
      isSigningOutRef.current = false;
    }
  }, []);

  return {
    session,
    userProfile,
    showLoginModal,
    setShowLoginModal,
    fetchProfile,
    handleTapTapLogin,
    handleUpdateNickname,
    handleSignOut,
  };
};
