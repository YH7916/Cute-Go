import React from 'react';
import { X, Gamepad2 } from 'lucide-react';
import { isTapTapEnv } from '../utils/tapTapBridge';

interface LoginModalProps {
    isOpen: boolean;
    onClose: () => void;
    onTapTapLogin: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
    isOpen,
    onClose,
    onTapTapLogin
}) => {
    const isTapTap = isTapTapEnv();

    if (!isOpen) return null;

    return (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-[70] flex items-center justify-center p-4 animate-in fade-in">
              <div className="bg-[#fcf6ea] rounded-3xl p-6 w-full max-w-sm shadow-2xl border-[6px] border-[#5c4033] relative">
                  <button onClick={onClose} className="absolute top-4 right-4 text-[#8c6b38]"><X size={20}/></button>
                  <h2 className="text-2xl font-black text-[#5c4033] mb-6 text-center">
                      {isTapTap ? 'TapTap 登录' : '登录功能已迁移'}
                  </h2>
                  
                  <div className="space-y-4">
                      {isTapTap ? (
                          <>
                              <p className="text-sm text-[#8c6b38] font-bold text-center leading-6">
                                  账号系统已经切到 TapTap 原生登录。
                              </p>
                              <button
                                  onClick={onTapTapLogin}
                                  className="btn-retro w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 bg-[#00cccc] border-[#009999] text-white"
                              >
                                  <Gamepad2 size={20} />
                                  使用 TapTap 登录
                              </button>
                          </>
                      ) : (
                          <>
                              <p className="text-sm text-[#8c6b38] font-bold text-center leading-6">
                                  非 TapTap 小游戏环境暂不提供账号登录。请在发行环境中使用 TapTap 登录。
                              </p>
                          </>
                      )}
                  </div>
              </div>
          </div>
    );
};
