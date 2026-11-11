import { readStorage, writeStorage, removeStorage } from '../../../shared/lib/storage.ts';

// ========================
// Bet History with Anti-Tamper (localStorage + HMAC)
// ========================

import { formatCurrency } from '../../../shared/lib/format.ts';

const HISTORY_KEY = 'bj_history';
const LEGACY_SIG_KEY = 'bj_history_sig';
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

interface StoredHistoryDoc {
  data: string;
  sig: string;
}

let historyQueue: Promise<unknown> = Promise.resolve();

function enqueueHistory<T>(fn: () => Promise<T>): Promise<T> {
  const next = historyQueue.then(fn, fn);
  historyQueue = next;
  return next;
}

async function sign(data: string): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    return `fallback-history-${data.length}`;
  }
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

async function internalGetHistory(): Promise<BetRecord[]> {
  if (typeof window === 'undefined') return [];

  try {
    const stored = readStorage(HISTORY_KEY);
    if (!stored) return [];

    let dataStr: string | null = null;
    let sig: string | null = null;

    try {
      const parsed = JSON.parse(stored) as Partial<StoredHistoryDoc>;
      if (parsed && typeof parsed.data === 'string' && typeof parsed.sig === 'string') {
        dataStr = parsed.data;
        sig = parsed.sig;
      }
    } catch {
      // Legacy un-nested string
    }

    if (!dataStr || !sig) {
      const legacySig = readStorage(LEGACY_SIG_KEY);
      if (legacySig) {
        dataStr = stored;
        sig = legacySig;
      } else {
        return [];
      }
    }

    const valid = await verify(dataStr, sig);
    if (!valid) {
      console.warn('Bet history tampered! Clearing.');
      removeStorage(HISTORY_KEY);
      removeStorage(LEGACY_SIG_KEY);
      return [];
    }

    const records = JSON.parse(dataStr);
    if (!Array.isArray(records)) return [];

    // Migrate from legacy format if needed
    if (readStorage(LEGACY_SIG_KEY)) {
      await internalSaveHistory(records as BetRecord[]);
      try {
        removeStorage(LEGACY_SIG_KEY);
      } catch {
        // Ignore
      }
    }

    return records as BetRecord[];
  } catch {
    return [];
  }
}

async function internalSaveHistory(records: BetRecord[]): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const data = JSON.stringify(records.slice(-100));
    const sig = await sign(data);
    const doc: StoredHistoryDoc = { data, sig };
    writeStorage(HISTORY_KEY, JSON.stringify(doc));
    removeStorage(LEGACY_SIG_KEY);
  } catch (err) {
    console.error('Failed to save history to storage:', err);
  }
}

export function getHistory(): Promise<BetRecord[]> {
  return enqueueHistory(internalGetHistory);
}

export async function addRecord(record: BetRecord): Promise<BetRecord[]> {
  return enqueueHistory(async () => {
    const history = await internalGetHistory();
    const updated = [...history, record].slice(-100);
    await internalSaveHistory(updated);
    return updated;
  });
}

export async function clearHistory(): Promise<void> {
  return enqueueHistory(async () => {
    await internalSaveHistory([]);
  });
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
