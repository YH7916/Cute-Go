import React, { useState } from 'react';
import { X, Heart, Check, ChevronLeft, Github, ExternalLink } from 'lucide-react';
import { isTapTapEnv } from '../services/platform/environment';
import { Button } from '../ui/common';

const PROJECT_REPOSITORY_URL = 'https://github.com/YH7916/Cute-Go';
const OGS_REPOSITORY_URL = 'https://github.com/online-go/online-go.com';
const GO_GAME_GURU_REPOSITORY_URL = 'https://github.com/gogameguru/go-problems';

interface AboutModalProps {
    isOpen: boolean;
    onClose: () => void;
    vibrate: (pattern: number | number[]) => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({
    isOpen,
    onClose,
    vibrate
}) => {
    const [donationMethod, setDonationMethod] = useState<'wechat' | 'alipay'>('wechat');
    const [socialTip, setSocialTip] = useState('');
    const [view, setView] = useState<'main' | 'credits'>('main');

    if (!isOpen) return null;

    const copySocial = (id: string, platform: string) => {
        navigator.clipboard.writeText(id);
        vibrate(10);
        setSocialTip(`已复制 ${platform} ID`);
        setTimeout(() => setSocialTip(''), 2000);
    };

    return (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={(e) => { if(e.target === e.currentTarget) onClose() }}>
          <div className="bg-[#fcf6ea] rounded-[2rem] w-full max-w-sm shadow-2xl border-[6px] border-[#8c6b38] flex flex-col max-h-[85vh] relative overflow-hidden">
            
            {/* Fixed Close Button Layer */}
            <div className="absolute top-0 left-0 right-0 p-4 flex justify-end z-20 pointer-events-none bg-gradient-to-b from-[#fcf6ea] via-[#fcf6ea]/80 to-transparent h-20">
                <button onClick={onClose} className="pointer-events-auto text-[#8c6b38] hover:text-[#5c4033] bg-[#fff] rounded-full w-10 h-10 flex items-center justify-center border-2 border-[#e3c086] transition-colors shadow-sm"><X size={20}/></button>
            </div>
            
            {/* Scrollable Content */}
            <div className="p-6 pt-16 flex flex-col gap-5 text-center overflow-y-auto custom-scrollbar overscroll-contain">
                
                {view === 'main' ? (
                  <>
                
                <div className="flex flex-col items-center gap-2 mt-2">
                    <div className="w-20 h-20 bg-[#5c4033] rounded-3xl shadow-lg border-4 border-[#8c6b38] overflow-hidden">
                        <img 
                            src="./logo.png" 
                            alt="App Icon" 
                            className="w-full h-full object-cover"
                        />
                    </div>
                    <h2 className="text-2xl font-black text-[#5c4033] tracking-wide">Cute-Go</h2>
                    <p className="text-xs font-bold text-[#8c6b38] opacity-80">可爱的围棋/五子棋对战助手<br/>Made with ❤️ by Yohaku</p>
                </div>

                <button 
                    onClick={() => setView('credits')}
                    className="w-full btn-retro bg-[#fff] border-[#e3c086] text-[#8c6b38] py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-[#fcf6ea] transition-colors"
                >
                    <Heart size={14} className="text-[#e57373]" />
                    致谢名单
                </button>
                <div className="h-px bg-[#e3c086] border-dashed border-b border-[#e3c086]/50"></div>

                {/* Social Media */}
                <div className="bg-[#fff] p-4 rounded-2xl border-2 border-[#e3c086] relative">
                    {socialTip && (
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px] rounded-2xl flex items-center justify-center z-10 animate-in fade-in duration-200">
                            <div className="bg-white px-3 py-1 rounded-full flex items-center gap-2">
                                <Check size={12} className="text-green-500"/>
                                <span className="text-xs font-bold text-[#5c4033]">{socialTip}</span>
                            </div>
                        </div>
                    )}
                    <div className="flex items-center justify-center gap-2 mb-3">
                         <div className="h-px bg-[#e3c086]/50 flex-1"></div>
                         <span className="text-xs font-bold text-[#8c6b38]">点击图标复制 ID</span>
                         <div className="h-px bg-[#e3c086]/50 flex-1"></div>
                    </div>
                    
                    <div className="flex justify-around px-2">
                         <button onClick={() => copySocial('1245921330', 'B站')} className="flex flex-col items-center gap-2 group">
                             <div className="w-12 h-12 rounded-full border-2 border-[#fff] shadow-[0_0_0_2px_#23ade5] flex items-center justify-center overflow-hidden group-active:scale-95 transition-transform bg-[#f0f0f0]">
                                 <img src="./bili.jpg" alt="Bili" className="w-full h-full object-cover" />
                             </div>
                             <span className="text-[10px] font-bold text-[#5c4033]">Bilibili</span>
                         </button>

                         <button onClick={() => copySocial('508905176', '小红书')} className="flex flex-col items-center gap-2 group">
                             <div className="w-12 h-12 rounded-full border-2 border-[#fff] shadow-[0_0_0_2px_#ff2442] flex items-center justify-center overflow-hidden group-active:scale-95 transition-transform bg-[#f0f0f0]">
                                 <img src="./rednote.jpg" alt="RedNote" className="w-full h-full object-cover" />
                             </div>
                             <span className="text-[10px] font-bold text-[#5c4033]">小红书</span>
                         </button>

                         <button onClick={() => copySocial('47891107161', '抖音')} className="flex flex-col items-center gap-2 group">
                             <div className="w-12 h-12 rounded-full border-2 border-[#fff] shadow-[0_0_0_2px_#1c1c1c] flex items-center justify-center overflow-hidden group-active:scale-95 transition-transform bg-[#f0f0f0]">
                                  <img src="./douyin.jpg" alt="Douyin" className="w-full h-full object-cover" />
                             </div>
                             <span className="text-[10px] font-bold text-[#5c4033]">抖音</span>
                         </button>

                    </div>
                </div>

                <a
                    href={PROJECT_REPOSITORY_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => vibrate(10)}
                    className="bg-[#fff] p-4 rounded-2xl border-2 border-[#e3c086] text-left flex items-center gap-3 group hover:bg-[#fffaf2] transition-colors"
                >
                    <div className="w-10 h-10 rounded-xl bg-[#24292f] text-white flex items-center justify-center shrink-0 group-active:scale-95 transition-transform">
                        <Github size={22} aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-xs font-black text-[#5c4033]">本项目开源地址</p>
                        <p className="text-[10px] font-bold text-[#8c6b38] break-all mt-0.5">
                            github.com/YH7916/Cute-Go
                        </p>
                    </div>
                    <ExternalLink size={16} className="text-[#8c6b38] shrink-0" aria-hidden="true" />
                </a>


                {!isTapTapEnv() && (
                    <>
                        <div className="h-px bg-[#e3c086] border-dashed border-b border-[#e3c086]/50"></div>

                        {/* Donation */}
                        <div className="flex flex-col gap-3 pb-4">
                            <div className="flex items-center justify-center gap-2">
                                <Heart size={16} fill="#e57373" className="text-[#e57373] animate-pulse"/>
                                <h3 className="text-sm font-bold text-[#5c4033] uppercase">支持开发者</h3>
                                <Heart size={16} fill="#e57373" className="text-[#e57373] animate-pulse"/>
                            </div>
                            <p className="text-[10px] font-bold text-[#8c6b38] leading-tight">如果喜欢这个应用，<br/>欢迎投喂一杯奶茶☕️！<br/>你们的支持是我更新的动力🤗 </p>

                            <div className="bg-[#fff] p-4 rounded-2xl border-2 border-[#e3c086]">
                                <div className="flex gap-2 mb-4" role="group" aria-label="支持方式">
                                    <Button appearance="retro" size="sm" variant={donationMethod === 'wechat' ? 'primary' : 'secondary'}
                                        aria-pressed={donationMethod === 'wechat'} onClick={() => setDonationMethod('wechat')}
                                        className="min-h-11 flex-1">
                                        微信支付
                                    </Button>
                                    <Button appearance="retro" size="sm" variant={donationMethod === 'alipay' ? 'primary' : 'secondary'}
                                        aria-pressed={donationMethod === 'alipay'} onClick={() => setDonationMethod('alipay')}
                                        className="min-h-11 flex-1">
                                        支付宝
                                    </Button>
                                </div>

                                <div className="w-full aspect-square bg-[#fcf6ea] rounded-xl border-2 border-dashed border-[#e3c086] flex items-center justify-center relative overflow-hidden group">
                                     <img 
                                        src={donationMethod === 'wechat' 
                                            ? './wechat_pay.jpg' 
                                            : './alipay_pay.jpg'
                                        } 
                                        alt={donationMethod === 'wechat' ? "WeChat QR" : "Alipay QR"}
                                        className="w-full h-full object-contain p-2" 
                                     />
                                     <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 pointer-events-none"></div>
                                </div>
                                <p className="text-[10px] text-[#8c6b38] mt-2 font-bold opacity-75">
                                    (个人收款码不支持直接跳转，请截图或长按保存扫码)
                                </p>
                            </div>
                        </div>
                    </>
                )}

                 </>
                ) : (
                    <div className="flex flex-col gap-4 animate-in slide-in-from-right duration-300">
                        <div className="flex items-center gap-2 mb-2">
                            <button 
                                onClick={() => setView('main')}
                                className="p-2 -ml-2 rounded-full hover:bg-black/5 text-[#8c6b38] transition-colors"
                            >
                                <ChevronLeft size={24} />
                            </button>
                            <h3 className="text-xl font-black text-[#5c4033]">致谢</h3>
                        </div>

                        <div className="bg-[#fff]/50 p-4 rounded-2xl border border-[#e3c086] text-left">
                            <h4 className="text-sm font-bold text-[#5c4033] mb-2">特别感谢</h4>
                            <p className="text-xs text-[#8c6b38]/80 font-bold leading-relaxed">
                                感谢每一位支持 Cute-Go 的朋友！
                            </p>
                            <div className="h-px bg-[#e3c086]/30 my-3"></div>
                            <ul className="text-xs text-[#8c6b38] font-bold space-y-2">
                                <li>• 感谢 <span className="text-[#5c4033]">KataGo</span> 提供强大的围棋AI引擎</li>
                                <li>• 感谢运营初期提供打赏的<br/>
                                    <span className="pl-4 block">@卖糖术士</span>
                                    <span className="pl-4 block">@林一泽啧啧</span>
                                    <span className="pl-4 block">等共7位网友</span>
                                </li>
                                <li>• 感谢所有反馈 Bug 和提出建议的用户</li>
                            </ul>
                        </div>

                        <section className="bg-[#fff]/50 p-4 rounded-2xl border border-[#e3c086] text-left">
                            <h4 className="text-sm font-bold text-[#5c4033] mb-2">OGS · Learn to Play Go</h4>
                            <p className="text-xs text-[#8c6b38] leading-relaxed">
                                感谢 Online-Go.com 与社区贡献者提供官方入门课程。相关课程棋图、任务与解答来自上游，按 AGPL-3.0-or-later 使用。
                            </p>
                            <p className="text-xs text-[#8c6b38] leading-relaxed mt-2">中文翻译、整理与交互适配由 Cute-Go 完成。</p>
                            <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-bold text-[#5c4033] mt-3">
                                <a href={OGS_REPOSITORY_URL} target="_blank" rel="noopener noreferrer" className="underline py-1">官方仓库</a>
                                <a href={new URL('../third_party/ogs-learning/LICENSE', import.meta.url).href} target="_blank" rel="noopener noreferrer" className="underline py-1">许可原文</a>
                                <a href={new URL('../third_party/ogs-learning/README.md', import.meta.url).href} target="_blank" rel="noopener noreferrer" className="underline py-1">来源与改编说明</a>
                            </div>
                        </section>

                        <section className="bg-[#fff]/50 p-4 rounded-2xl border border-[#e3c086] text-left">
                            <h4 className="text-sm font-bold text-[#5c4033] mb-2">Go Game Guru · 围棋习题</h4>
                            <p className="text-xs text-[#8c6b38] leading-relaxed">
                                感谢 An Younggil（职业八段）与 David Ormerod。相关棋图、解答变化与原讲解来自 Go Game Guru 题库。
                            </p>
                            <p className="text-xs text-[#8c6b38] leading-relaxed mt-2">
                                中文翻译与交互适配由 Cute-Go 完成；原题及改编内容按 CC BY-NC-SA 4.0（署名—非商业性使用—相同方式共享）使用。
                            </p>
                            <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-bold text-[#5c4033] mt-3">
                                <a href={GO_GAME_GURU_REPOSITORY_URL} target="_blank" rel="noopener noreferrer" className="underline py-1">官方仓库</a>
                                <a href={new URL('../third_party/go-game-guru/LICENSE', import.meta.url).href} target="_blank" rel="noopener noreferrer" className="underline py-1">许可原文</a>
                                <a href={new URL('../third_party/go-game-guru/README.md', import.meta.url).href} target="_blank" rel="noopener noreferrer" className="underline py-1">来源与改编说明</a>
                            </div>
                        </section>

                        <p className="text-[11px] text-[#8c6b38] leading-relaxed text-left">
                            以上署名用于标明来源，不表示原作者审校或背书本项目。软件代码采用
                            {' '}<a href={new URL('../LICENSE', import.meta.url).href} target="_blank" rel="noopener noreferrer" className="underline">AGPL-3.0-or-later</a>；
                            题库与其他资源保留各自许可，详见
                            {' '}<a href={new URL('../THIRD_PARTY_NOTICES.md?no-inline', import.meta.url).href} target="_blank" rel="noopener noreferrer" className="underline">第三方声明</a>。
                        </p>
                    </div>
                )}

            </div>
          </div>
        </div>
    );
};
