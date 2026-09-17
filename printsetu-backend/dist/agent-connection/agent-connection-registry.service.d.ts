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
export declare class AgentConnectionRegistry {
    private readonly logger;
    private readonly sockets;
    register(printerId: string, socket: Socket): void;
    unregister(printerId: string): void;
    isConnected(printerId: string): boolean;
    pushJob(printerId: string, payload: JobAssignedPayload): boolean;
}
