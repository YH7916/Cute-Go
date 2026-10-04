import { useCallback, useState } from 'react';
import { defaultCoachConfig, readCoachSettings, validateCoachConfig, writeCoachSettings } from '../services/coach/settings';
import type { CoachConfig, StoredCoachSettings } from '../services/coach/types';

const STORAGE_ERROR = '本机存储不可用，配置仅在本次打开期间生效。若曾记住密钥，请在浏览器设置中清除此站点的数据。';

function loadSettings(): StoredCoachSettings & { storageError: string } {
  try { return { ...readCoachSettings(localStorage), storageError: '' }; }
  catch { return { config: defaultCoachConfig(), rememberKey: false, storageError: STORAGE_ERROR }; }
}

export function useCoachSettings() {
  const [state, setState] = useState(loadSettings);
  const saveConfig = useCallback((config: CoachConfig, rememberKey: boolean) => {
    const checked = validateCoachConfig(config);
    let storageError = '';
    try { writeCoachSettings(localStorage, checked, rememberKey); }
    catch { storageError = STORAGE_ERROR; }
    setState({ config: checked, rememberKey: storageError ? false : rememberKey, storageError });
  }, []);
  const clearKey = useCallback(() => {
    saveConfig({ ...state.config, apiKey: '' }, false);
  }, [state.config, saveConfig]);
  return { ...state, saveConfig, clearKey };
}
