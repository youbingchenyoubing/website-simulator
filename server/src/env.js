import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// SQLite 默认落在 server/data 下（docker volume 挂载点）
process.env.DATABASE_URL ||= 'file:' + path.join(__dirname, '..', 'data', 'simulator.db');

export const env = {
  HOST: process.env.HOST || '127.0.0.1',
  PORT: Number(process.env.PORT || 8080),
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'admin',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'admin123',
  WATERMARK: process.env.DEMO_WATERMARK || '模拟环境 · 仅供培训演示',
  VERSION: '0.1.0',
};
