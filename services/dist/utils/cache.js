"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheManager = void 0;
const node_cache_1 = __importDefault(require("node-cache"));
class CacheManager {
    constructor(defaultTTL = 60) {
        this.cache = new node_cache_1.default({
            stdTTL: defaultTTL,
            checkperiod: 30,
            useClones: false
        });
    }
    set(key, value, ttl) {
        const entry = {
            data: value,
            timestamp: Date.now(),
            ttl: ttl || this.cache.options.stdTTL || 60
        };
        this.cache.set(key, entry, ttl || this.cache.options.stdTTL || 60);
    }
    get(key) {
        const entry = this.cache.get(key);
        if (!entry)
            return null;
        // Check if entry is still valid
        const now = Date.now();
        if (now - entry.timestamp > entry.ttl * 1000) {
            this.cache.del(key);
            return null;
        }
        return entry.data;
    }
    has(key) {
        return this.cache.has(key);
    }
    del(key) {
        this.cache.del(key);
    }
    clear() {
        this.cache.flushAll();
    }
    getStats() {
        return this.cache.getStats();
    }
    // Get or set pattern - useful for expensive operations
    async getOrSet(key, factory, ttl) {
        const cached = this.get(key);
        if (cached !== null) {
            return cached;
        }
        const value = await factory();
        this.set(key, value, ttl);
        return value;
    }
}
exports.CacheManager = CacheManager;
//# sourceMappingURL=cache.js.map