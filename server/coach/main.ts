import { pathToFileURL } from 'node:url';
import { createCoachHttpServer, validateCoachOrigin } from './http';
import { runPiCoachReply } from './provider';

export function readCoachServerConfig(env: NodeJS.ProcessEnv) {
  const host = env.COACH_HOST?.trim() || '127.0.0.1';
  const port = Number(env.COACH_PORT || 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('COACH_PORT 必须是 1–65535 的端口。');
  if (/[\s/\\?#]/.test(host)) throw new Error('COACH_HOST 须为有效主机名或 IP。');
  return { host, port, allowedOrigin: validateCoachOrigin(env.COACH_ALLOWED_ORIGIN?.trim()) };
}

export function startCoachServer(env: NodeJS.ProcessEnv = process.env) {
  const config = readCoachServerConfig(env);
  const server = createCoachHttpServer({ runReply: runPiCoachReply, allowedOrigin: config.allowedOrigin });
  server.once('error', () => { console.error('讲解服务启动失败，请检查监听地址和端口。'); process.exitCode = 1; });
  server.listen(config.port, config.host, () => { console.log(`Pi 讲解服务已启动，端口 ${config.port}。`); });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { startCoachServer(); }
  catch { console.error('讲解服务未启动：请检查监听地址、端口和允许的前端来源。'); process.exitCode = 1; }
}
