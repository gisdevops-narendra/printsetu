export interface PrintOptions {
  paperSize: string;
  colorMode: string;
  sideMode: string;
  copies: number;
}

export interface PrinterAdapter {
  /** Resolves once the OS print spooler has *accepted* the job, not once physical printing finishes. */
  print(filePath: string, printerName: string | undefined, options: PrintOptions): Promise<void>;
  listPrinters(): Promise<string[]>;
}
