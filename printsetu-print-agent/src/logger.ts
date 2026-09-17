import * as fs from 'fs';
import * as path from 'path';
import * as winston from 'winston';

// Running under a Windows Service, there is no attached console to read —
// so also write to a log file next to the executable (or cwd in dev). The
// installer's connection check tails this file to confirm the agent came
// up and connected.
const isPkg = !!(process as unknown as { pkg?: unknown }).pkg;
const baseDir = isPkg ? path.dirname(process.execPath) : process.cwd();
const logFile = path.join(baseDir, 'logs', 'agent.log');
fs.mkdirSync(path.dirname(logFile), { recursive: true });

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      return `[${timestamp}] ${level.toUpperCase()} ${message}${metaStr}`;
    }),
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: logFile, maxsize: 5 * 1024 * 1024, maxFiles: 3 }),
  ],
});
