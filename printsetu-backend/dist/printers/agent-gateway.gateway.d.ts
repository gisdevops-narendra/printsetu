import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { AgentConnectionRegistry } from '../agent-connection/agent-connection-registry.service';
import { PrintersService } from './printers.service';
import { PrintJobsService } from '../print/print-jobs.service';
export declare class AgentGateway implements OnGatewayConnection, OnGatewayDisconnect {
    private readonly prisma;
    private readonly connections;
    private readonly printersService;
    private readonly printJobsService;
    private readonly logger;
    server: Server;
    constructor(prisma: PrismaService, connections: AgentConnectionRegistry, printersService: PrintersService, printJobsService: PrintJobsService);
    handleConnection(socket: Socket): Promise<void>;
    handleDisconnect(socket: Socket): Promise<void>;
    onHeartbeat(socket: Socket): Promise<void>;
    onJobStatus(socket: Socket, payload: {
        jobId: string;
        status: 'ACCEPTED' | 'PRINTING' | 'PRINTED' | 'PRINT_FAILED' | 'PRINT_UNKNOWN';
        agentAttemptId: string;
        message?: string;
    }): Promise<void>;
}
