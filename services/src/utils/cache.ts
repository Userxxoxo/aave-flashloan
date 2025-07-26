import NodeCache from 'node-cache';
import { CacheEntry } from '../types';

export class CacheManager {
  private cache: NodeCache;

  constructor(defaultTTL: number = 60) {
    this.cache = new NodeCache({
      stdTTL: defaultTTL,
      checkperiod: 30,
      useClones: false
    });
  }

  set<T>(key: string, value: T, ttl?: number): void {
    const entry: CacheEntry<T> = {
      data: value,
      timestamp: Date.now(),
      ttl: ttl || this.cache.options.stdTTL || 60
    };
    
    this.cache.set(key, entry, ttl || this.cache.options.stdTTL || 60);
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get<CacheEntry<T>>(key);
    if (!entry) return null;

    // Check if entry is still valid
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl * 1000) {
      this.cache.del(key);
      return null;
    }

    return entry.data;
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  del(key: string): void {
    this.cache.del(key);
  }

  clear(): void {
    this.cache.flushAll();
  }

  getStats() {
    return this.cache.getStats();
  }

  // Get or set pattern - useful for expensive operations
  async getOrSet<T>(
    key: string, 
    factory: () => Promise<T>, 
    ttl?: number
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    this.set(key, value, ttl);
    return value;
  }
}