import {
  FORMATION_ATTENTION_WEIGHT,
  FORMATION_NOISE,
  CENTER_STREAK_PENALTY,
  CENTER_STREAK_PENALTY_MAX,
  FRESHNESS_WEIGHT,
  ROOKIE_SENBATSU_SLOTS,
  SENBATSU_ROWS,
  SENBATSU_SIZE,
  TURNS_PER_YEAR,
} from './constants';
import { generateSingleTitle } from './names';
import type { Rng } from './rng';
import type { Formation, FormationSlot, GameState, Member, RowNo } from './types';
import { activeMembers, addAttention, addLog, totalStats } from './util';

export function baseFormationScore(m: Member): number {
  return totalStats(m) + m.attention * FORMATION_ATTENTION_WEIGHT;
}

export function formationScore(m: Member, rng: Rng): number {
  return baseFormationScore(m) + rng.range(0, FORMATION_NOISE);
}

/**
 * 期の若さ (0〜1)。在籍中の期の中で最新期が1、最古の期が0。
 * 期が1つしかなければ全員0。
 */
export function freshness(members: Member[]): Map<number, number> {
  const gens = [...new Set(members.map((m) => m.generation))].sort((a, b) => a - b);
  const res = new Map<number, number>();
  for (const m of members) {
    res.set(m.id, gens.length <= 1 ? 0 : gens.indexOf(m.generation) / (gens.length - 1));
  }
  return res;
}

/** 期の若さによる加点。運営は新しい期を推したい */
export function freshnessBonus(members: Member[]): Map<number, number> {
  const fr = freshness(members);
  const avg = members.reduce((a, m) => a + baseFormationScore(m), 0) / Math.max(1, members.length);
  const res = new Map<number, number>();
  for (const m of members) res.set(m.id, (fr.get(m.id) ?? 0) * FRESHNESS_WEIGHT * avg);
  return res;
}

/** 序列に応じた注目度ボーナス */
export function formationBonus(rank: number, row: RowNo | 0): number {
  if (rank === 1) return 30;
  if (row === 1) return 18;
  if (row === 2) return 11;
  if (row === 3) return 7;
  return 2;
}

/** 序列順のメンバーを列内で「中央が一番手」になるよう並べる */
export function arrangeRow(ids: number[]): number[] {
  const row: number[] = [];
  ids.forEach((id, i) => {
    if (i % 2 === 0) row.push(id);
    else row.unshift(id);
  });
  return row;
}

export function rowOf(rank: number): RowNo | 0 {
  let acc = 0;
  for (let r = 0; r < SENBATSU_ROWS.length; r++) {
    acc += SENBATSU_ROWS[r];
    if (rank <= acc) return (r + 1) as RowNo;
  }
  return 0;
}

/** 直近のシングルで何作連続センターを務めているか */
export function centerStreak(state: GameState, memberId: number): number {
  let n = 0;
  for (let i = state.formations.length - 1; i >= 0; i--) {
    if (state.formations[i].centerId !== memberId) break;
    n++;
  }
  return n;
}

/** 連続センターによる減点率 (0〜上限) */
export function centerStreakPenaltyRate(streak: number): number {
  return Math.min(CENTER_STREAK_PENALTY_MAX, streak * CENTER_STREAK_PENALTY);
}

export function buildFormation(state: GameState, rng: Rng): Formation {
  // 謹慎中・ケガ中のプレイヤーは選考対象外
  const playerOut = state.player.suspendedTurns > 0 || state.player.injuredTurns > 0;
  const eligible = activeMembers(state).filter((m) => !(m.isPlayer && playerOut));
  const bonus = freshnessBonus(eligible);
  const scored = eligible.map((m) => {
    // 連続センターが続くほど減点 (マンネリ防止)
    const penalty = baseFormationScore(m) * centerStreakPenaltyRate(centerStreak(state, m.id));
    return { m, s: formationScore(m, rng) + (bonus.get(m.id) ?? 0) - penalty };
  });
  scored.sort((a, b) => b.s - a.s);

  // 期待の新人枠: 加入1年以内の最新期の上位メンバーは最低でも選抜に入れる
  if (scored.length > SENBATSU_SIZE) {
    const newestGen = Math.max(...eligible.map((m) => m.generation));
    const rookies = scored
      .filter((x) => x.m.generation === newestGen && newestGen > 1 && state.turn - x.m.joinedTurn < TURNS_PER_YEAR)
      .slice(0, ROOKIE_SENBATSU_SLOTS);
    const missing = rookies.filter((r) => scored.indexOf(r) >= SENBATSU_SIZE);
    for (const r of missing) scored.splice(scored.indexOf(r), 1);
    // 選抜の最後尾に入れる (押し出されたメンバーはアンダーへ)
    scored.splice(SENBATSU_SIZE - missing.length, 0, ...missing);
  }

  // 加入後初めてのシングルを迎える逸材は、センターに大抜擢
  let prodigyCenter = false;
  const debut = scored.find(
    (x) => x.m.prodigy && !state.formations.some((f) => f.slots.some((sl) => sl.memberId === x.m.id)),
  );
  if (debut) {
    scored.splice(scored.indexOf(debut), 1);
    scored.unshift(debut);
    prodigyCenter = true;
  }

  // 総選挙1位はセンター確約 (逸材の大抜擢より優先)
  let electionCenter = false;
  if (state.electionCenterId !== null) {
    const idx = scored.findIndex((x) => x.m.id === state.electionCenterId);
    if (idx > 0) {
      const [c] = scored.splice(idx, 1);
      scored.unshift(c);
      prodigyCenter = false;
    }
    electionCenter = idx >= 0;
    state.electionCenterId = null;
  }

  const slots: FormationSlot[] = scored.map((x, i) => ({
    memberId: x.m.id,
    rank: i + 1,
    row: rowOf(i + 1),
  }));

  const rows: number[][] = SENBATSU_ROWS.map((_, r) =>
    arrangeRow(slots.filter((s) => s.row === r + 1).map((s) => s.memberId)),
  );

  state.singleNo++;
  const titles = new Set(state.formations.map((f) => f.title));
  return {
    singleNo: state.singleNo,
    title: generateSingleTitle(rng, titles),
    turn: state.turn,
    slots,
    rows,
    centerId: slots[0]?.memberId ?? -1,
    electionCenter,
    prodigyCenter,
  };
}

/** フォーメーションを確定させ、注目度ボーナスと実績を反映 */
export function applyFormation(state: GameState, f: Formation): void {
  const inFormation = new Set(f.slots.map((s) => s.memberId));
  for (const m of activeMembers(state)) {
    if (!inFormation.has(m.id)) m.lastRank = undefined;
  }
  for (const s of f.slots) {
    const m = state.members.find((x) => x.id === s.memberId);
    if (!m) continue;
    m.lastRank = s.rank;
    addAttention(m, formationBonus(s.rank, s.row));
  }

  const ach = state.player.achievements;
  ach.singleCount++;
  const mine = f.slots.find((s) => s.memberId === state.playerId);
  const center = state.members.find((m) => m.id === f.centerId);
  addLog(state, `${f.singleNo}thシングル「${f.title}」発売！センターは${center?.name ?? '?'}`, 'event');
  if (!mine) {
    addLog(state, '今回のシングルには参加できなかった…', 'bad');
    return;
  }
  if (ach.bestRank === null || mine.rank < ach.bestRank) ach.bestRank = mine.rank;
  if (mine.rank === 1) ach.centerCount++;
  if (mine.row !== 0) ach.senbatsuCount++;
  if (mine.row === 1) ach.frontCount++;
  const where = mine.rank === 1 ? 'センター' : mine.row === 0 ? 'アンダー' : `${mine.row}列目`;
  addLog(state, `あなたの序列は${mine.rank}位（${where}）`, mine.row === 0 ? 'info' : 'good');
}
