import React, { useState } from 'react';
import { X, Gamepad2 } from 'lucide-react';
import { isTapTapEnv } from '../utils/tapTapBridge';

interface LoginModalProps {
    isOpen: boolean;
    onClose: () => void;
    onLogin: (email: string, pass: string) => void;
    onRegister: (email: string, pass: string, nickname: string) => void;
    onTapTapLogin: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
    isOpen,
    onClose,
    onLogin,
    onRegister,
    onTapTapLogin
}) => {
    const [loginMode, setLoginMode] = useState<'signin' | 'signup'>('signin');
    const [authEmail, setAuthEmail] = useState('');
    const [authPassword, setAuthPassword] = useState('');
    const [authNickname, setAuthNickname] = useState('');

    if (!isOpen) return null;

    const handleAuth = () => {
        if (loginMode === 'signin') {
            onLogin(authEmail, authPassword);
        } else {
            onRegister(authEmail, authPassword, authNickname);
        }
    };

    return (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-[70] flex items-center justify-center p-4 animate-in fade-in">
              <div className="bg-[#fcf6ea] rounded-3xl p-6 w-full max-w-sm shadow-2xl border-[6px] border-[#5c4033] relative">
                  <button onClick={onClose} className="absolute top-4 right-4 text-[#8c6b38]"><X size={20}/></button>
                  <h2 className="text-2xl font-black text-[#5c4033] mb-6 text-center">
                      {loginMode === 'signin' ? '登录账号' : '注册新账号'}
                  </h2>
                  
                  <div className="space-y-4">
                      <input 
                          type="email" placeholder="邮箱" 
                          value={authEmail} onChange={e => setAuthEmail(e.target.value)}
                          className="w-full p-3 bg-white border-2 border-[#e3c086] rounded-xl font-bold text-[#5c4033] outline-none focus:border-[#5c4033]"
                      />
                      <input 
                          type="password" placeholder="密码" 
                          value={authPassword} onChange={e => setAuthPassword(e.target.value)}
                          className="w-full p-3 bg-white border-2 border-[#e3c086] rounded-xl font-bold text-[#5c4033] outline-none focus:border-[#5c4033]"
                      />
                      
                      {loginMode === 'signup' && (
                           <input 
                              type="text" placeholder="昵称 (例如: 弈星)" 
                              value={authNickname} onChange={e => setAuthNickname(e.target.value)}
                              className="w-full p-3 bg-white border-2 border-[#e3c086] rounded-xl font-bold text-[#5c4033] outline-none focus:border-[#5c4033]"
                          />
                      )}

                       <button onClick={handleAuth} className="btn-retro btn-brown w-full py-3 rounded-xl font-bold">
                           {loginMode === 'signin' ? '登录' : '注册并登录'}
                       </button>

                       {isTapTapEnv() && loginMode === 'signin' && (
                            <div className="relative pt-2">
                                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                    <div className="w-full border-t border-[#e3c086] border-dashed"></div>
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-[#fcf6ea] px-2 text-[#8c6b38] font-bold">快捷方式</span>
                                </div>
                                <button 
                                    onClick={onTapTapLogin}
                                    className="btn-retro w-full py-3 mt-4 rounded-xl font-bold flex items-center justify-center gap-2 bg-[#00cccc] border-[#009999] text-white"
                                >
                                    <Gamepad2 size={20} />
                                    使用 TapTap 登录
                                </button>
                            </div>
                       )}
                      
                      <div className="flex justify-center gap-2 text-xs font-bold text-[#8c6b38] mt-4">
                          <span>{loginMode === 'signin' ? '还没有账号?' : '已有账号?'}</span>
                          <button 
                              onClick={() => setLoginMode(loginMode === 'signin' ? 'signup' : 'signin')}
                              className="text-[#5c4033] underline"
                          >
                              {loginMode === 'signin' ? '去注册' : '去登录'}
                          </button>
                      </div>
                  </div>
              </div>
          </div>
    );
};
