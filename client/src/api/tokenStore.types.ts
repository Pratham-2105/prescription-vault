export type Tokens = {
    accessToken: string;
    refreshToken: string;
}

/** Where tokens live. Implemented differently per platform. */
export interface TokenStore{
    load(): Promise<Tokens | null>;
    save(tokens: Tokens): Promise<void>;
    clear(): Promise<void>;
}