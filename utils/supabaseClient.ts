import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ibtgczhypjybiibtapcn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlidGdjemh5cGp5YmlpYnRhcGNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2NTExMDIsImV4cCI6MjA4NDIyNzEwMn0.duXCEXmxLSppLlw0q-9JoFD7EpIBUw6fc1zmDiRwTPU'; 

// 自定义 fetch：强制绕过缓存 (解决安卓端更新检查缓存问题)
const customFetch = (url: RequestInfo | URL, options?: RequestInit) => {
  // 移除 query parameter 注入，因为 Supabase REST API (Postgrest) 会拒绝未知参数导致 400
  // 仅依靠 headers 和 fetch options 的 cache: 'no-store' 来处理缓存控制
  const finalUrl = url.toString();

  const headers = new Headers(options?.headers);
  headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  headers.set('Pragma', 'no-cache');
  headers.set('Expires', '0');

  const newOptions: RequestInit = {
    ...options,
    headers: headers,
    cache: 'no-store'
  };

  return fetch(finalUrl, newOptions);
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