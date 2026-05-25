const MAX_ENTRIES = 200;
const DEFAULT_TTL = 30 * 60 * 1000;

class CatalogCache {
  constructor() {
    this._store = new Map();
  }

  get(key) {
    const entry = this._store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this._store.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key, value, ttl = DEFAULT_TTL) {
    if (this._store.size >= MAX_ENTRIES) this._evict();
    this._store.set(key, { value, expiresAt: Date.now() + ttl });
  }

  has(key) {
    return this.get(key) !== null;
  }

  clear() {
    this._store.clear();
  }

  _evict() {
    const now = Date.now();
    for (const [k, v] of this._store) {
      if (now > v.expiresAt) this._store.delete(k);
    }
    if (this._store.size >= MAX_ENTRIES) {
      const oldest = this._store.keys().next().value;
      this._store.delete(oldest);
    }
  }
}

export default new CatalogCache();
