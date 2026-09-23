import { AgentConfig } from '../config';
import { PrinterAdapter } from './printer-adapter.interface';
import { WindowsPrinterAdapter } from './windows-printer-adapter';
import { LinuxPrinterAdapter } from './linux-printer-adapter';
import { MockPrinterAdapter } from './mock-printer-adapter';

export function createPrinterAdapter(config: AgentConfig): PrinterAdapter {
  switch (config.printDriver) {
    case 'windows':
      return new WindowsPrinterAdapter();
    case 'cups':
      return new LinuxPrinterAdapter();
    default:
      return new MockPrinterAdapter();
  }
}
