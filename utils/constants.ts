import pkg from '../package.json';

export const CURRENT_VERSION = pkg.version;
export const DEFAULT_DOWNLOAD_LINK = 'https://yesterhaze.codes'; 
export const WORKER_URL = 'https://api.yesterhaze.codes';
// export const CLOUD_AI_URL = 'https://cutego-proxy.3240106155.workers.dev/'; 
// AutoDL SSH Tunnel (Localhost)
// export const CLOUD_AI_URL = 'http://127.0.0.1:6006/api/analyze';
// Production: Aliyun FRP Bridge
export const CLOUD_AI_URL = 'http://115.29.213.141:6006/api/analyze';
