export type SignedCapabilityClaims = {
  version: number;
  expiresAt: number;
  nonce: string;
  scope: string;
};

const capabilityTokenPattern = /^([A-Za-z0-9_-]{16,768})\.([A-Za-z0-9_-]{43})$/u;
const capabilityNoncePattern = /^[A-Za-z0-9_-]{22}$/u;
const capabilityScopePattern = /^[a-z][a-z0-9:-]{1,79}$/u;

export async function issueSignedCapability(
  secret: string,
  claims: SignedCapabilityClaims,
): Promise<string> {
  if (!isValidCapabilitySecret(secret) || !isValidClaims(claims)) {
    throw new Error("INVALID_CAPABILITY_CONFIGURATION");
  }
  const encodedClaims = encodeBase64Url(new TextEncoder().encode(JSON.stringify(claims)));
  const signature = await sign(secret, encodedClaims);
  return `${encodedClaims}.${encodeBase64Url(signature)}`;
}

export async function verifySignedCapability(
  secret: string,
  token: string,
): Promise<SignedCapabilityClaims | null> {
  if (!isValidCapabilitySecret(secret)) throw new Error("INVALID_CAPABILITY_CONFIGURATION");
  const match = capabilityTokenPattern.exec(token);
  if (!match) return null;
  let signature: Uint8Array;
  try {
    signature = decodeBase64Url(match[2]);
  } catch {
    return null;
  }
  const key = await importSigningKey(secret, ["verify"]);
  const validSignature = await crypto.subtle.verify(
    "HMAC",
    key,
    Uint8Array.from(signature).buffer,
    new TextEncoder().encode(match[1]),
  );
  if (!validSignature) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(decodeBase64Url(match[1]))) as unknown;
    return isValidClaims(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function createCapabilityNonce(): string {
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(16)));
}

function isValidClaims(value: unknown): value is SignedCapabilityClaims {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const claims = value as Record<string, unknown>;
  return Object.keys(claims).length === 4
    && Number.isSafeInteger(claims.version)
    && Number(claims.version) > 0
    && Number.isSafeInteger(claims.expiresAt)
    && Number(claims.expiresAt) > 0
    && typeof claims.nonce === "string"
    && capabilityNoncePattern.test(claims.nonce)
    && typeof claims.scope === "string"
    && capabilityScopePattern.test(claims.scope);
}

function isValidCapabilitySecret(secret: string): boolean {
  return secret.length >= 32 && secret.length <= 512;
}

async function sign(secret: string, value: string): Promise<ArrayBuffer> {
  const key = await importSigningKey(secret, ["sign"]);
  return crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
}

async function importSigningKey(secret: string, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages,
  );
}

function encodeBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error("INVALID_BASE64URL");
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/") + padding);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
