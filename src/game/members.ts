import {
  AUDITION_DELAY,
  AUDITION_MAX,
  AUDITION_MIN,
  AUDITION_THRESHOLD,
  SENBATSU_SIZE,
  TURNS_PER_YEAR,
} from './constants';
import { generateName } from './names';
import type { Rng } from './rng';
import type { GameEvent, GameState, Member, StatKey } from './types';
import { activeMembers, addAttention, addLog, addStat } from './util';

const STATS: StatKey[] = ['vocal', 'dance', 'visual'];

export function usedNames(state: GameState): Set<string> {
  return new Set(state.members.map((m) => m.name));
}

export function createNpc(
  rng: Rng,
  id: number,
  name: string,
  generation: number,
  joinedTurn: number,
  newcomer: boolean,
): Member {
  // 新期生は能力低めだが、話題性で注目度を少しもらえる
  const lo = newcomer ? 15 : 20;
  const hi = newcomer ? 55 : 80;
  const m: Member = {
    id,
    name,
    generation,
    isPlayer: false,
    vocal: rng.int(lo, hi),
    dance: rng.int(lo, hi),
    visual: rng.int(lo, hi),
    attention: newcomer ? rng.int(15, 40) : rng.int(5, 30),
    joinedTurn,
    graduated: false,
    focus: rng.pick(STATS),
    talent: Math.round(rng.range(0.6, newcomer ? 1.7 : 1.5) * 100) / 100,
  };
  // 才能のあるメンバーは最初から少し注目されている
  if (m.talent >= 1.3) m.attention += rng.int(10, 30);
  // たまに一芸に秀でたメンバー
  if (rng.chance(0.25)) m[m.focus] += rng.int(15, 30);
  return m;
}

export function npcGrowth(state: GameState, rng: Rng): void {
  for (const m of activeMembers(state)) {
    if (m.isPlayer) continue;
    // 1ターンに1つの能力を伸ばす (得意分野寄り)
    if (rng.chance(0.85)) {
      const stat = rng.chance(0.5) ? m.focus : rng.pick(STATS);
      // 加入1年目はぐんぐん伸びる
      const rookie = state.turn - m.joinedTurn < TURNS_PER_YEAR && m.generation > 1 ? 1.6 : 1;
      const gain = rng.range(4, 10) * m.talent * rookie * Math.max(0.3, 1 - m[stat] / 1100);
      addStat(m, stat, gain);
    }
    // 人気の自然な伸び (握手会・メディア露出など)
    addAttention(m, rng.range(-1, 2) * m.talent);
    // NPC もたまにバズる
    if (rng.chance(0.006)) {
      const d = addAttention(m, rng.int(15, 35));
      addLog(state, `${m.name}のSNSがバズって話題に（注目度+${d}）`, 'info');
    }
  }
}

/** 月末の NPC 卒業判定。卒業したメンバー名を返す */
export function processGraduations(state: GameState, rng: Rng): Member[] {
  const graduated: Member[] = [];
  for (const m of activeMembers(state)) {
    if (m.isPlayer) continue;
    const tenureYears = (state.turn - m.joinedTurn) / TURNS_PER_YEAR;
    if (tenureYears < 1) continue;
    let p = 0.004 + 0.006 * tenureYears;
    if (m.lastRank === undefined || m.lastRank > SENBATSU_SIZE) p += 0.006;
    if (tenureYears > 5) p += 0.01;
    // 上位メンバーは卒業しにくい
    if (m.lastRank !== undefined && m.lastRank <= 5) p *= 0.5;
    if (rng.chance(p)) {
      m.graduated = true;
      m.graduatedTurn = state.turn;
      graduated.push(m);
    }
  }
  return graduated;
}

export function graduationEvent(state: GameState, graduated: Member[]): GameEvent | null {
  if (graduated.length === 0) return null;
  const lines: string[] = [];
  for (const m of graduated) {
    const years = Math.max(1, Math.round((state.turn - m.joinedTurn) / TURNS_PER_YEAR));
    lines.push(`${m.generation}期生 ${m.name} が卒業を発表しました。（在籍${years}年）`);
    addLog(state, `${m.name}（${m.generation}期生）が卒業`, 'event');
    const aff = state.player.affinity[m.id] ?? 0;
    if (aff >= 60) lines.push(`仲の良かった${m.name}から「これからも頑張ってね」と手紙をもらった。`);
  }
  return { kind: 'graduation', names: graduated.map((m) => m.name), lines };
}

/** オーディションの告知と加入処理 */
export function processAudition(state: GameState, rng: Rng): GameEvent | null {
  if (state.auditionTurn === null) {
    if (activeMembers(state).length <= AUDITION_THRESHOLD) {
      state.auditionTurn = state.turn + AUDITION_DELAY;
      addLog(state, `${state.nextGeneration}期生オーディションの開催が決定！`, 'event');
      return {
        kind: 'audition',
        generation: state.nextGeneration,
        names: [],
        announced: true,
        joinTurn: state.auditionTurn,
      };
    }
    return null;
  }
  if (state.turn < state.auditionTurn) return null;

  const gen = state.nextGeneration;
  const count = rng.int(AUDITION_MIN, AUDITION_MAX);
  const names = usedNames(state);
  const newcomers: Member[] = [];
  for (let i = 0; i < count; i++) {
    const m = createNpc(rng, state.nextMemberId++, generateName(rng, names), gen, state.turn, true);
    newcomers.push(m);
    state.members.push(m);
  }
  state.nextGeneration++;
  state.auditionTurn = null;
  addLog(state, `${gen}期生 ${count}名が加入！`, 'event');
  return { kind: 'audition', generation: gen, names: newcomers.map((m) => m.name), announced: false };
}
