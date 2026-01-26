import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    
  return {
      base: './',
      server: {
        port: 3001,
        host: '0.0.0.0', // 允许局域网访问
        cors: true,
        allowedHosts: true, // [Fix] Vite 6 必须显式允许 Host，否则 WebSocket 会报 400 本地连接错误
        hmr: {
            host: 'localhost',
        }
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
            '@': path.resolve(__dirname, '.')
        }
      },
      build: {
        chunkSizeWarningLimit: 1000,
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes('node_modules')) {
                        if (id.includes('react') || id.includes('react-dom')) return 'react-vendor';
                        if (id.includes('onnxruntime-web')) return 'onnx';
                        if (id.includes('@sabaki')) return 'game-libs';
                        if (id.includes('@supabase')) return 'supabase';
                    }
                }
            }
        }
      }
    };
});
