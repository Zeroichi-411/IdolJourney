import { ELECTION_ATTENTION_WEIGHT, ELECTION_NOISE, ELECTION_STAT_WEIGHT } from './constants';
import { toDate } from './calendar';
import type { Rng } from './rng';
import type { ElectionResult, GameState, Member } from './types';
import { activeMembers, addAttention, addLog, totalStats } from './util';

export function electionScore(m: Member, rng: Rng): number {
  return (
    totalStats(m) * ELECTION_STAT_WEIGHT + m.attention * ELECTION_ATTENTION_WEIGHT + rng.range(0, ELECTION_NOISE)
  );
}

export function electionBonus(rank: number): number {
  if (rank === 1) return 80;
  if (rank <= 3) return 50;
  if (rank <= 10) return 25;
  if (rank <= 16) return 12;
  return 3;
}

export function runElection(state: GameState, rng: Rng): ElectionResult {
  const scored = activeMembers(state).map((m) => ({ m, s: electionScore(m, rng) }));
  scored.sort((a, b) => b.s - a.s);
  const ranking = scored.map((x, i) => ({
    memberId: x.m.id,
    rank: i + 1,
    // スコアを票数っぽく見せる
    votes: Math.round(x.s * 120 + rng.int(0, 999)),
  }));
  // 票数の並びを順位と矛盾させない
  for (let i = 1; i < ranking.length; i++) {
    if (ranking[i].votes >= ranking[i - 1].votes) ranking[i].votes = ranking[i - 1].votes - rng.int(1, 300);
  }
  return { year: toDate(state.turn).year, turn: state.turn, ranking };
}

export function applyElection(state: GameState, e: ElectionResult): void {
  for (const r of e.ranking) {
    const m = state.members.find((x) => x.id === r.memberId);
    if (m) addAttention(m, electionBonus(r.rank));
  }
  const winner = state.members.find((m) => m.id === e.ranking[0]?.memberId);
  state.electionCenterId = winner?.id ?? null;
  addLog(state, `第${e.year - 1}回総選挙：1位は${winner?.name ?? '?'}！`, 'event');

  const mine = e.ranking.find((r) => r.memberId === state.playerId);
  if (!mine) return;
  const ach = state.player.achievements;
  if (ach.bestElection === null || mine.rank < ach.bestElection) ach.bestElection = mine.rank;
  if (mine.rank === 1) ach.electionWins++;
  addLog(state, `あなたの総選挙順位は${mine.rank}位（${mine.votes.toLocaleString()}票）`, mine.rank <= 16 ? 'good' : 'info');
}
