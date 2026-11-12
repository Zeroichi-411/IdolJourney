import type { GameState } from './types';

const KEY = 'idoljourney-save-v1';

export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // ストレージが使えない環境では保存しない
  }
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    if (s?.version !== 1 || !Array.isArray(s.members)) return null;
    // 旧バージョンのセーブデータを補完
    s.pendingChoice ??= null;
    for (const m of s.members) m.talent ??= 1;
    return s;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // noop
  }
}
