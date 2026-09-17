import { Module } from '@nestjs/common';
import { PrintersService } from './printers.service';
import { AgentController } from './agent.controller';
import { AdminPrintersController } from './admin-printers.controller';
import { AgentGateway } from './agent-gateway.gateway';
import { StorageModule } from '../storage/storage.module';
import { PrintModule } from '../print/print.module';

@Module({
  imports: [StorageModule, PrintModule],
  controllers: [AgentController, AdminPrintersController],
  providers: [PrintersService, AgentGateway],
  exports: [PrintersService],
})
export class PrintersModule {}
