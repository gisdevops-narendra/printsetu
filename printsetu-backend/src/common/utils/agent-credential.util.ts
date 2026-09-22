import { Printer } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { verifySecret } from './secret.util';

/** Shared by AgentAuthGuard (HTTP) and AgentGateway (WebSocket handshake). */
export async function verifyAgentCredential(
  prisma: PrismaService,
  raw: string | undefined,
): Promise<Printer | null> {
  if (!raw) return null;
  const [agentId, secret] = raw.split('.');
  if (!agentId || !secret) return null;
  const printer = await prisma.printer.findUnique({ where: { agentId } });
  if (!printer || printer.status === 'REMOVED' || !verifySecret(secret, printer.agentKeyHash)) return null;
  return printer;
}
