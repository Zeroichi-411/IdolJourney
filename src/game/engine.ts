import { doInteract, doLesson, doRest, doSns, networkBonus } from './actions';
import { applyDailyChoice, rollDailyEvent } from './dailyEvents';
import { electionReactions, formationReactions, snsReactions } from './reactions';
import { formatTurn, isElectionTurn, isMonthEnd, isSingleTurn, toDate } from './calendar';
import {
  ATTENTION_DECAY,
  GRADUATE_ALLOWED_YEAR,
  INITIAL_MEMBERS,
  MAX_TURNS,
  SUSPENSION_ATTENTION_LOSS,
} from './constants';
import { applyElection, runElection } from './election';
import { applyFormation, buildFormation } from './formation';
import { createNpc, graduationEvent, npcGrowth, processAudition, processGraduations } from './members';
import { generateName } from './names';
import { Rng } from './rng';
import type { Action, EndReason, GameEvent, GameState, Member, StatKey } from './types';
import { activeMembers, addAttention, addLog, getPlayer } from './util';

export interface NewGameOptions {
  playerName: string;
  groupName: string;
  specialty: StatKey;
  seed: number;
}

export function newGame(opts: NewGameOptions): GameState {
  const rng = new Rng(opts.seed);
  const used = new Set<string>([opts.playerName]);
  const player: Member = {
    id: 0,
    name: opts.playerName,
    generation: 1,
    isPlayer: true,
    vocal: 35,
    dance: 35,
    visual: 35,
    attention: 15,
    joinedTurn: 0,
    graduated: false,
    focus: opts.specialty,
    talent: 1,
  };
  player[opts.specialty] += 20;
  const members: Member[] = [player];
  for (let i = 1; i < INITIAL_MEMBERS; i++) {
    members.push(createNpc(rng, i, generateName(rng, used), 1, 0, false));
  }
  rng.shuffle(members);

  const state: GameState = {
    version: 1,
    groupName: opts.groupName,
    rngState: rng.state,
    turn: 0,
    members,
    playerId: 0,
    nextMemberId: INITIAL_MEMBERS,
    nextGeneration: 2,
    player: {
      specialty: opts.specialty,
      stamina: 100,
      suspendedTurns: 0,
      injuredTurns: 0,
      affinity: {},
      snsStreak: 0,
      achievements: {
        bestRank: null,
        centerCount: 0,
        senbatsuCount: 0,
        frontCount: 0,
        singleCount: 0,
        bestElection: null,
        electionWins: 0,
        buzzCount: 0,
        flameCount: 0,
        severeFlameCount: 0,
        suspensionCount: 0,
        peakAttention: player.attention,
      },
    },
    singleNo: 0,
    formations: [],
    elections: [],
    log: [],
    auditionTurn: null,
    electionCenterId: null,
    pendingChoice: null,
    ended: null,
  };
  addLog(state, `アイドルグループ「${opts.groupName}」が結成！ 1期生20名で活動スタート`, 'event');
  return state;
}

/** プレイヤーが行動不能 (謹慎・ケガ) か */
export function isPlayerBlocked(state: GameState): 'suspended' | 'injured' | null {
  if (state.player.suspendedTurns > 0) return 'suspended';
  if (state.player.injuredTurns > 0) return 'injured';
  return null;
}

export function canGraduate(state: GameState): boolean {
  return toDate(state.turn).year >= GRADUATE_ALLOWED_YEAR && !state.ended;
}

function endGame(state: GameState, reason: EndReason, events: GameEvent[]): void {
  const p = getPlayer(state);
  p.graduated = true;
  p.graduatedTurn = state.turn;
  state.ended = { reason, turn: state.turn };
  events.push({ kind: 'ending', end: state.ended });
}

function playerAction(state: GameState, action: Action, rng: Rng, events: GameEvent[]): void {
  const blocked = isPlayerBlocked(state);
  if (blocked) {
    const p = getPlayer(state);
    if (blocked === 'suspended') {
      state.player.suspendedTurns--;
      const d = addAttention(p, -SUSPENSION_ATTENTION_LOSS);
      state.player.stamina = Math.min(100, state.player.stamina + 15);
      events.push({
        kind: 'action',
        title: '謹慎中',
        tone: 'bad',
        lines: [
          '謹慎中のため活動できない…',
          `注目度 ${d}　残り ${state.player.suspendedTurns}ターン`,
        ],
      });
      addLog(state, `謹慎中（残り${state.player.suspendedTurns}ターン）`, 'bad');
    } else {
      state.player.injuredTurns--;
      state.player.stamina = Math.min(100, state.player.stamina + 30);
      events.push({
        kind: 'action',
        title: 'ケガで休養中',
        tone: 'bad',
        lines: ['ケガの治療に専念した。', `残り ${state.player.injuredTurns}ターン`],
      });
      addLog(state, `ケガで休養中（残り${state.player.injuredTurns}ターン）`, 'bad');
    }
    state.player.snsStreak = 0;
    return;
  }

  switch (action.type) {
    case 'lesson':
      events.push(doLesson(state, action.stat, rng));
      break;
    case 'rest':
      events.push(doRest(state, rng));
      break;
    case 'interact':
      events.push(doInteract(state, action.targetId, rng));
      break;
    case 'sns': {
      const result = doSns(state, action.genre, rng);
      events.push({ kind: 'sns', result, reactions: snsReactions(state, result, rng) });
      state.player.snsStreak++;
      if (result.fired) endGame(state, 'fired', events);
      return;
    }
    case 'graduate':
      if (canGraduate(state)) {
        addLog(state, `${getPlayer(state).name}が卒業を発表！`, 'event');
        endGame(state, 'graduate', events);
      }
      break;
    case 'wait':
      break;
  }
  state.player.snsStreak = 0;
}

export interface TurnResult {
  state: GameState;
  events: GameEvent[];
}

/** 1ターン (半月) 進める。元の state は変更しない */
export function advanceTurn(prev: GameState, action: Action): TurnResult {
  // 日常イベントの選択待ちの間はターンを進めない
  if (prev.ended || prev.pendingChoice) return { state: prev, events: [] };
  const state: GameState = structuredClone(prev);
  const rng = new Rng(state.rngState);
  const events: GameEvent[] = [];

  playerAction(state, action, rng, events);
  if (state.ended) {
    state.rngState = rng.state;
    return { state, events };
  }

  npcGrowth(state, rng);
  for (const m of activeMembers(state)) {
    addAttention(m, -m.attention * ATTENTION_DECAY);
  }
  // 仲の良いメンバーの人気が自分にも波及する
  const net = networkBonus(state);
  if (net > 0) addAttention(getPlayer(state), net);

  if (isMonthEnd(state.turn)) {
    const grads = processGraduations(state, rng);
    const ev = graduationEvent(state, grads);
    if (ev) events.push(ev);
  }

  if (isElectionTurn(state.turn)) {
    const e = runElection(state, rng);
    applyElection(state, e);
    state.elections.push(e);
    events.push({ kind: 'election', election: e, reactions: electionReactions(state, e, rng) });
  }

  if (isSingleTurn(state.turn)) {
    const f = buildFormation(state, rng);
    applyFormation(state, f);
    state.formations.push(f);
    events.push({ kind: 'formation', formation: f, reactions: formationReactions(state, f, rng) });
  }

  const audition = processAudition(state, rng);
  if (audition) events.push(audition);

  const p = getPlayer(state);
  const ach = state.player.achievements;
  ach.peakAttention = Math.max(ach.peakAttention, p.attention);

  state.turn++;
  state.rngState = rng.state;

  if (state.turn >= MAX_TURNS) {
    addLog(state, `${formatTurn(state.turn - 1)}をもって${p.name}が卒業`, 'event');
    endGame(state, 'auto', events);
  } else if (!isPlayerBlocked(state)) {
    // 次のターンの日常イベント
    state.pendingChoice = rollDailyEvent(state, rng);
    state.rngState = rng.state;
  }
  return { state, events };
}

/** 日常イベントの選択肢を選ぶ。元の state は変更しない */
export function resolveChoice(prev: GameState, choiceIndex: number): TurnResult {
  if (!prev.pendingChoice || prev.ended) return { state: prev, events: [] };
  const state: GameState = structuredClone(prev);
  const rng = new Rng(state.rngState);
  const pending = state.pendingChoice!;
  state.pendingChoice = null;
  const ev = applyDailyChoice(state, pending, choiceIndex, rng);
  const p = getPlayer(state);
  state.player.achievements.peakAttention = Math.max(state.player.achievements.peakAttention, p.attention);
  state.rngState = rng.state;
  return { state, events: [ev] };
}

export interface EndingSummary {
  title: string;
  comment: string;
  years: number;
}

export function endingSummary(state: GameState): EndingSummary {
  const a = state.player.achievements;
  const end = state.ended;
  const turns = (end?.turn ?? state.turn) + 1;
  const years = Math.round((turns / 24) * 10) / 10;

  if (end?.reason === 'fired') {
    return {
      title: '炎上の果てに',
      comment: 'SNSでの度重なる騒動により、運営から卒業を命じられてしまった。ステージに立つ夢はここで途絶えた…。',
      years,
    };
  }
  let title = 'ひたむきな努力家';
  let comment = '目立つ場所に立つことは少なかったが、最後までグループを支え続けた。';
  if (a.electionWins >= 2 || a.centerCount >= 6) {
    title = '伝説のセンター';
    comment = 'グループの歴史に名を刻んだ絶対的エース。卒業コンサートはドームを満員にした。';
  } else if (a.electionWins >= 1) {
    title = '総選挙女王';
    comment = 'ファンの声で頂点を掴んだ。あの日のスピーチは今も語り草だ。';
  } else if (a.centerCount >= 1) {
    title = 'グループの顔';
    comment = 'センターとしてグループを引っ張った。卒業後も各方面から引っ張りだこ。';
  } else if (a.frontCount >= 4) {
    title = 'フロントの常連';
    comment = '常に最前列で輝き続けた人気メンバー。';
  } else if (a.senbatsuCount >= 8) {
    title = '選抜の常連';
    comment = '安定した実力で選抜に名を連ね続けた。';
  } else if (a.senbatsuCount >= 1) {
    title = '叩き上げの選抜メンバー';
    comment = 'アンダーから這い上がり、選抜の舞台を経験した。';
  } else if (a.buzzCount >= 8) {
    title = 'SNSの申し子';
    comment = '選抜には届かなかったが、SNSでは誰よりも話題を集めた。';
  }
  return { title, comment, years };
}
