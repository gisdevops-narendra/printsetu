/** The file behind a signed preview link could not be downloaded (HTTP status from the object store, or 0 for a network error). */
export class PreviewDownloadError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'PreviewDownloadError';
  }
}

/**
 * Downloads a document for the editor through a *fresh* presigned link.
 *
 * Signed preview links live for only 120s, so none is ever kept: callers pass
 * a function that asks the backend for a new link, it is used once, straight
 * away, and only the downloaded bytes are kept. If the object store still
 * answers 403 (the link expired before the request reached it — slow network,
 * a throttled background tab, a wrong client clock), one more fresh link is
 * requested and tried. The download bypasses the browser cache so a cached
 * error can never be replayed.
 *
 * A failed response — MinIO's 403 XML, or a network filter's HTML block page —
 * throws instead of being handed to Fabric/pdf.js as if it were the file
 * (which only surfaces as an unhelpful "Error loading blob:…").
 */
export async function downloadPreview(
  getSignedUrl: () => Promise<string>,
  fetchFn: typeof fetch = (input, init) => fetch(input, init),
): Promise<Blob> {
  const MAX_ATTEMPTS = 2;
  for (let attempt = 1; ; attempt++) {
    const url = await getSignedUrl();
    let res: Response;
    try {
      res = await fetchFn(url, { cache: 'no-store' });
    } catch (error) {
      throw new PreviewDownloadError(0, `Preview download failed: ${error instanceof Error ? error.message : error}`);
    }
    const type = res.headers.get('content-type') ?? '';
    if (res.ok && !type.startsWith('text/html')) return res.blob();
    if (res.status === 403 && attempt < MAX_ATTEMPTS) continue;
    throw new PreviewDownloadError(res.status, `Preview download failed: HTTP ${res.status} (${type || 'no content type'})`);
  }
}
