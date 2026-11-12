import { FORMATION_ATTENTION_WEIGHT, FORMATION_NOISE, SENBATSU_ROWS } from './constants';
import { generateSingleTitle } from './names';
import type { Rng } from './rng';
import type { Formation, FormationSlot, GameState, Member, RowNo } from './types';
import { activeMembers, addAttention, addLog, totalStats } from './util';

export function formationScore(m: Member, rng: Rng): number {
  return totalStats(m) + m.attention * FORMATION_ATTENTION_WEIGHT + rng.range(0, FORMATION_NOISE);
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

export function buildFormation(state: GameState, rng: Rng): Formation {
  // 謹慎中・ケガ中のプレイヤーは選考対象外
  const playerOut = state.player.suspendedTurns > 0 || state.player.injuredTurns > 0;
  const eligible = activeMembers(state).filter((m) => !(m.isPlayer && playerOut));
  const scored = eligible.map((m) => ({ m, s: formationScore(m, rng) }));
  scored.sort((a, b) => b.s - a.s);

  // 総選挙1位はセンター確約
  let electionCenter = false;
  if (state.electionCenterId !== null) {
    const idx = scored.findIndex((x) => x.m.id === state.electionCenterId);
    if (idx > 0) {
      const [c] = scored.splice(idx, 1);
      scored.unshift(c);
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
