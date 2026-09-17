export declare const STORAGE_SERVICE: unique symbol;
export interface PutObjectInput {
    key: string;
    body: Buffer;
    contentType: string;
}
export interface IStorageService {
    putObject(input: PutObjectInput): Promise<void>;
    getObject(key: string): Promise<Buffer>;
    getSignedDownloadUrl(key: string, ttlSeconds?: number): Promise<string>;
    deleteObject(key: string): Promise<void>;
    objectExists(key: string): Promise<boolean>;
}
