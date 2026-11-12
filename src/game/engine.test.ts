import { describe, expect, it } from 'vitest';
import { isElectionTurn, isSingleTurn, toTurn } from './calendar';
import { AUDITION_DELAY, MAX_TURNS } from './constants';
import { applyElection, runElection } from './election';
import { arrangeRow, buildFormation, centerStreak, rowOf } from './formation';
import { doSns } from './actions';
import { advanceTurn, canGraduate, newGame, resolveChoice } from './engine';
import { doInteract, networkBonus } from './actions';
import { DAILY_EVENTS, applyDailyChoice, rollDailyEvent } from './dailyEvents';
import { freshnessBonus } from './formation';
import { makeProdigy, processAudition } from './members';
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
    let choices = 0;
    while (!s.ended) {
      if (s.pendingChoice) {
        choices++;
        s = resolveChoice(s, 0).state;
        continue;
      }
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
    // 日常イベントは 1/4〜1/2 程度のターンで発生
    expect(choices).toBeGreaterThan(MAX_TURNS * 0.2);
    expect(choices).toBeLessThan(MAX_TURNS * 0.5);
  });
});

describe('日常イベント', () => {
  it('データが正しい (確率の合計が1、選択肢が2つ以上)', () => {
    for (const e of DAILY_EVENTS) {
      expect(e.choices.length).toBeGreaterThanOrEqual(2);
      for (const c of e.choices) {
        const sum = c.outcomes.reduce((a, o) => a + o.p, 0);
        expect(sum).toBeCloseTo(1, 5);
      }
    }
  });

  it('全イベントを解決でき、相手の名前が差し込まれる', () => {
    const s = fresh();
    const npc = activeMembers(s).find((m) => !m.isPlayer)!;
    // 後輩・仲良し条件のイベントも出せるようにしておく
    s.player.affinity[npc.id] = 50;
    npc.generation = 2;
    const rng = new Rng(11);
    for (const e of DAILY_EVENTS) {
      e.choices.forEach((_, i) => {
        const c = structuredClone(s);
        const ev = applyDailyChoice(c, { eventId: e.id, memberId: e.target === 'none' ? undefined : npc.id }, i, rng);
        expect(ev.kind).toBe('action');
        if (ev.kind === 'action') {
          expect(ev.lines.join('')).not.toContain('{member}');
          expect(ev.title).toBe(e.title);
        }
      });
    }
  });

  it('後輩がいないときは後輩イベントが出ない', () => {
    const s = fresh();
    const rng = new Rng(3);
    for (let i = 0; i < 500; i++) {
      const p = rollDailyEvent(s, rng, 1);
      expect(p?.eventId).not.toBe('junior_advice');
      expect(p?.eventId).not.toBe('friend_trouble');
    }
  });

  it('選択待ちの間はターンが進まず、resolveChoice で解決される', () => {
    const s = fresh();
    s.pendingChoice = { eventId: 'midnight_snack' };
    const blocked = advanceTurn(s, { type: 'rest' });
    expect(blocked.state.turn).toBe(s.turn);
    const r = resolveChoice(s, 1);
    expect(r.state.pendingChoice).toBeNull();
    expect(getPlayer(r.state).visual).toBe(getPlayer(s).visual + 4);
    expect(r.events[0].kind).toBe('action');
    expect(s.pendingChoice).not.toBeNull(); // 元の state は変わらない
  });
});

describe('交流', () => {
  it('仲良し度が上がることも、喧嘩して下がることもある', () => {
    const s = fresh();
    const npc = activeMembers(s).find((m) => !m.isPlayer)!;
    s.player.affinity[npc.id] = 50;
    const rng = new Rng(21);
    let up = 0;
    let down = 0;
    for (let i = 0; i < 400; i++) {
      const c = structuredClone(s);
      doInteract(c, npc.id, rng);
      const after = c.player.affinity[npc.id];
      if (after > 50) up++;
      if (after < 50) down++;
    }
    expect(up).toBeGreaterThan(down);
    expect(down).toBeGreaterThan(400 * 0.1);
  });

  it('人気メンバーと仲が良いほど注目度が上がりやすい', () => {
    const s = fresh();
    const npcs = activeMembers(s).filter((m) => !m.isPlayer);
    const star = npcs[0];
    const minor = npcs[1];
    star.attention = 500;
    minor.attention = 20;
    s.player.affinity[star.id] = 80;
    s.player.affinity[minor.id] = 80;
    const gain = (id: number) => {
      let total = 0;
      const rng = new Rng(5);
      for (let i = 0; i < 200; i++) {
        const c = structuredClone(s);
        const before = getPlayer(c).attention;
        doInteract(c, id, rng);
        total += getPlayer(c).attention - before;
      }
      return total;
    };
    expect(gain(star.id)).toBeGreaterThan(gain(minor.id) * 3);
  });

  it('人脈ボーナスは仲良し度と相手の人気に比例する (上限あり)', () => {
    const s = fresh();
    expect(networkBonus(s)).toBe(0);
    const star = activeMembers(s).find((m) => !m.isPlayer)!;
    star.attention = 500;
    s.player.affinity[star.id] = 100;
    expect(networkBonus(s)).toBe(2);
    for (const m of activeMembers(s)) {
      m.attention = 999;
      s.player.affinity[m.id] = 100;
    }
    expect(networkBonus(s)).toBe(6);
  });
});

describe('期の若さ', () => {
  it('1期生しかいなければ補正なし、新しい期ほど加点', () => {
    const s = fresh();
    expect([...freshnessBonus(activeMembers(s)).values()].every((v) => v === 0)).toBe(true);
    const npcs = activeMembers(s).filter((m) => !m.isPlayer);
    npcs[0].generation = 2;
    npcs[1].generation = 3;
    const b = freshnessBonus(activeMembers(s));
    expect(b.get(npcs[1].id)!).toBeGreaterThan(b.get(npcs[0].id)!);
    expect(b.get(npcs[0].id)!).toBeGreaterThan(0);
    expect(b.get(s.playerId)).toBe(0);
  });

  it('加入1年以内の新期生は能力が低くても選抜に入る', () => {
    const s = fresh();
    // 2期生10名を能力最低で追加
    for (let i = 0; i < 10; i++) {
      s.members.push({
        id: 100 + i, name: `新人${i}`, generation: 2, isPlayer: false, vocal: 1, dance: 1, visual: 1,
        attention: 0, joinedTurn: s.turn, graduated: false, focus: 'vocal', talent: 1,
      });
    }
    const f = buildFormation(s, new Rng(1));
    const senbatsu = f.slots.filter((x) => x.row !== 0).map((x) => x.memberId);
    expect(senbatsu).toHaveLength(16);
    expect(senbatsu.filter((id) => id >= 100)).toHaveLength(2);
  });
});

describe('連続センター補正', () => {
  function withStreak(s: GameState, id: number, n: number) {
    for (let i = 0; i < n; i++) {
      s.formations.push({ singleNo: i + 1, title: `t${i}`, turn: 0, slots: [], rows: [], centerId: id, electionCenter: false });
    }
  }

  it('連続回数を数える', () => {
    const s = fresh();
    withStreak(s, 5, 1);
    withStreak(s, s.playerId, 3);
    expect(centerStreak(s, s.playerId)).toBe(3);
    expect(centerStreak(s, 5)).toBe(0);
  });

  it('連続センターが続くとセンターを外れる', () => {
    const s = fresh();
    const p = getPlayer(s);
    const rival = activeMembers(s).find((m) => !m.isPlayer)!;
    p.vocal = p.dance = p.visual = 300;
    rival.vocal = rival.dance = rival.visual = 270;
    p.attention = rival.attention = 100;
    expect(buildFormation(structuredClone(s), new Rng(1)).centerId).toBe(p.id);
    withStreak(s, p.id, 3);
    expect(buildFormation(structuredClone(s), new Rng(1)).centerId).toBe(rival.id);
  });

  it('総選挙1位の確約センターは減点の影響を受けない', () => {
    const s = fresh();
    withStreak(s, s.playerId, 6);
    s.electionCenterId = s.playerId;
    expect(buildFormation(s, new Rng(1)).centerId).toBe(s.playerId);
  });
});

describe('逸材', () => {
  function addRookies(s: GameState, n: number) {
    for (let i = 0; i < n; i++) {
      s.members.push({
        id: 200 + i, name: `新人${i}`, generation: 2, isPlayer: false, vocal: 20, dance: 20, visual: 20,
        attention: 10, joinedTurn: s.turn, graduated: false, focus: 'dance', talent: 1,
      });
    }
  }

  it('逸材は先輩の上位に匹敵する能力を持つ', () => {
    const s = fresh();
    s.turn = 30;
    addRookies(s, 1);
    const star = s.members[s.members.length - 1];
    makeProdigy(s, star, new Rng(1));
    const vets = activeMembers(s).filter((m) => m.generation === 1);
    for (const k of ['vocal', 'dance', 'visual'] as const) {
      expect(star[k]).toBeGreaterThanOrEqual(Math.max(...vets.map((m) => m[k])) * 0.85 - 1);
    }
    expect(star.prodigy).toBe(true);
    expect(star.talent).toBeGreaterThanOrEqual(1.8);
  });

  it('加入後初のシングルでセンターに大抜擢され、2作目以降は通常選考', () => {
    const s = fresh();
    const p = getPlayer(s);
    p.vocal = p.dance = p.visual = 900;
    p.attention = 900;
    addRookies(s, 10);
    const star = s.members[s.members.length - 1];
    star.prodigy = true;
    const f1 = buildFormation(s, new Rng(1));
    expect(f1.centerId).toBe(star.id);
    expect(f1.prodigyCenter).toBe(true);
    s.formations.push(f1);
    const f2 = buildFormation(s, new Rng(1));
    expect(f2.centerId).toBe(p.id);
    expect(f2.prodigyCenter).toBe(false);
  });

  it('総選挙1位の確約センターが優先される', () => {
    const s = fresh();
    addRookies(s, 10);
    const star = s.members[s.members.length - 1];
    star.prodigy = true;
    s.electionCenterId = s.playerId;
    const f = buildFormation(s, new Rng(1));
    expect(f.centerId).toBe(s.playerId);
    expect(f.prodigyCenter).toBe(false);
    expect(f.slots[1].memberId).toBe(star.id);
  });

  it('オーディションでたまに逸材が現れる (低確率)', () => {
    let found = 0;
    const trials = 300;
    for (let seed = 0; seed < trials; seed++) {
      const s = fresh(seed);
      s.auditionTurn = s.turn;
      const ev = processAudition(s, new Rng(seed));
      if (ev?.kind === 'audition' && ev.prodigyName) {
        found++;
        const star = s.members.find((m) => m.name === ev.prodigyName)!;
        expect(star.prodigy).toBe(true);
        expect(star.generation).toBe(2);
      }
    }
    expect(found).toBeGreaterThan(trials * 0.1);
    expect(found).toBeLessThan(trials * 0.32);
  });
});

describe('Xシェア', () => {
  it('エンディングの投稿文に称号と実績が入り、X の文字数上限に収まる', async () => {
    const { endingShareText, shareUrl, xWeightedLength } = await import('./share');
    const s = fresh();
    s.groupName = 'あいうえおかきくけこさしすせそ';
    getPlayer(s).name = 'あいうえおかきくけこさし';
    s.player.achievements.centerCount = 12;
    s.player.achievements.bestRank = 1;
    s.player.achievements.bestElection = 1;
    s.player.achievements.electionWins = 3;
    s.ended = { reason: 'graduate', turn: 191 };
    const text = endingShareText(s);
    expect(text).toContain('伝説のセンター');
    expect(text).toContain('センター12回');
    expect(text).toContain('総選挙最高1位');
    expect(xWeightedLength(text)).toBeLessThanOrEqual(280);
    const url = new URL(shareUrl(text));
    expect(url.searchParams.get('text')).toBe(text);
    expect(url.searchParams.get('hashtags')).toBe('IdolJourney');
    expect(url.searchParams.get('url')).toBe('https://zeroichi-411.github.io/IdolJourney/');
  });

  it('卒業命令の文言になる', async () => {
    const { endingShareText } = await import('./share');
    const s = fresh();
    s.ended = { reason: 'fired', turn: 30 };
    expect(endingShareText(s)).toContain('卒業命令');
  });
});
