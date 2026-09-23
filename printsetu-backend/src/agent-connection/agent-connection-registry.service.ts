import { Injectable, Logger } from '@nestjs/common';
import { Socket } from 'socket.io';

export interface JobAssignedDocument {
  documentId: string;
  documentSignedUrl: string;
  originalName: string;
  mimeType: string;
  options: {
    paperSize: string;
    colorMode: string;
    sideMode: string;
    copies: number;
  };
}

export interface JobAssignedPayload {
  jobId: string;
  // One print request can now cover several documents (SRS extension), each
  // with its own options — printed in array order.
  documents: JobAssignedDocument[];
  attemptId: string;
  // OS printer the shopkeeper chose for this agent (Printer.osPrinterName);
  // null lets the agent fall back to its computer's default printer.
  printerName: string | null;
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

  /** Force-closes a live socket (e.g. the printer was just removed/unlinked). Triggers the gateway's own handleDisconnect, which unregisters it. */
  disconnect(printerId: string): void {
    this.sockets.get(printerId)?.disconnect(true);
  }

  isConnected(printerId: string): boolean {
    return this.sockets.has(printerId);
  }

  /** Asks a connected agent to re-scan and re-report its OS printers. Returns false if it isn't connected. */
  requestPrinterRefresh(printerId: string): boolean {
    const socket = this.sockets.get(printerId);
    if (!socket) return false;
    socket.emit('printers:refresh');
    return true;
  }

  pushJob(printerId: string, payload: JobAssignedPayload): boolean {
    const socket = this.sockets.get(printerId);
    if (!socket) return false;
    socket.emit('job:assigned', payload);
    return true;
  }
}
