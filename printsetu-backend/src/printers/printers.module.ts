import { Module } from '@nestjs/common';
import { PrintersService } from './printers.service';
import { AgentController } from './agent.controller';
import { AdminPrintersController } from './admin-printers.controller';
import { ShopPrintersController } from './shop-printers.controller';
import { AgentPackageService } from './agent-package.service';
import { AgentGateway } from './agent-gateway.gateway';
import { StorageModule } from '../storage/storage.module';
import { PrintModule } from '../print/print.module';

@Module({
  imports: [StorageModule, PrintModule],
  controllers: [AgentController, AdminPrintersController, ShopPrintersController],
  providers: [PrintersService, AgentGateway, AgentPackageService],
  exports: [PrintersService],
})
export class PrintersModule {}
