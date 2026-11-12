import {
  INJURY_CHANCE,
  INJURY_STAMINA_LINE,
  INTERACT_FAME_RATE,
  INTERACT_RECOVERY,
  LESSON_GAIN_MAX,
  LESSON_GAIN_MIN,
  LESSON_STAMINA_COST,
  NETWORK_MAX,
  NETWORK_RATE,
  POPULAR_TOP,
  QUARREL_BASE,
  QUARREL_CLOSE_REDUCTION,
  QUARREL_TIRED_BONUS,
  REST_RECOVERY,
  SPECIALTY_MULT,
  STAMINA_MAX,
} from './constants';
import type { Rng } from './rng';
import {
  FIRE_CHANCE_PER_PAST_SEVERE,
  FLAME_PENALTY,
  NORMAL_REACTIONS,
  SNS_GENRES,
  getGenre,
} from './snsPosts';
import type { GameEvent, GameState, Member, SnsGenreId, SnsResult, StatKey } from './types';
import { STAT_LABELS } from './types';
import { activeMembers, addAttention, addLog, addStat, clamp, getMember, getPlayer, signed } from './util';

const STATS: StatKey[] = ['vocal', 'dance', 'visual'];

function changeStamina(state: GameState, delta: number): number {
  const before = state.player.stamina;
  state.player.stamina = clamp(before + delta, 0, STAMINA_MAX);
  return state.player.stamina - before;
}

function staminaEfficiency(stamina: number): number {
  if (stamina >= 50) return 1;
  if (stamina >= 25) return 0.75;
  return 0.5;
}

export function doLesson(state: GameState, stat: StatKey, rng: Rng): GameEvent {
  const p = getPlayer(state);
  const label = STAT_LABELS[stat];
  const title = `${label}レッスン`;

  if (state.player.stamina < INJURY_STAMINA_LINE && rng.chance(INJURY_CHANCE)) {
    const turns = rng.int(2, 3);
    state.player.injuredTurns = turns;
    changeStamina(state, -5);
    addLog(state, `${label}レッスン中にケガ…${turns}ターン休養`, 'bad');
    return {
      kind: 'action',
      title,
      tone: 'bad',
      lines: [
        '疲れがたまった状態で無理をしてしまい、足をひねってしまった…',
        `ケガのため ${turns}ターン 活動を休むことになった。`,
        '体力が少ないときは休むことも大切だ。',
      ],
    };
  }

  const eff = staminaEfficiency(state.player.stamina);
  const talent = state.player.specialty === stat ? SPECIALTY_MULT : 1;
  const diminishing = Math.max(0.3, 1 - p[stat] / 1100);
  const gain = addStat(p, stat, rng.range(LESSON_GAIN_MIN, LESSON_GAIN_MAX) * eff * talent * diminishing);
  const st = changeStamina(state, -LESSON_STAMINA_COST);
  const lines = [`${label} ${signed(gain)}　体力 ${signed(st)}`];
  if (eff < 1) lines.push('疲れていてレッスンに集中しきれなかった…');
  else if (rng.chance(0.1)) {
    const extra = addStat(p, stat, rng.int(3, 6));
    lines.push(`トレーナーに褒められて手応えをつかんだ！（${label} ${signed(extra)}）`);
  }
  addLog(state, `${label}レッスン（${label}${signed(gain)}）`, 'info');
  return { kind: 'action', title, tone: 'info', lines };
}

export function doRest(state: GameState, rng: Rng): GameEvent {
  const p = getPlayer(state);
  const rec = changeStamina(state, REST_RECOVERY);
  const lines = [`体力 ${signed(rec)}`];
  const r = rng.next();
  if (r < 0.1) {
    const d = addStat(p, 'visual', rng.int(2, 5));
    lines.push(`ぐっすり眠って肌の調子が良い！（ビジュアル ${signed(d)}）`);
  } else if (r < 0.2) {
    const d = addStat(p, 'vocal', rng.int(2, 5));
    lines.push(`好きなアーティストのライブ映像を見て刺激を受けた。（ボーカル ${signed(d)}）`);
  } else {
    lines.push(rng.pick(['家でゆっくり過ごした。', '実家に帰ってリフレッシュした。', '一日中寝て過ごした。']));
  }
  addLog(state, `休み（体力${signed(rec)}）`, 'info');
  return { kind: 'action', title: '休み', tone: 'good', lines };
}

const QUARREL_REASONS = [
  '遅刻したことをきっかけに険悪な空気になってしまった',
  'お互いの推しの話で口論になってしまった',
  '冗談のつもりの一言で{member}を怒らせてしまった',
  '振付の細かい部分で言い合いになった',
  'どちらが先に連絡するかで揉めてしまった',
  '貸していた服を汚されて、つい強く言ってしまった',
];

const ACTIVITIES = [
  'ランチに行った',
  'カラオケに行った',
  '楽屋で恋バナをした',
  '一緒に買い物に出かけた',
  'お互いの家で映画を見た',
  '夜遅くまで電話で話した',
];

/** 注目度上位の「人気メンバー」 */
export function popularIds(state: GameState): Set<number> {
  return new Set(
    activeMembers(state)
      .filter((m) => !m.isPlayer)
      .sort((a, b) => b.attention - a.attention)
      .slice(0, POPULAR_TOP)
      .map((m) => m.id),
  );
}

/** 仲の良いメンバーの人気が自分に波及する、毎ターンの注目度ボーナス */
export function networkBonus(state: GameState): number {
  let sum = 0;
  for (const m of activeMembers(state)) {
    if (m.isPlayer) continue;
    sum += ((state.player.affinity[m.id] ?? 0) / 100) * m.attention * NETWORK_RATE;
  }
  return Math.min(NETWORK_MAX, Math.round(sum * 10) / 10);
}

export function quarrelChance(state: GameState, affinity: number): number {
  let q = QUARREL_BASE;
  if (state.player.stamina < 30) q += QUARREL_TIRED_BONUS;
  if (affinity >= 80) q -= QUARREL_CLOSE_REDUCTION;
  return q;
}

export function doInteract(state: GameState, targetId: number, rng: Rng): GameEvent {
  const p = getPlayer(state);
  const target = getMember(state, targetId);
  if (!target || target.graduated || target.isPlayer) {
    return { kind: 'action', title: '交流', tone: 'info', lines: ['相手が見つからなかった。'] };
  }
  const before = state.player.affinity[targetId] ?? 0;
  const roll = rng.next();
  const q = quarrelChance(state, before);

  if (roll < q) {
    // 喧嘩
    const after = clamp(before - rng.int(5, 15), 0, 100);
    state.player.affinity[targetId] = after;
    const st = changeStamina(state, -3);
    const reason = rng.pick(QUARREL_REASONS).split('{member}').join(target.name);
    addLog(state, `${target.name}と喧嘩してしまった（仲良し度${after}）`, 'bad');
    return {
      kind: 'action',
      title: '喧嘩してしまった…',
      tone: 'bad',
      lines: [
        `${target.name}と${rng.pick(ACTIVITIES)}が、${reason}。`,
        `仲良し度 ${before} → ${after}　体力 ${signed(st)}`,
        state.player.stamina < 30 ? '疲れてイライラしていたのも良くなかったかもしれない…。' : '仲直りするには少し時間がかかりそうだ。',
      ],
    };
  }

  if (roll < q + 0.07) {
    // 空振り
    const after = clamp(before + rng.int(2, 4), 0, 100);
    state.player.affinity[targetId] = after;
    const rec = changeStamina(state, INTERACT_RECOVERY);
    addLog(state, `${target.name}と交流（仲良し度${after}）`, 'info');
    return {
      kind: 'action',
      title: '他アイドルと交流',
      tone: 'info',
      lines: [
        `${target.name}と${rng.pick(ACTIVITIES)}が、なんとなく会話が弾まなかった。`,
        `仲良し度 ${before} → ${after}　体力 ${signed(rec)}`,
      ],
    };
  }

  const after = clamp(before + rng.int(10, 16), 0, 100);
  state.player.affinity[targetId] = after;
  const rec = changeStamina(state, INTERACT_RECOVERY);
  const lines = [`${target.name}と${rng.pick(ACTIVITIES)}。`, `仲良し度 ${before} → ${after}　体力 ${signed(rec)}`];

  // 人気メンバーと仲が良いほど、自分にも注目が集まる
  const fame = Math.round(target.attention * (after / 100) * INTERACT_FAME_RATE);
  if (fame >= 1) {
    const d = addAttention(p, fame);
    const popular = popularIds(state).has(target.id);
    lines.push(
      popular
        ? `人気メンバーの${target.name}とのオフショットがファンの間で話題に！（注目度 ${signed(d)}）`
        : `${target.name}のファンにも名前を覚えてもらえた。（注目度 ${signed(d)}）`,
    );
  }
  if (after >= 60 && rng.chance(0.35)) {
    const stat = target.focus;
    const d = addStat(p, stat, rng.int(4, 8));
    lines.push(`${target.name}が得意な${STAT_LABELS[stat]}のコツを教えてくれた！（${STAT_LABELS[stat]} ${signed(d)}）`);
  }
  if (after >= 100 && before < 100) lines.push(`${target.name}とは親友と呼べる仲になった！`);
  addLog(state, `${target.name}と交流（仲良し度${after}）`, 'info');
  return { kind: 'action', title: '他アイドルと交流', tone: 'good', lines };
}

/** メンバー写真の相手を仲良し度で重み付けして選ぶ */
function pickPartner(state: GameState, rng: Rng): Member | null {
  const others = activeMembers(state).filter((m) => !m.isPlayer);
  if (others.length === 0) return null;
  const weights = others.map((m) => 5 + (state.player.affinity[m.id] ?? 0));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng.next() * total;
  for (let i = 0; i < others.length; i++) {
    r -= weights[i];
    if (r <= 0) return others[i];
  }
  return others[others.length - 1];
}

export interface SnsOdds {
  buzz: number;
  flame: number;
}

export function snsOdds(state: GameState, genreId: SnsGenreId, partnerAffinity = 0): SnsOdds {
  const g = getGenre(genreId);
  let buzz = g.buzzRate;
  let flame = g.flameRate;
  if (genreId === 'members') buzz += (partnerAffinity / 100) * 0.12;
  if (state.player.stamina < 30) flame *= 1.5;
  flame *= 1 + 0.35 * state.player.snsStreak;
  return { buzz: Math.min(buzz, 0.6), flame: Math.min(flame, 0.6) };
}

export function doSns(state: GameState, genreChoice: SnsGenreId | 'random', rng: Rng): SnsResult {
  const p = getPlayer(state);
  const genre = genreChoice === 'random' ? rng.pick(SNS_GENRES) : getGenre(genreChoice);
  const partner = genre.id === 'members' ? pickPartner(state, rng) : null;
  const fill = (s: string) => s.split('{member}').join(partner?.name ?? 'メンバー');
  const partnerAff = partner ? state.player.affinity[partner.id] ?? 0 : 0;
  const odds = snsOdds(state, genre.id, partnerAff);
  const post = `${fill(rng.pick(genre.posts))}を投稿`;
  const ach = state.player.achievements;

  const roll = rng.next();
  let result: SnsResult;
  if (roll < odds.flame) {
    const reason = rng.pick(genre.flameReasons);
    const pen = FLAME_PENALTY[reason.severity];
    const attentionDelta = addAttention(p, -rng.int(pen.attention[0], pen.attention[1]));
    const fireChance = reason.severity >= 2 ? pen.fireChance + ach.severeFlameCount * FIRE_CHANCE_PER_PAST_SEVERE : 0;
    const fired = rng.chance(fireChance);
    let suspendedTurns = 0;
    if (!fired && rng.chance(pen.suspendChance + (ach.flameCount >= 3 ? 0.1 : 0))) {
      suspendedTurns = rng.int(pen.suspendTurns[0], pen.suspendTurns[1]);
      state.player.suspendedTurns = suspendedTurns;
      ach.suspensionCount++;
    }
    ach.flameCount++;
    if (reason.severity === 3) ach.severeFlameCount++;
    result = {
      genre: genre.id,
      genreLabel: genre.label,
      post,
      outcome: 'flame',
      reason: fill(reason.text),
      severity: reason.severity,
      attentionDelta,
      suspendedTurns,
      fired,
    };
    addLog(state, `SNS炎上：${result.reason}（注目度${signed(attentionDelta)}）`, 'bad');
    if (suspendedTurns > 0) addLog(state, `運営から${suspendedTurns}ターンの謹慎を言い渡された`, 'bad');
    if (fired) addLog(state, '運営から卒業を命じられた…', 'bad');
  } else if (roll < odds.flame + odds.buzz) {
    const reason = rng.pick(genre.buzzReasons);
    // メンバー写真は相手の人気にも左右される
    const partnerFame = partner ? Math.round(partner.attention * 0.05) : 0;
    const attentionDelta = addAttention(p, rng.int(reason.gain[0], reason.gain[1]) + partnerFame);
    ach.buzzCount++;
    result = {
      genre: genre.id,
      genreLabel: genre.label,
      post,
      outcome: 'buzz',
      reason: fill(reason.text),
      severity: 0,
      attentionDelta,
      suspendedTurns: 0,
      fired: false,
    };
    if (partner) {
      addAttention(partner, Math.round(attentionDelta / 3));
      state.player.affinity[partner.id] = clamp(partnerAff + 5, 0, 100);
    }
    addLog(state, `SNSバズ：${result.reason}（注目度${signed(attentionDelta)}）`, 'good');
  } else {
    const attentionDelta = addAttention(p, rng.int(2, 6));
    result = {
      genre: genre.id,
      genreLabel: genre.label,
      post,
      outcome: 'normal',
      reason: rng.pick(NORMAL_REACTIONS),
      severity: 0,
      attentionDelta,
      suspendedTurns: 0,
      fired: false,
    };
    addLog(state, `SNS投稿（注目度${signed(attentionDelta)}）`, 'info');
  }
  // 投稿の手間で少しだけ体力を使う
  state.player.stamina = clamp(state.player.stamina - 3, 0, STAMINA_MAX);
  return result;
}

export { STATS };
