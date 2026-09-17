import { AgentConfig } from '../config';
import { PrinterAdapter } from './printer-adapter.interface';
import { WindowsPrinterAdapter } from './windows-printer-adapter';
import { MockPrinterAdapter } from './mock-printer-adapter';

export function createPrinterAdapter(config: AgentConfig): PrinterAdapter {
  return config.printDriver === 'windows' ? new WindowsPrinterAdapter() : new MockPrinterAdapter();
}
