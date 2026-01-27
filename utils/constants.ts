import pkg from '../package.json';

export const CURRENT_VERSION = pkg.version;
export const DEFAULT_DOWNLOAD_LINK = 'https://yesterhaze.codes'; 
// 这个是你的主业务后端，保持不动
export const WORKER_URL = 'https://api.yesterhaze.codes';

// ▼▼▼▼▼▼▼▼ 修改这里 ▼▼▼▼▼▼▼▼
// 1. 注释掉那个 http 的 IP 地址
// 2. 启用你的 Cloudflare Worker 地址 (就是你刚才部署的那个)
// 注意：Cloudflare Worker 不需要加 /api/analyze，因为 Worker 代码里已经写死转发了
export const CLOUD_AI_URL = 'https://cutego-proxy.3240106155.workers.dev'; 

// export const CLOUD_AI_URL = 'http://39.104.59.160:8080/api/analyze';
// ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲