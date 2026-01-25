import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ibtgczhypjybiibtapcn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlidGdjemh5cGp5YmlpYnRhcGNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2NTExMDIsImV4cCI6MjA4NDIyNzEwMn0.duXCEXmxLSppLlw0q-9JoFD7EpIBUw6fc1zmDiRwTPU'; 

// 自定义 fetch 函数，给每个请求强行加上防缓存 Header
const customFetch = (url: RequestInfo | URL, options?: RequestInit) => {
  return fetch(url, {
    ...options,
    headers: {
      ...options?.headers,
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true, // 保持登录状态（原默认值）
    detectSessionInUrl: false, // 在 Capacitor 中通常设为 false 以避免 URL 干扰
  },
  global: {
    fetch: customFetch, // <--- 关键修改：注入自定义 fetch
  }
});