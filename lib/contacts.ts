// Contact matching helpers (browser + server safe; no imports).

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
// Runs of digits with common separators, optionally starting with +.
const PHONE_RE = /\+?\d[\d\s().-]{6,}\d/g;

// To E.164 (+15551234567). Numbers without a country code are assumed to
// be US/Canada. Returns null for anything that isn't a plausible number.
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) return digits.length >= 8 && digits.length <= 15 && digits[0] !== "0" ? `+${digits}` : null;
  if (trimmed.startsWith("00")) return normalizePhone(`+${digits.slice(2)}`);
  if (digits.length === 10 && digits[0] !== "0" && digits[0] !== "1") return `+1${digits}`;
  if (digits.length === 11 && digits[0] === "1") return `+${digits}`;
  return null;
}

export function extractEmails(text: string): string[] {
  return [...new Set((text.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase()))];
}

export function extractPhones(text: string): string[] {
  // Drop emails first so their digits aren't read as numbers.
  const clean = text.replace(EMAIL_RE, " ");
  return [...new Set((clean.match(PHONE_RE) ?? []).map(normalizePhone).filter((p): p is string => !!p))];
}

// Hash on the device: only SHA-256 hashes ever leave the browser.
export async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
