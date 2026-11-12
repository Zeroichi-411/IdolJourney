import { describe, expect, it } from 'vitest';
import { doSns } from './actions';
import { isElectionTurn, isSingleTurn, toTurn } from './calendar';
import { AUDITION_DELAY, MAX_TURNS } from './constants';
import { applyElection, runElection } from './election';
import { arrangeRow, buildFormation, rowOf } from './formation';
import { advanceTurn, canGraduate, newGame } from './engine';
import { processAudition } from './members';
import { Rng } from './rng';
import { SNS_GENRES } from './snsPosts';
import type { Action, GameState } from './types';
import { activeMembers, getPlayer } from './util';

function fresh(seed = 42): GameState {
  return newGame({ playerName: 'わたし', groupName: 'テスト', specialty: 'dance', seed });
}

describe('newGame', () => {
  it('20人でスタートし、プレイヤーは1人', () => {
    const s = fresh();
    expect(activeMembers(s)).toHaveLength(20);
    expect(s.members.filter((m) => m.isPlayer)).toHaveLength(1);
    expect(getPlayer(s).dance).toBe(55);
  });
});

describe('calendar', () => {
  it('シングルは3・6・9・12月後半', () => {
    const singles = Array.from({ length: 24 }, (_, t) => t).filter(isSingleTurn);
    expect(singles).toEqual([toTurn(1, 3, 1), toTurn(1, 6, 1), toTurn(1, 9, 1), toTurn(1, 12, 1)]);
  });
  it('総選挙は1年目には無く、2年目以降の8月後半', () => {
    expect(isElectionTurn(toTurn(1, 8, 1))).toBe(false);
    expect(isElectionTurn(toTurn(2, 8, 1))).toBe(true);
    expect(isElectionTurn(toTurn(2, 8, 0))).toBe(false);
  });
});

describe('formation', () => {
  it('能力と注目度が高いメンバーほど序列が上', () => {
    const s = fresh();
    const p = getPlayer(s);
    p.vocal = p.dance = p.visual = 500;
    p.attention = 500;
    const f = buildFormation(s, new Rng(1));
    expect(f.centerId).toBe(p.id);
    expect(f.slots[0].row).toBe(1);
    expect(f.rows.map((r) => r.length)).toEqual([5, 5, 6]);
  });
  it('列の中央に序列上位が来る', () => {
    expect(arrangeRow([1, 2, 3, 4, 5])).toEqual([4, 2, 1, 3, 5]);
    expect(rowOf(1)).toBe(1);
    expect(rowOf(6)).toBe(2);
    expect(rowOf(16)).toBe(3);
    expect(rowOf(17)).toBe(0);
  });
  it('謹慎中は選抜対象外', () => {
    const s = fresh();
    const p = getPlayer(s);
    p.vocal = p.dance = p.visual = 900;
    s.player.suspendedTurns = 2;
    const f = buildFormation(s, new Rng(1));
    expect(f.slots.some((x) => x.memberId === p.id)).toBe(false);
  });
  it('総選挙1位は次のシングルでセンター', () => {
    const s = fresh();
    const npc = activeMembers(s).find((m) => !m.isPlayer)!;
    s.electionCenterId = npc.id;
    const f = buildFormation(s, new Rng(1));
    expect(f.centerId).toBe(npc.id);
    expect(f.electionCenter).toBe(true);
  });
});

describe('election', () => {
  it('シングルより注目度が重視される', () => {
    const s = fresh();
    const npcs = activeMembers(s).filter((m) => !m.isPlayer);
    const skilled = npcs[0];
    const popular = npcs[1];
    skilled.vocal = skilled.dance = skilled.visual = 300; // 能力合計900
    skilled.attention = 100;
    popular.vocal = popular.dance = popular.visual = 150; // 能力合計450
    popular.attention = 400;
    // シングルでは能力派が上、総選挙では人気派が上
    const f = buildFormation(structuredClone(s), new Rng(3));
    const rankF = (id: number) => f.slots.find((x) => x.memberId === id)!.rank;
    expect(rankF(skilled.id)).toBeLessThan(rankF(popular.id));
    const e = runElection(s, new Rng(3));
    const rankE = (id: number) => e.ranking.find((x) => x.memberId === id)!.rank;
    expect(rankE(popular.id)).toBeLessThan(rankE(skilled.id));
    applyElection(s, e);
    expect(s.electionCenterId).toBe(e.ranking[0].memberId);
    for (let i = 1; i < e.ranking.length; i++) expect(e.ranking[i].votes).toBeLessThan(e.ranking[i - 1].votes);
  });
});

describe('SNS', () => {
  it('投稿内容と理由テキストが付く', () => {
    const s = fresh();
    const rng = new Rng(7);
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const c = structuredClone(s);
      const r = doSns(c, 'random', rng);
      expect(r.post).toMatch(/を投稿$/);
      expect(r.post).not.toContain('{member}');
      expect(r.reason.length).toBeGreaterThan(0);
      expect(r.reason).not.toContain('{member}');
      seen.add(r.outcome);
    }
    expect(seen).toEqual(new Set(['buzz', 'normal', 'flame']));
  });

  it('重度の炎上ほど処分 (謹慎・卒業命令) を受けやすい', () => {
    const tally: Record<number, { n: number; punished: number; fired: number }> = {
      1: { n: 0, punished: 0, fired: 0 },
      2: { n: 0, punished: 0, fired: 0 },
      3: { n: 0, punished: 0, fired: 0 },
    };
    const rng = new Rng(99);
    const base = fresh();
    base.player.snsStreak = 5; // 炎上しやすくする
    for (let i = 0; i < 6000; i++) {
      const c = structuredClone(base);
      const r = doSns(c, 'honne', rng);
      if (r.outcome !== 'flame') continue;
      const t = tally[r.severity];
      t.n++;
      if (r.suspendedTurns > 0 || r.fired) t.punished++;
      if (r.fired) t.fired++;
    }
    const rate = (k: number) => tally[k].punished / tally[k].n;
    expect(rate(1)).toBeLessThan(rate(2));
    expect(rate(2)).toBeLessThan(rate(3));
    expect(tally[1].fired).toBe(0);
    expect(tally[3].fired).toBeGreaterThan(0);
  });

  it('全ジャンルに投稿・バズ理由・炎上理由がある', () => {
    for (const g of SNS_GENRES) {
      expect(g.posts.length).toBeGreaterThan(0);
      expect(g.buzzReasons.length).toBeGreaterThan(0);
      expect(g.flameReasons.length).toBeGreaterThan(0);
    }
  });

  it('卒業命令でゲームオーバー', () => {
    let s = fresh();
    let fired = false;
    for (let seed = 0; seed < 5000 && !fired; seed++) {
      s = fresh(seed);
      s.player.achievements.severeFlameCount = 10;
      s.player.snsStreak = 10;
      const r = advanceTurn(s, { type: 'sns', genre: 'honne' });
      if (r.state.ended?.reason === 'fired') {
        fired = true;
        expect(r.events.some((e) => e.kind === 'ending')).toBe(true);
      }
    }
    expect(fired).toBe(true);
  });
});

describe('audition', () => {
  it('18人以下になると告知され、数ターン後に約10名加入', () => {
    const s = fresh();
    const npcs = activeMembers(s).filter((m) => !m.isPlayer);
    npcs[0].graduated = true;
    npcs[1].graduated = true;
    expect(activeMembers(s)).toHaveLength(18);
    const rng = new Rng(5);
    const ev = processAudition(s, rng);
    expect(ev).toMatchObject({ kind: 'audition', announced: true, generation: 2 });
    s.turn += AUDITION_DELAY;
    const ev2 = processAudition(s, rng);
    expect(ev2?.kind).toBe('audition');
    const added = activeMembers(s).length - 18;
    expect(added).toBeGreaterThanOrEqual(9);
    expect(added).toBeLessThanOrEqual(11);
    expect(activeMembers(s).filter((m) => m.generation === 2)).toHaveLength(added);
    expect(s.nextGeneration).toBe(3);
  });
});

describe('advanceTurn', () => {
  it('元の state を変更しない', () => {
    const s = fresh();
    const json = JSON.stringify(s);
    advanceTurn(s, { type: 'lesson', stat: 'vocal' });
    expect(JSON.stringify(s)).toBe(json);
  });

  it('謹慎中は行動できず残りターンが減る', () => {
    const s = fresh();
    s.player.suspendedTurns = 2;
    const before = getPlayer(s).vocal;
    const r = advanceTurn(s, { type: 'lesson', stat: 'vocal' });
    expect(r.state.player.suspendedTurns).toBe(1);
    expect(getPlayer(r.state).vocal).toBe(before);
  });

  it('卒業発表は3年目から', () => {
    const s = fresh();
    expect(canGraduate(s)).toBe(false);
    s.turn = toTurn(3, 1, 0);
    expect(canGraduate(s)).toBe(true);
    const r = advanceTurn(s, { type: 'graduate' });
    expect(r.state.ended?.reason).toBe('graduate');
  });

  it('8年間プレイすると自動で卒業し、シングル・総選挙・オーディションが起きる', () => {
    let s = fresh(2024);
    let elections = 0;
    let singles = 0;
    let auditions = 0;
    let i = 0;
    while (!s.ended) {
      const a: Action = s.player.stamina < 40 ? { type: 'rest' } : { type: 'lesson', stat: (['vocal', 'dance', 'visual'] as const)[i % 3] };
      i++;
      const r = advanceTurn(s, a);
      for (const e of r.events) {
        if (e.kind === 'election') elections++;
        if (e.kind === 'formation') singles++;
        if (e.kind === 'audition' && !e.announced) auditions++;
      }
      s = r.state;
    }
    expect(s.ended?.reason).toBe('auto');
    expect(s.turn).toBe(MAX_TURNS);
    expect(singles).toBe(32);
    expect(elections).toBe(7);
    expect(auditions).toBeGreaterThan(0);
    expect(s.elections[0].year).toBe(2);
  });
});
