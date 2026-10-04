import React, { useEffect, useState } from 'react';
import { Check, KeyRound } from 'lucide-react';
import { Button } from '../ui/common';
import { COACH_PRESETS, isLocalCoachEndpoint, validateCoachConfig } from '../services/coach/settings';
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
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => { setDraft(value); setRemember(rememberKey); }, [value, rememberKey]);
  const preset = COACH_PRESETS.find(item => item.endpoint === draft.endpoint)?.id ?? 'custom';
  const changeEndpoint = (endpoint: string, model = draft.model) => {
    setDraft({ endpoint, model, apiKey: '' });
    setRemember(false);
    setFailed(false);
    setMessage('地址已更改，请重新输入该服务的密钥。');
  };
  const save = () => {
    try {
      const checked = validateCoachConfig(draft);
      onSave(checked, remember);
      setFailed(false);
      setMessage('陪练设置已保存，返回棋盘即可讲解。');
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
    setMessage('密钥已清除。');
  };

  return (
    <section aria-label="陪练服务配置" className="min-h-0 flex flex-col text-[#5c4033]">
      <div className="min-h-0 overflow-y-auto custom-scrollbar p-5 space-y-5">
        <fieldset role="radiogroup" aria-label="陪练服务商">
          <legend className="mb-2 text-sm font-bold text-[#8c6b38]">服务商</legend>
          <div className="grid grid-cols-3 gap-2">
            {COACH_PRESETS.map(item => (
              <label key={item.id} className={`relative btn-retro min-h-11 rounded-xl flex items-center justify-center px-1 text-sm font-bold cursor-pointer ring-[#e3c086] focus-within:ring-2 focus-within:ring-offset-2 ${preset === item.id ? 'btn-brown' : 'btn-beige'}`}>
                <input type="radio" name="coach-provider" value={item.id} aria-label={item.label} checked={preset === item.id}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  onChange={() => { if (preset !== item.id) changeEndpoint(item.endpoint, item.model); }} />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-[#8c6b38]">讲解时会发送当前局面与问题，费用由服务商收取。</p>
        </fieldset>
        <div className="space-y-4">
          <label className="block text-sm font-bold text-[#8c6b38]">API 地址
            <input aria-label="陪练 API 地址" type="url" value={draft.endpoint} placeholder="https://api.example.com/v1" autoComplete="off" spellCheck={false} className={fieldClass} onChange={event => changeEndpoint(event.target.value)} />
          </label>
          <label className="block text-sm font-bold text-[#8c6b38]">模型
            <input aria-label="陪练模型" value={draft.model} placeholder="填写模型名称" maxLength={200} autoComplete="off" spellCheck={false} className={fieldClass} onChange={event => setDraft(previous => ({ ...previous, model: event.target.value }))} />
          </label>
          <label className="block text-sm font-bold text-[#8c6b38]">API 密钥{isLocalCoachEndpoint(draft.endpoint) ? '（本机可留空）' : ''}
            <input aria-label="陪练 API 密钥" type="password" value={draft.apiKey} maxLength={4096} placeholder="粘贴该服务商的密钥" autoComplete="off" spellCheck={false} className={fieldClass} onChange={event => setDraft(previous => ({ ...previous, apiKey: event.target.value }))} />
          </label>
        </div>
        <Button appearance="retro" type="button" variant={remember ? 'primary' : 'secondary'}
          aria-label="在此设备记住密钥" aria-pressed={remember} onClick={() => setRemember(previous => !previous)}
          className="w-full min-h-12 flex items-center justify-center gap-2 outline-none ring-[#e3c086] focus-visible:ring-2 focus-visible:ring-offset-2">
          {remember ? <Check size={18} aria-hidden="true" /> : <KeyRound size={18} aria-hidden="true" />}
          <span>记住密钥</span>
        </Button>
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
