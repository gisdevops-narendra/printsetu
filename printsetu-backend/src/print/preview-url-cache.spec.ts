import { HEADERS_METADATA } from '@nestjs/common/constants';
import { ShopPrintJobsController } from './print-jobs.controller';
import { ShopDocumentsController } from '../documents/shop-documents.controller';

// Signed preview links expire after 120s: a cached /preview-url response would
// hand the browser a link that MinIO already rejects (403).
describe('preview-url endpoints are never cached', () => {
  it.each([
    ['print-job item preview', ShopPrintJobsController.prototype.itemPreviewUrl],
    ['shop document preview', ShopDocumentsController.prototype.previewUrl],
  ])('%s sends Cache-Control: private, no-store', (_label, handler) => {
    expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toEqual([
      { name: 'Cache-Control', value: 'private, no-store' },
    ]);
  });
});
