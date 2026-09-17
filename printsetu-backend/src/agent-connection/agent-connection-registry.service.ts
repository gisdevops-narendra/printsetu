import { Injectable, Logger } from '@nestjs/common';
import { Socket } from 'socket.io';

export interface JobAssignedPayload {
  jobId: string;
  documentSignedUrl: string;
  originalName: string;
  mimeType: string;
  options: {
    paperSize: string;
    colorMode: string;
    sideMode: string;
    copies: number;
  };
  attemptId: string;
}

/**
 * In-memory registry of which printer (agent) currently holds a live
 * WebSocket connection. This is deliberately process-local — Phase 1 runs
 * a single backend instance (SRS §24 EC2-first deployment); a multi-node
 * deployment would back this with Redis pub/sub instead, without changing
 * any caller.
 */
@Injectable()
export class AgentConnectionRegistry {
  private readonly logger = new Logger(AgentConnectionRegistry.name);
  private readonly sockets = new Map<string, Socket>();

  register(printerId: string, socket: Socket) {
    this.sockets.set(printerId, socket);
    this.logger.log(`Agent connected for printer ${printerId}`);
  }

  unregister(printerId: string) {
    this.sockets.delete(printerId);
    this.logger.log(`Agent disconnected for printer ${printerId}`);
  }

  isConnected(printerId: string): boolean {
    return this.sockets.has(printerId);
  }

  pushJob(printerId: string, payload: JobAssignedPayload): boolean {
    const socket = this.sockets.get(printerId);
    if (!socket) return false;
    socket.emit('job:assigned', payload);
    return true;
  }
}
