import crypto from "node:crypto";

function sha256(str = "") {
  return crypto.createHash("sha256").update(str).digest("hex");
}

export class GeminiContextCacheManager {
  constructor() {
    this.cacheRegistry = new Map(); // projectId -> { cacheName, expiresAt, contentHash }
  }

  async getOrCreateCache({ projectId, staticPrefix, model, apiKey, ttlMinutes = 60 }) {
    if (!apiKey || !projectId || !staticPrefix) return null;

    const currentHash = sha256(staticPrefix);
    const existing = this.cacheRegistry.get(projectId);
    const now = Date.now();

    // Reuse existing valid cache if content has not changed and expiration has > 5 min left
    if (existing && existing.contentHash === currentHash && existing.expiresAt - now > 5 * 60 * 1000) {
      return existing.cacheName;
    }

    try {
      // Normalize model name (needs models/ prefix)
      const normalizedModel = model.startsWith("models/") ? model : `models/${model}`;
      const ttlSeconds = `${ttlMinutes * 60}s`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: normalizedModel,
            contents: [{ role: "user", parts: [{ text: staticPrefix }] }],
            ttl: ttlSeconds
          })
        }
      );

      const payload = await response.json();
      if (!response.ok) {
        // Caching is optional: if token threshold isn't reached (<32k tokens) or free tier doesn't support it,
        // log a debug note and fall back to inline prompt without failing the request
        return null;
      }

      const cacheName = payload.name;
      const expireTime = payload.expireTime ? new Date(payload.expireTime).getTime() : now + ttlMinutes * 60 * 1000;

      this.cacheRegistry.set(projectId, {
        cacheName,
        expiresAt: expireTime,
        contentHash: currentHash
      });

      return cacheName;
    } catch {
      // Fallback cleanly on network or API error
      return null;
    }
  }

  invalidateCache(projectId) {
    this.cacheRegistry.delete(projectId);
  }
}

export const contextCacheManager = new GeminiContextCacheManager();
