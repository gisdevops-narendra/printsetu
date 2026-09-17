export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');

export interface PutObjectInput {
  key: string;
  body: Buffer;
  contentType: string;
}

/**
 * Storage abstraction so the rest of the app never imports an SDK
 * directly. Today this is backed by MinIO; swapping to real AWS S3 later
 * is a config change (S3_ENDPOINT unset + real credentials/region) with
 * zero call-site changes — see S3StorageService.
 */
export interface IStorageService {
  putObject(input: PutObjectInput): Promise<void>;
  getObject(key: string): Promise<Buffer>;
  getSignedDownloadUrl(key: string, ttlSeconds?: number): Promise<string>;
  deleteObject(key: string): Promise<void>;
  objectExists(key: string): Promise<boolean>;
}
