import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { verifyAgentCredential } from '../utils/agent-credential.util';
import { UnauthenticatedException } from '../exceptions/app.exceptions';
import { AuthenticatedAgent } from '../types/request-context';

/**
 * Authenticates the Windows Print Agent's HTTP calls using the per-printer
 * credential minted at /api/agent/register (SRS §13.1). The agent is never
 * trusted to assert its own shopId — it is always re-derived from the
 * matched printer row.
 */
@Injectable()
export class AgentAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthenticatedException('Missing agent credential.');
    }
    const raw = authHeader.substring('Bearer '.length);
    const printer = await verifyAgentCredential(this.prisma, raw);
    if (!printer) {
      throw new UnauthenticatedException('Invalid agent credential.');
    }

    const agent: AuthenticatedAgent = {
      printerId: printer.id,
      agentId: printer.agentId,
      shopId: printer.shopId,
    };
    request.agent = agent;
    return true;
  }
}
