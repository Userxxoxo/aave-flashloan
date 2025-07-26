import NodeCache from 'node-cache';
export declare class CacheManager {
    private cache;
    constructor(defaultTTL?: number);
    set<T>(key: string, value: T, ttl?: number): void;
    get<T>(key: string): T | null;
    has(key: string): boolean;
    del(key: string): void;
    clear(): void;
    getStats(): NodeCache.Stats;
    getOrSet<T>(key: string, factory: () => Promise<T>, ttl?: number): Promise<T>;
}
//# sourceMappingURL=cache.d.ts.map