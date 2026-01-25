import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ibtgczhypjybiibtapcn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlidGdjemh5cGp5YmlpYnRhcGNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2NTExMDIsImV4cCI6MjA4NDIyNzEwMn0.duXCEXmxLSppLlw0q-9JoFD7EpIBUw6fc1zmDiRwTPU'; 

// 自定义 fetch：安全地合并 Headers
const customFetch = (url: RequestInfo | URL, options?: RequestInit) => {
  // 1. 使用 Headers 构造函数来安全复制原有的 headers (包括 API Key)
  const headers = new Headers(options?.headers);
  
  // 2. 强行追加防缓存 Header
  headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  headers.set('Pragma', 'no-cache');
  headers.set('Expires', '0');

  // 3. 构造新的 options
  const newOptions: RequestInit = {
    ...options,
    headers: headers, // 传入处理后的 Headers 对象
  };

  return fetch(url, newOptions);
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: {
    fetch: customFetch, // 注入修复后的 customFetch
  }
});