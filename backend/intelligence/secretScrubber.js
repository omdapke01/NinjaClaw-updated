// Pre-Flight Secret & PII Scrubber for Enterprise Repositories

const SENSITIVE_FILE_PATTERNS = [
  /^\.env(\..+)?$/i,
  /\.pem$/i,
  /\.key$/i,
  /\.pfx$/i,
  /\.p12$/i,
  /id_rsa$/i,
  /id_ed25519$/i,
  /credentials\.json$/i,
  /service-account.*\.json$/i
];

const SECRET_PATTERNS = [
  // Google / Gemini API Keys
  { name: "Google API Key", regex: /AIza[0-9A-Za-z-_]{35}/g },

  // AWS Keys
  { name: "AWS Access Key", regex: /\b(AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}\b/g },
  { name: "AWS Secret Key", regex: /(?:aws_secret_access_key|aws_secret_key|secret_access_key)\s*[:=]\s*["']?([0-9a-zA-Z/+]{40})["']?/gi },

  // GitHub Tokens
  { name: "GitHub Token", regex: /\b(gh[pousr]_[A-Za-z0-9_]{36,255}|github_pat_[A-Za-z0-9_]{40,255})\b/g },

  // OpenAI / LLM Keys
  { name: "OpenAI/API Key", regex: /\b(sk-[A-Za-z0-9_-]{20,64})\b/g },

  // Slack Tokens
  { name: "Slack Token", regex: /\bxox[baprs]-[0-9A-Za-z]{10,48}\b/g },

  // JWT Tokens
  { name: "JWT Token", regex: /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g },

  // Private Keys
  { name: "Private Key", regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g },

  // Database Connection Strings with Passwords (mask user:password@host)
  {
    name: "Database URI",
    regex: /((?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis):\/\/[^:\s"']+):([^@\s"']+)@/gi,
    replaceFn: (_match, prefix) => `${prefix}:[REDACTED_PASSWORD]@`
  },

  // Generic Password/Secret Assignments
  {
    name: "Generic Secret Assignment",
    regex: /(?:password|passwd|api_key|apikey|secret_key|auth_token|client_secret)\s*[:=]\s*["']([^"'\r\n]{8,})["']/gi,
    replaceFn: (match) => {
      return match.replace(/["']([^"'\r\n]{8,})["']/, `"[REDACTED_SECRET]"`);
    }
  }
];

// Shannon Entropy calculation for string randomness
export function calculateShannonEntropy(str) {
  if (!str || str.length === 0) return 0;
  const frequencies = new Map();
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    frequencies.set(char, (frequencies.get(char) || 0) + 1);
  }

  let entropy = 0;
  const len = str.length;
  for (const count of frequencies.values()) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

export function isSensitiveFile(filePath = "") {
  const baseName = filePath.split("/").pop() || filePath;
  return SENSITIVE_FILE_PATTERNS.some((pattern) => pattern.test(baseName));
}

export function scrubSecrets(content = "", filePath = "") {
  if (!content) return "";

  // If the file is a known sensitive file (.env, .pem, credentials.json), redact completely
  if (isSensitiveFile(filePath)) {
    return `[ENTIRE_FILE_REDACTED: Sensitive configuration file (${filePath})]`;
  }

  let scrubbed = content;

  // 1. Run regex-based pattern replacements
  for (const rule of SECRET_PATTERNS) {
    if (rule.replaceFn) {
      scrubbed = scrubbed.replace(rule.regex, rule.replaceFn);
    } else {
      scrubbed = scrubbed.replace(rule.regex, "[REDACTED_SECRET]");
    }
  }

  // 2. High entropy string literals check in code (e.g. raw 32+ hex/base64 strings assigned in code)
  // Match string literals of length >= 28: "..." or '...'
  scrubbed = scrubbed.replace(/(['"])([A-Za-z0-9+/=_-]{28,128})\1/g, (match, quote, inner) => {
    // Avoid redacting common URLs, long paths, or repeated characters
    if (inner.includes("/") || inner.includes("\\") || inner.includes(" ")) {
      return match;
    }
    const entropy = calculateShannonEntropy(inner);
    const isHex = /^[0-9a-fA-F]+$/.test(inner);
    // Hex strings max theoretical entropy is 4.0 (so > 3.2 is high entropy)
    // Base64/Alphanumeric strings max theoretical entropy is ~6.0 (so > 4.2 is high entropy)
    if ((isHex && entropy > 3.2 && inner.length >= 32) || (!isHex && entropy > 4.2)) {
      return `${quote}[REDACTED_SECRET]${quote}`;
    }
    return match;
  });

  return scrubbed;
}
