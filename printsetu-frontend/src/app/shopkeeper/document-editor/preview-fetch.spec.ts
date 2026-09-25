import { downloadPreview, PreviewDownloadError } from './preview-fetch';

describe('downloadPreview', () => {
  const reply = (status: number, type = 'image/jpeg', body = 'bytes') =>
    new Response(body, { status, headers: { 'content-type': type } });

  let signed: string[];
  let nextLink: jasmine.Spy<() => Promise<string>>;

  beforeEach(() => {
    signed = [];
    nextLink = jasmine.createSpy('getSignedUrl').and.callFake(async () => {
      const url = `https://minio/doc.jpg?X-Amz-Signature=${signed.length + 1}`;
      signed.push(url);
      return url;
    });
  });

  it('asks for a fresh signed link and downloads it once, bypassing the browser cache', async () => {
    const fetchFn = jasmine.createSpy('fetch').and.resolveTo(reply(200));

    const blob = await downloadPreview(nextLink, fetchFn);

    expect(await blob.text()).toBe('bytes');
    expect(nextLink).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledOnceWith(signed[0], { cache: 'no-store' });
  });

  it('gets a new link and retries once when the old one is rejected with 403 (expired)', async () => {
    const fetchFn = jasmine.createSpy('fetch').and.returnValues(
      Promise.resolve(reply(403, 'application/xml')),
      Promise.resolve(reply(200)),
    );

    await downloadPreview(nextLink, fetchFn);

    expect(nextLink).toHaveBeenCalledTimes(2);
    expect(fetchFn.calls.allArgs().map(([url]) => url)).toEqual(signed);
    expect(signed[0]).not.toBe(signed[1]);
  });

  it('gives up after the second 403 instead of looping', async () => {
    const fetchFn = jasmine.createSpy('fetch').and.callFake(async () => reply(403, 'application/xml'));

    await expectAsync(downloadPreview(nextLink, fetchFn)).toBeRejectedWith(jasmine.any(PreviewDownloadError));
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('does not retry other failures', async () => {
    const fetchFn = jasmine.createSpy('fetch').and.resolveTo(reply(404, 'application/xml'));

    await expectAsync(downloadPreview(nextLink, fetchFn)).toBeRejectedWith(jasmine.objectContaining({ status: 404 }));
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('rejects an HTML page (e.g. a network filter) instead of treating it as the document', async () => {
    const fetchFn = jasmine.createSpy('fetch').and.resolveTo(reply(200, 'text/html; charset=utf-8', '<html>'));

    await expectAsync(downloadPreview(nextLink, fetchFn)).toBeRejectedWith(jasmine.any(PreviewDownloadError));
  });

  it('reports a network error as a download failure', async () => {
    const fetchFn = jasmine.createSpy('fetch').and.rejectWith(new TypeError('Failed to fetch'));

    await expectAsync(downloadPreview(nextLink, fetchFn)).toBeRejectedWith(jasmine.objectContaining({ status: 0 }));
  });

  it('does not download at all when the backend refuses a link', async () => {
    const fetchFn = jasmine.createSpy('fetch');
    nextLink.and.rejectWith(new Error('403 from /preview-url'));

    await expectAsync(downloadPreview(nextLink, fetchFn)).toBeRejectedWithError('403 from /preview-url');
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
