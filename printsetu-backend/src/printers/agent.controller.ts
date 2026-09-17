import { Body, Controller, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { PrintersService } from './printers.service';
import { PrintJobsService } from '../print/print-jobs.service';
import { RegisterPrinterDto } from './dto/printer.dto';
import { AgentJobStatusDto } from '../print/dto/print.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AgentAuthGuard } from '../common/guards/agent-auth.guard';
import { CurrentAgent } from '../common/decorators/current-agent.decorator';
import { AuthenticatedAgent } from '../common/types/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { PrintJobStatus } from '@prisma/client';
import { STORAGE_SERVICE, IStorageService } from '../storage/storage.interface';

@Controller('agent')
export class AgentController {
  constructor(
    private readonly printersService: PrintersService,
    private readonly printJobsService: PrintJobsService,
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
  ) {}

  /** SRS §17 auth column: "One-time provisioning/admin-controlled". */
  @Roles('ADMIN')
  @Post('register')
  register(@Body() dto: RegisterPrinterDto) {
    return this.printersService.register(dto);
  }

  /** SRS §17: "Polling fallback" for shops where WebSocket connectivity is unavailable. */
  @Public()
  @UseGuards(AgentAuthGuard)
  @Get('jobs/next')
  async nextJob(@CurrentAgent() agent: AuthenticatedAgent) {
    const job = await this.prisma.printJob.findFirst({
      where: {
        printerId: agent.printerId,
        status: { in: [PrintJobStatus.QUEUED, PrintJobStatus.AGENT_OFFLINE] },
      },
      include: { document: true },
      orderBy: { queuedAt: 'asc' },
    });
    if (!job) return { job: null };
    const documentSignedUrl = await this.storage.getSignedDownloadUrl(job.document.s3Key);
    return {
      job: {
        jobId: job.id,
        originalName: job.document.originalName,
        mimeType: job.document.mimeType,
        options: job.optionsJson,
        attemptId: `${job.id}:${job.attemptCount}`,
        documentSignedUrl,
      },
    };
  }

  @Public()
  @UseGuards(AgentAuthGuard)
  @Post('jobs/:id/status')
  reportStatus(
    @Param('id') id: string,
    @Body() dto: AgentJobStatusDto,
    @CurrentAgent() agent: AuthenticatedAgent,
  ) {
    return this.printJobsService.reportAgentStatus(id, agent.printerId, dto);
  }

  @Public()
  @UseGuards(AgentAuthGuard)
  @Post('heartbeat')
  heartbeat(@CurrentAgent() agent: AuthenticatedAgent) {
    return this.printersService.heartbeat(agent.printerId);
  }
}
