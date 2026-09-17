import { Global, Module } from '@nestjs/common';
import { AgentConnectionRegistry } from './agent-connection-registry.service';

@Global()
@Module({
  providers: [AgentConnectionRegistry],
  exports: [AgentConnectionRegistry],
})
export class AgentConnectionModule {}
