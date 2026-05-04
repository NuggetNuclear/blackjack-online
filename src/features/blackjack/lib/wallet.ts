// ========================
// Anti-Tamper Wallet (localStorage with HMAC integrity)
// ========================

const STORAGE_KEY = 'bj_wallet';
const HMAC_KEY = 'bj_wallet_sig';
// This secret is obfuscated but since it runs client-side, it's not truly secret.
// The goal is to deter casual tampering, not prevent determined hackers.
const SECRET_PARTS = ['Bl4ck', 'J4ck', '_S3cr3t_', 'K3y_2024!'];
const getSecret = () => SECRET_PARTS.join('');

const INITIAL_BALANCE = 1000;
const RESET_BALANCE = 100;

async function hmacSign(data: string): Promise<string> {
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
  // Constant-time comparison
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
    version: 1,
  });
}

export async function getBalance(): Promise<number> {
  if (typeof window === 'undefined') return INITIAL_BALANCE;

  const stored = localStorage.getItem(STORAGE_KEY);
  const sig = localStorage.getItem(HMAC_KEY);

  if (!stored || !sig) {
    // First time — initialize
    await setBalance(INITIAL_BALANCE);
    return INITIAL_BALANCE;
  }

  const valid = await hmacVerify(stored, sig);
  if (!valid) {
    // Tampered! Reset to penalty amount
    console.warn('Wallet tampering detected! Resetting balance.');
    await setBalance(RESET_BALANCE);
    return RESET_BALANCE;
  }

  try {
    const data = JSON.parse(stored);
    const balance = data.balance;
    if (typeof balance !== 'number' || balance <= 0 || !isFinite(balance)) {
      await setBalance(RESET_BALANCE);
      return RESET_BALANCE;
    }
    return balance;
  } catch {
    await setBalance(RESET_BALANCE);
    return RESET_BALANCE;
  }
}

export async function setBalance(balance: number): Promise<void> {
  if (typeof window === 'undefined') return;
  const payload = createPayload(Math.max(0, Math.round(balance)));
  const sig = await hmacSign(payload);
  localStorage.setItem(STORAGE_KEY, payload);
  localStorage.setItem(HMAC_KEY, sig);
}

export async function adjustBalance(delta: number): Promise<number> {
  const current = await getBalance();
  let newBalance = current + delta;
  if (newBalance <= 0) {
    newBalance = RESET_BALANCE;
  }
  await setBalance(newBalance);
  return newBalance;
}
