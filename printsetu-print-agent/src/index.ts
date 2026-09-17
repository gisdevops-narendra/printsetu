import { loadConfig } from './config';
import { BackendHttpClient } from './http-client';
import { createPrinterAdapter } from './printing/printer-adapter.factory';
import { JobProcessor } from './job-processor';
import { AgentSocketClient } from './socket-client';
import { logger } from './logger';

async function main() {
  const config = loadConfig();
  logger.info('Starting PrintSetu Print Agent', {
    agentId: config.agentId,
    printDriver: config.printDriver,
    printerName: config.printerName || '(system default)',
  });

  const http = new BackendHttpClient(config);
  const printer = createPrinterAdapter(config);
  const processor = new JobProcessor(config, http, printer);
  const socket = new AgentSocketClient(config, processor);

  socket.connect();

  // Heartbeat: prefer the socket channel, but always also hit the HTTP
  // endpoint so printers.last_heartbeat_at advances even during a
  // WebSocket outage (SRS §13.3 "Agent stopped" detection depends on it).
  setInterval(() => {
    socket.sendHeartbeat();
    http.safeHeartbeat();
  }, config.heartbeatIntervalMs);

  // SRS §17: GET /api/agent/jobs/next — "Polling fallback". Runs
  // continuously but only actually matters while the socket is down,
  // since the backend won't have anything QUEUED that a connected agent
  // wasn't already pushed.
  setInterval(async () => {
    if (socket.connected) return;
    try {
      const job = await http.pollNextJob();
      if (job) {
        logger.info(`Picked up job ${job.jobId} via polling fallback.`);
        await processor.handle(job);
      }
    } catch (error) {
      logger.warn(`Polling failed: ${(error as Error).message}`);
    }
  }, config.pollIntervalMs);

  process.on('SIGINT', () => {
    logger.info('Shutting down agent...');
    socket.disconnect();
    process.exit(0);
  });
}

main().catch((error) => {
  // winston's file transport writes asynchronously — exiting immediately
  // after logger.error() can cut the write off before it reaches disk,
  // which would hide the one log line an installer/operator needs most.
  logger.error(`Fatal agent error: ${error.message}`);
  logger.on('finish', () => process.exit(1));
  logger.end();
});
