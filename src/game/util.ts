import { ATTENTION_MAX, STAT_MAX } from './constants';
import type { GameState, LogKind, Member, StatKey } from './types';

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function activeMembers(state: GameState): Member[] {
  return state.members.filter((m) => !m.graduated);
}

export function getMember(state: GameState, id: number): Member | undefined {
  return state.members.find((m) => m.id === id);
}

export function getPlayer(state: GameState): Member {
  const p = getMember(state, state.playerId);
  if (!p) throw new Error('player not found');
  return p;
}

export function addStat(m: Member, stat: StatKey, delta: number): number {
  const before = m[stat];
  m[stat] = clamp(Math.round(before + delta), 0, STAT_MAX);
  return m[stat] - before;
}

export function addAttention(m: Member, delta: number): number {
  const before = m.attention;
  m.attention = clamp(Math.round(before + delta), 0, ATTENTION_MAX);
  return m.attention - before;
}

export function totalStats(m: Member): number {
  return m.vocal + m.dance + m.visual;
}

export function addLog(state: GameState, text: string, kind: LogKind = 'info'): void {
  state.log.push({ turn: state.turn, text, kind });
  if (state.log.length > 300) state.log.splice(0, state.log.length - 300);
}

export function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}
