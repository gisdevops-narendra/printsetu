import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { verifyAgentCredential } from '../common/utils/agent-credential.util';
import { AgentConnectionRegistry } from '../agent-connection/agent-connection-registry.service';
import { PrintersService } from './printers.service';
import { PrintJobsService } from '../print/print-jobs.service';

/**
 * SRS §13.1: "Agent maintains a persistent secure connection to the
 * backend using WSS/WebSocket." Namespace-scoped so the Angular clients'
 * default-namespace socket (if any is ever added) never mixes with agent
 * traffic. Auth happens once at handshake using the same credential
 * format as the HTTP agent endpoints (`agentId.secret`).
 */
@WebSocketGateway({ namespace: '/agent', cors: { origin: '*' } })
export class AgentGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(AgentGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly prisma: PrismaService,
    private readonly connections: AgentConnectionRegistry,
    private readonly printersService: PrintersService,
    private readonly printJobsService: PrintJobsService,
  ) {}

  async handleConnection(socket: Socket) {
    const token = socket.handshake.auth?.token as string | undefined;
    const printer = await verifyAgentCredential(this.prisma, token);
    if (!printer) {
      this.logger.warn(`Rejected unauthenticated agent socket ${socket.id}`);
      socket.emit('error', { code: 'UNAUTHENTICATED', message: 'Invalid agent credential.' });
      socket.disconnect(true);
      return;
    }
    socket.data.printerId = printer.id;
    this.connections.register(printer.id, socket);
    await this.printersService.heartbeat(printer.id);
  }

  async handleDisconnect(socket: Socket) {
    const printerId = socket.data?.printerId;
    if (printerId) {
      this.connections.unregister(printerId);
      await this.printersService.markOffline(printerId);
    }
  }

  @SubscribeMessage('heartbeat')
  async onHeartbeat(socket: Socket) {
    const printerId = socket.data?.printerId;
    if (printerId) await this.printersService.heartbeat(printerId);
  }

  /** Agent may also report status over the socket instead of the HTTP endpoint. */
  @SubscribeMessage('job:status')
  async onJobStatus(
    socket: Socket,
    payload: {
      jobId: string;
      status: 'ACCEPTED' | 'PRINTING' | 'PRINTED' | 'PRINT_FAILED' | 'PRINT_UNKNOWN';
      agentAttemptId: string;
      message?: string;
      errorCode?: string;
      errorDetail?: string;
    },
  ) {
    const printerId = socket.data?.printerId;
    if (!printerId) return;
    try {
      await this.printJobsService.reportAgentStatus(payload.jobId, printerId, {
        status: payload.status,
        agentAttemptId: payload.agentAttemptId,
        message: payload.message,
        errorCode: payload.errorCode,
        errorDetail: payload.errorDetail,
      });
    } catch (error) {
      this.logger.warn(`job:status handling failed: ${(error as Error).message}`);
    }
  }
}
