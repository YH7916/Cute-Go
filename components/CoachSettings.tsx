import React, { useEffect, useState } from 'react';
import { Check, KeyRound } from 'lucide-react';
import { Button } from '../ui/common';
import { COACH_PROVIDERS, validateCoachConfig } from '../services/coach/settings';
import type { CoachConfig } from '../services/coach/types';

interface CoachSettingsProps {
  value: CoachConfig;
  rememberKey: boolean;
  onSave: (config: CoachConfig, rememberKey: boolean) => void;
  onClearKey?: () => void;
  storageError?: string;
}

const fieldClass = 'mt-2 min-h-12 w-full rounded-xl border-2 border-[#e3c086] bg-[#fff] px-3 py-2 text-base text-[#5c4033] outline-none transition-shadow ring-[#e3c086] focus:ring-2 motion-reduce:transition-none';

export const CoachSettings: React.FC<CoachSettingsProps> = ({ value, rememberKey, onSave, onClearKey, storageError }) => {
  const [draft, setDraft] = useState(value);
  const [remember, setRemember] = useState(rememberKey);
  const [advanced, setAdvanced] = useState(!value.endpoint);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setDraft(value); setRemember(rememberKey);
    if (!value.endpoint) setAdvanced(true);
  }, [value, rememberKey]);
  const changeEndpoint = (endpoint: string) => {
    setDraft(previous => ({ ...previous, endpoint, apiKey: '' }));
    setRemember(false);
    setFailed(false);
    setMessage('后台地址已更改，请重新填写 API 密钥。');
  };
  const changeProvider = (id: string) => {
    const provider = COACH_PROVIDERS.find(item => item.id === id);
    if (!provider || provider.id === draft.provider) return;
    setDraft(previous => ({ ...previous, provider: provider.id, model: provider.defaultModel, apiKey: '' }));
    setRemember(false);
    setFailed(false);
    setMessage('服务商已更改，请填写该服务商的 API 密钥。');
  };
  const save = () => {
    try {
      const checked = validateCoachConfig(draft);
      onSave(checked, remember);
      setFailed(false);
      setMessage(checked.endpoint && checked.apiKey ? '陪练设置已保存，返回棋盘即可提问。'
        : '设置已保存；填写后台地址和 API 密钥后可使用云端讲解，本地讲解仍可使用。');
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : '配置保存失败，请检查填写内容。');
    }
  };
  const clear = () => {
    setDraft(previous => ({ ...previous, apiKey: '' }));
    setRemember(false);
    setFailed(false);
    if (onClearKey) onClearKey();
    else onSave({ ...value, apiKey: '' }, false);
    setMessage('API 密钥已清除，本地讲解仍可使用。');
  };

  return (
    <section aria-label="陪练服务配置" className="min-h-0 flex flex-col text-[#5c4033]">
      <div className="min-h-0 overflow-y-auto custom-scrollbar p-5 space-y-5">
        <p className="text-sm leading-relaxed text-[#8c6b38]">使用你自己的模型 API 密钥。陪练后台会将密钥转交所选服务商，用于本次讲解，不在服务端保存；调用费用由你的模型账户承担。</p>
        <label className="block text-sm font-bold text-[#8c6b38]">模型服务商
          <select aria-label="陪练服务商" value={draft.provider} className={fieldClass} onChange={event => changeProvider(event.target.value)}>
            {COACH_PROVIDERS.map(provider => <option key={provider.id} value={provider.id}>{provider.label}</option>)}
          </select>
        </label>
        <label className="block text-sm font-bold text-[#8c6b38]">API 密钥
          <input aria-label="陪练 API 密钥" type="password" value={draft.apiKey} maxLength={4096} placeholder="填写所选服务商的 API 密钥" autoComplete="off" spellCheck={false} className={fieldClass} onChange={event => { setDraft(previous => ({ ...previous, apiKey: event.target.value })); setMessage(''); setFailed(false); }} />
        </label>
        <Button appearance="retro" type="button" variant={remember ? 'primary' : 'secondary'}
          aria-label="在此设备记住 API 密钥" aria-pressed={remember} onClick={() => setRemember(previous => !previous)}
          className="w-full min-h-12 flex items-center justify-center gap-2 outline-none ring-[#e3c086] focus-visible:ring-2 focus-visible:ring-offset-2">
          {remember ? <Check size={18} aria-hidden="true" /> : <KeyRound size={18} aria-hidden="true" />}
          <span>记住 API 密钥</span>
        </Button>
        <Button appearance="retro" type="button" variant="secondary" aria-label="陪练高级设置"
          aria-expanded={advanced} aria-controls="coach-advanced-settings" className="w-full min-h-12"
          onClick={() => setAdvanced(previous => !previous)}>高级设置</Button>
        {advanced && <div id="coach-advanced-settings" className="space-y-5">
          <label className="block text-sm font-bold text-[#8c6b38]">陪练后台地址
            <input aria-label="陪练后台地址" type="url" value={draft.endpoint} placeholder="https://你的服务/api/coach" autoComplete="off" spellCheck={false} className={fieldClass} onChange={event => changeEndpoint(event.target.value)} />
          </label>
          <label className="block text-sm font-bold text-[#8c6b38]">模型名称
            <input aria-label="陪练模型" value={draft.model} maxLength={200} autoComplete="off" spellCheck={false} className={fieldClass} onChange={event => setDraft(previous => ({ ...previous, model: event.target.value }))} />
          </label>
          {!draft.endpoint && <p className="text-xs leading-relaxed text-[#8c6b38]">尚未配置陪练后台，请填写后台地址；留空时仅使用本地讲解。</p>}
        </div>}
      </div>
      <div className="shrink-0 space-y-3 border-t-2 border-[#e3c086] bg-[#fcf6ea] p-4">
        {message && <p role={failed ? 'alert' : 'status'} className={`text-xs leading-relaxed ${failed ? 'text-red-700' : 'text-[#8c6b38]'}`}>{message}</p>}
        {storageError && <p role="alert" className="text-xs leading-relaxed text-red-700">{storageError}</p>}
        <div className="flex gap-3">
          <Button appearance="retro" type="button" className="min-h-12 flex-1" onClick={save}>保存陪练设置</Button>
          <Button appearance="retro" type="button" variant="secondary" className="min-h-12" onClick={clear}>清除密钥</Button>
        </div>
      </div>
    </section>
  );
};
