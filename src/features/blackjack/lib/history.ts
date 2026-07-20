// ========================
// Bet History with Anti-Tamper (localStorage + HMAC)
// ========================

import { formatCurrency } from '@/shared/lib/format';

const HISTORY_KEY = 'bj_history';
const HISTORY_SIG_KEY = 'bj_history_sig';
const SECRET_PARTS = ['H1st0ry', '_K3y_', 'Bl4ck', 'J4ck!'];
const getSecret = () => SECRET_PARTS.join('');

export interface BetRecord {
  round: number;
  bet: number;
  result: 'win' | 'lose' | 'push' | 'blackjack';
  payout: number;
  balanceAfter: number;
  timestamp: number;
}

async function sign(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function verify(data: string, signature: string): Promise<boolean> {
  const expected = await sign(data);
  if (expected.length !== signature.length) return false;
  let result = 0;
  for (let i = 0; i < expected.length; i++) {
    result |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return result === 0;
}

export async function getHistory(): Promise<BetRecord[]> {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(HISTORY_KEY);
  const sig = localStorage.getItem(HISTORY_SIG_KEY);
  if (!stored || !sig) return [];

  const valid = await verify(stored, sig);
  if (!valid) {
    console.warn('Bet history tampered! Clearing.');
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(HISTORY_SIG_KEY);
    return [];
  }

  try {
    const records = JSON.parse(stored);
    if (!Array.isArray(records)) return [];
    return records as BetRecord[];
  } catch {
    return [];
  }
}

export async function addRecord(record: BetRecord): Promise<BetRecord[]> {
  const history = await getHistory();
  // Keep last 100 records
  const updated = [...history, record].slice(-100);
  const data = JSON.stringify(updated);
  const sig = await sign(data);
  localStorage.setItem(HISTORY_KEY, data);
  localStorage.setItem(HISTORY_SIG_KEY, sig);
  return updated;
}

export async function clearHistory(): Promise<void> {
  const data = JSON.stringify([]);
  const sig = await sign(data);
  localStorage.setItem(HISTORY_KEY, data);
  localStorage.setItem(HISTORY_SIG_KEY, sig);
}

export function formatRecord(r: BetRecord): string {
  const resultEmoji: Record<string, string> = {
    win: 'WIN ',
    lose: 'LOSE ',
    push: 'PUSH ',
    blackjack: 'BJ ',
  };
  const delta = r.result === 'lose'
    ? `-${formatCurrency(r.bet)}`
    : r.result === 'push'
      ? formatCurrency(0)
      : `+${formatCurrency(r.payout - r.bet)}`;
  return `[${resultEmoji[r.result]}] Bet ${formatCurrency(r.bet)} -> ${delta} (Bal: ${formatCurrency(r.balanceAfter)})`;
}
