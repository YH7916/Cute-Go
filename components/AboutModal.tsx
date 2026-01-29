import React, { useState } from 'react';
import { X, Heart, RefreshCw, Download, Check } from 'lucide-react';
import { CURRENT_VERSION } from '../utils/constants';

interface AboutModalProps {
    isOpen: boolean;
    onClose: () => void;
    checkingUpdate: boolean;
    updateMsg: string;
    newVersionFound: boolean;
    downloadUrl: string;
    onCheckUpdate: () => void;
    vibrate: (pattern: number | number[]) => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({
    isOpen,
    onClose,
    checkingUpdate,
    updateMsg,
    newVersionFound,
    downloadUrl,
    onCheckUpdate,
    vibrate
}) => {
    const [donationMethod, setDonationMethod] = useState<'wechat' | 'alipay'>('wechat');
    const [socialTip, setSocialTip] = useState('');

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

                <div className="h-px bg-[#e3c086] border-dashed border-b border-[#e3c086]/50"></div>

                {/* Version & Update */}
                <div className="bg-[#fff]/50 p-4 rounded-2xl border border-[#e3c086]">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-bold text-[#5c4033]">当前版本</span>
                        <span className="bg-[#8c6b38] text-[#fcf6ea] text-xs font-bold px-2 py-1 rounded-lg">v{CURRENT_VERSION}</span>
                    </div>
                    <button 
                        onClick={onCheckUpdate}
                        disabled={checkingUpdate}
                        className="w-full btn-retro btn-beige py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2"
                    >
                        {checkingUpdate ? <RefreshCw size={14} className="animate-spin"/> : <RefreshCw size={14}/>}
                        {checkingUpdate ? '检查中...' : '检查更新'}
                    </button>
                    {updateMsg && (
                        <p className={`text-xs font-bold mt-2 ${updateMsg.includes('新版本') ? 'text-green-600' : 'text-[#8c6b38]'}`}>
                            {updateMsg}
                        </p>
                    )}
                </div>

                 {newVersionFound && (
                     <a 
                        href={downloadUrl} 
                        target="_blank" 
                        rel="noreferrer"
                        className="btn-retro bg-[#81c784] border-[#388e3c] text-white py-3 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg animate-in fade-in slide-in-from-top-2"
                     >
                        <Download size={18} /> 
                        {updateMsg.includes('发现新版本') ? '下载更新(密码：cute）' : '访问官网 / 下载'}
                    </a>
                 )}

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

                         <button onClick={() => copySocial('7848618811', '小红书')} className="flex flex-col items-center gap-2 group">
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
                        <div className="inset-track rounded-xl p-1 relative h-10 flex items-center mb-4">
                            <div className={`absolute top-1 bottom-1 w-1/2 bg-[#fcf6ea] rounded-lg shadow-md transition-all duration-300 ease-out z-0 ${donationMethod === 'alipay' ? 'translate-x-full left-[-2px]' : 'left-1'}`} />
                            <button onClick={() => setDonationMethod('wechat')} className={`flex-1 relative z-10 font-bold text-xs transition-colors duration-200 flex items-center justify-center gap-1 ${donationMethod === 'wechat' ? 'text-[#07c160]' : 'text-[#8c6b38]/60'}`}>
                                微信支付
                            </button>
                            <button onClick={() => setDonationMethod('alipay')} className={`flex-1 relative z-10 font-bold text-xs transition-colors duration-200 flex items-center justify-center gap-1 ${donationMethod === 'alipay' ? 'text-[#1677ff]' : 'text-[#8c6b38]/60'}`}>
                                支付宝
                            </button>
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

            </div>
          </div>
        </div>
    );
};
