import { readStorage, writeStorage, removeStorage } from '../../../shared/lib/storage.ts';

// ========================
// Anti-Tamper Wallet (localStorage with HMAC integrity & Atomic Persistence)
// ========================

const STORAGE_KEY = 'bj_wallet';
const LEGACY_SIG_KEY = 'bj_wallet_sig';

// Obfuscated key parts to deter casual tampering
const SECRET_PARTS = ['Bl4ck', 'J4ck', '_S3cr3t_', 'K3y_2024!'];
const getSecret = () => SECRET_PARTS.join('');

export const INITIAL_BALANCE = 1000;
export const RESET_BALANCE = 100;

interface StoredWalletDoc {
  payload: string;
  sig: string;
}

interface WalletPayload {
  balance: number;
  timestamp: number;
  version: number;
}

// Mutex queue to serialize all wallet async read/write operations
let walletQueue: Promise<unknown> = Promise.resolve();

function enqueueWallet<T>(fn: () => Promise<T>): Promise<T> {
  const next = walletQueue.then(fn, fn);
  walletQueue = next;
  return next;
}

async function hmacSign(data: string): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    // Graceful fallback for non-secure contexts (e.g. LAN http)
    return `fallback-${data.length}-${data.charCodeAt(0) || 0}`;
  }
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacVerify(data: string, signature: string): Promise<boolean> {
  const expected = await hmacSign(data);
  if (expected.length !== signature.length) return false;
  let result = 0;
  for (let i = 0; i < expected.length; i++) {
    result |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return result === 0;
}

function createPayload(balance: number): string {
  return JSON.stringify({
    balance,
    timestamp: Date.now(),
    version: 2,
  });
}

function parsePayload(payloadStr: string): number | null {
  try {
    const data = JSON.parse(payloadStr) as WalletPayload;
    if (typeof data?.balance !== 'number' || !Number.isFinite(data.balance) || data.balance <= 0) {
      return null;
    }
    return Math.floor(data.balance);
  } catch {
    return null;
  }
}

async function internalGetBalance(): Promise<number> {
  if (typeof window === 'undefined') return INITIAL_BALANCE;

  try {
    const stored = readStorage(STORAGE_KEY);

    if (!stored) {
      // First time initialization
      await internalSetBalance(INITIAL_BALANCE);
      return INITIAL_BALANCE;
    }

    let payload: string | null = null;
    let sig: string | null = null;

    // Check if stored data is the new atomic single-document format
    try {
      const parsed = JSON.parse(stored) as Partial<StoredWalletDoc>;
      if (parsed && typeof parsed.payload === 'string' && typeof parsed.sig === 'string') {
        payload = parsed.payload;
        sig = parsed.sig;
      }
    } catch {
      // Not a JSON object doc — likely legacy payload string
    }

    if (!payload || !sig) {
      // Check legacy two-key format
      const legacySig = readStorage(LEGACY_SIG_KEY);
      if (legacySig) {
        payload = stored;
        sig = legacySig;
      } else {
        await internalSetBalance(INITIAL_BALANCE);
        return INITIAL_BALANCE;
      }
    }

    const valid = await hmacVerify(payload, sig);
    if (!valid) {
      console.warn('Wallet tampering detected! Resetting balance.');
      await internalSetBalance(RESET_BALANCE);
      return RESET_BALANCE;
    }

    const balance = parsePayload(payload);
    if (balance === null) {
      await internalSetBalance(RESET_BALANCE);
      return RESET_BALANCE;
    }

    // If read from legacy format, cleanly migrate to atomic doc
    if (readStorage(LEGACY_SIG_KEY)) {
      await internalSetBalance(balance);
      try {
        removeStorage(LEGACY_SIG_KEY);
      } catch {
        // Ignore removal error
      }
    }

    return balance;
  } catch (err) {
    console.error('Failed to read balance from storage:', err);
    return INITIAL_BALANCE;
  }
}

async function internalSetBalance(balance: number): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const sanitizedBalance = Math.max(0, Math.floor(Number.isFinite(balance) ? balance : RESET_BALANCE));
    const payload = createPayload(sanitizedBalance);
    const sig = await hmacSign(payload);
    const doc: StoredWalletDoc = { payload, sig };
    writeStorage(STORAGE_KEY, JSON.stringify(doc));
    // Clean up legacy signature key if present
    removeStorage(LEGACY_SIG_KEY);
  } catch (err) {
    console.error('Failed to save balance to storage:', err);
  }
}

export function getBalance(): Promise<number> {
  return enqueueWallet(internalGetBalance);
}

export function setBalance(balance: number): Promise<void> {
  return enqueueWallet(() => internalSetBalance(balance));
}

export async function adjustBalance(delta: number): Promise<number> {
  return enqueueWallet(async () => {
    const current = await internalGetBalance();
    let newBalance = current + delta;
    if (newBalance <= 0) {
      newBalance = RESET_BALANCE;
    }
    await internalSetBalance(newBalance);
    return newBalance;
  });
}
