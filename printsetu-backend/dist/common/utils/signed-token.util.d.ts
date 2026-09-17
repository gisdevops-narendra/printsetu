export interface SignedTokenPayload {
    [key: string]: unknown;
    exp: number;
}
export declare function signToken(payload: SignedTokenPayload, secret: string): string;
export declare function verifyToken<T extends SignedTokenPayload = SignedTokenPayload>(token: string, secret: string): T;
