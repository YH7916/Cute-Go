import pkg from '../package.json';

export const CURRENT_VERSION = pkg.version;
export const DEFAULT_DOWNLOAD_LINK = 'https://yesterhaze.codes'; 
export const WORKER_URL = 'https://api.yesterhaze.codes';
// export const CLOUD_AI_URL = 'https://cutego-proxy.3240106155.workers.dev/'; 
// AutoDL SSH Tunnel (Localhost)
// export const CLOUD_AI_URL = 'http://127.0.0.1:6006/api/analyze';
// Production: Aliyun FRP Bridge (HTTPS)
// export const CLOUD_AI_URL = 'https://katago.yesterhaze.codes:8443/api/analyze';
export const CLOUD_AI_URL = 'http://39.104.59.160:8080/api/analyze';