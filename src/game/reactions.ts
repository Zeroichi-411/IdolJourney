import { SENBATSU_SIZE } from './constants';
import { centerStreak } from './formation';
import type { Rng } from './rng';
import type {
  ElectionResult,
  Formation,
  GameEnd,
  GameEvent,
  GameState,
  Member,
  Reaction,
  ReactionTone,
  SnsGenreId,
  SnsResult,
} from './types';
import { activeMembers, getMember, getPlayer } from './util';

/**
 * SNS 上の「みんなの反応」を作る。演出専用で、ゲームの数値は一切変更しない。
 * 文中の {nick} {name} {member} {center} {group} {title} {votes} {rank} などは差し込み。
 */

export interface Line {
  t: string;
  tone?: ReactionTone;
}

type Ctx = Record<string, string | number>;

const pos = (t: string): Line => ({ t, tone: 'pos' });
const neg = (t: string): Line => ({ t, tone: 'neg' });
const neu = (t: string): Line => ({ t, tone: 'neutral' });

/* ---------- 投稿者 ---------- */

const FAN_NAMES = [
  'ドルオタ歴10年',
  '推し活OL',
  '通りすがりの音楽好き',
  'アイドル考察垢',
  '在宅オタク',
  '握手会皆勤賞',
  'ライブ遠征民',
  '新規ファン',
  '古参ファン',
  '{group}箱推し',
  '{nick}推しのみかん',
  '{nick}単推し',
  '{nick}を見守る会',
  '深夜のタイムライン',
  '芸能ニュース好き',
];
const NEG_NAMES = ['名無しのアイドル好き', '辛口レビュアー', 'ROM専', '通りすがり', '元ファン', '芸能まとめ見てる人'];
const HANDLE_WORDS = ['mikan', 'momo', 'oshi', 'yume', 'hoshi', 'sakura', 'neko', 'pon', 'rin', 'hana', 'sora', 'tama', 'kiyo', 'idol_love', 'dd'];
const ICONS = ['🌸', '🎤', '🐰', '🍓', '👓', '📸', '🌙', '⭐', '🍙', '🐱', '🎧', '💐', '🦋', '☕'];
const NEG_ICONS = ['👤', '🗿', '🌀', '📰', '🥀'];

/** プレイヤーの下の名前 (スペースがなければ全体) */
export function givenName(fullName: string): string {
  const parts = fullName.trim().split(/[\s　]+/);
  return parts[parts.length - 1] || fullName;
}

function nickOf(fullName: string, rng: Rng): string {
  const g = givenName(fullName);
  return rng.pick([`${g}ちゃん`, g, `${g}たん`, `${g}ちゃん`]);
}

function fill(text: string, ctx: Ctx): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (ctx[k] !== undefined ? String(ctx[k]) : m));
}

function makeReaction(state: GameState, line: Line, ctx: Ctx, hype: number, rng: Rng, used: Set<string>): Reaction {
  const tone = line.tone ?? 'pos';
  const p = getPlayer(state);
  const nick = nickOf(p.name, rng);
  const full: Ctx = { ...ctx, nick, name: p.name, group: state.groupName };
  // 同じ一覧の中で投稿者名が重複しないようにする
  const pool = (tone === 'neg' ? NEG_NAMES : FAN_NAMES).filter((n) => !used.has(n));
  const tpl = rng.pick(pool.length > 0 ? pool : tone === 'neg' ? NEG_NAMES : FAN_NAMES);
  used.add(tpl);
  const name = fill(tpl, full);
  const handle = `@${rng.pick(HANDLE_WORDS)}_${rng.int(10, 9999)}`;
  const base = 10 + p.attention * 2;
  const likes = Math.max(1, Math.round(base * hype * rng.range(0.3, 1.5) * (tone === 'neg' ? 0.6 : 1)));
  return {
    name,
    handle,
    icon: rng.pick(tone === 'neg' ? NEG_ICONS : ICONS),
    text: fill(line.t, full),
    likes,
    tone,
  };
}

function take(lines: Line[], n: number, rng: Rng): Line[] {
  return rng.shuffle([...lines]).slice(0, Math.max(0, Math.min(n, lines.length)));
}

function build(
  state: GameState,
  groups: Line[][],
  ctx: Ctx,
  hype: number,
  rng: Rng,
  used: Set<string> = new Set(),
): Reaction[] {
  const lines = groups.flat();
  return lines.map((l) => makeReaction(state, l, ctx, hype, rng, used));
}

/* ---------- シングルの選抜発表 ---------- */

const F_CENTER = [
  pos('{nick}センターおめでとう！！ずっと信じてた😭'),
  pos('「{title}」のセンターが{nick}とか神采配すぎる'),
  pos('センター発表の瞬間、声出た。{nick}おめでとう🎉'),
  pos('{nick}が真ん中に立つ{group}、絶対売れる'),
];
const F_STREAK = [
  neg('また{nick}がセンター？そろそろ他の子も見たい'),
  neg('{nick}推しじゃないけど、{streak}作連続はさすがにマンネリでは…'),
];
const F_FRONT = [
  pos('{nick}フロント！最前列で映える表情管理'),
  pos('{nick}、{rank}番手まで来たか…次はセンターだね'),
  pos('1列目に{nick}見つけて泣いた'),
];
const F_SENBATSU = [
  pos('{nick}選抜入りおめでとう！'),
  pos('{nick}は{row}列目か〜ここから上がっていこう'),
  pos('MVで{nick}を探す楽しみができた'),
];
const F_UNDER = [
  pos('{nick}アンダーか…悔しいけどアンダーライブで輝いてほしい'),
  pos('{nick}が選抜じゃないのおかしいでしょ'),
  pos('次は絶対選抜入る。{nick}の努力知ってるから'),
  neu('アンダー曲の方が好きなこと多いから楽しみ'),
];
const F_ABSENT = [
  pos('{nick}がいないシングル、寂しい…'),
  pos('早く戻ってきてね{nick}'),
  neg('活動休止中なら仕方ないよね'),
];
const F_OTHER_CENTER = [pos('{center}センターおめでとう！'), pos('{center}のセンター、似合いすぎ')];
const F_PRODIGY = [pos('新加入の{center}がいきなりセンター！？事件すぎる'), neg('入ったばかりの子がセンターって、先輩たちの気持ちは…')];
const F_ROOKIE = [neu('{gen}期生が選抜に入ってて世代交代を感じる')];
const F_GENERIC = [neu('今回のフォーメーション、バランス良くて好き'), neu('「{title}」ってタイトルからもう名曲の予感')];

export function formationReactions(state: GameState, f: Formation, rng: Rng): Reaction[] {
  const me = f.slots.find((s) => s.memberId === state.playerId);
  const center = getMember(state, f.centerId);
  const streak = centerStreak(state, state.playerId);
  const ctx: Ctx = {
    title: f.title,
    rank: me?.rank ?? '-',
    row: me?.row ?? '-',
    center: center?.name ?? '',
    streak,
    gen: 0,
  };
  const groups: Line[][] = [];
  let hype = 1;
  if (!me) groups.push(take(F_ABSENT, 2, rng));
  else if (me.rank === 1) {
    hype = 3;
    groups.push(take(F_CENTER, 2, rng));
    if (streak >= 3) groups.push(take(F_STREAK, 1, rng));
  } else if (me.row === 1) {
    hype = 2;
    groups.push(take(F_FRONT, 2, rng));
  } else if (me.row !== 0) groups.push(take(F_SENBATSU, 2, rng));
  else groups.push(take(F_UNDER, 2, rng));

  // ほかのメンバーへの反応を1件
  const rookies = f.slots
    .filter((s) => s.row !== 0)
    .map((s) => getMember(state, s.memberId))
    .filter((m) => m && m.generation > 1 && state.turn - m.joinedTurn < 24);
  if (f.prodigyCenter && center) groups.push(take(F_PRODIGY, 1, rng));
  else if (center && center.id !== state.playerId) groups.push(take(F_OTHER_CENTER, 1, rng));
  else if (rookies.length > 0) {
    ctx.gen = rookies[0]!.generation;
    groups.push(take(F_ROOKIE, 1, rng));
  } else groups.push(take(F_GENERIC, 1, rng));

  return build(state, groups, ctx, hype, rng);
}

/* ---------- 総選挙 ---------- */

const E_FIRST = [
  pos('{nick}総選挙1位！！！{votes}票ってすごすぎ'),
  pos('{nick}のスピーチで泣いた。本当におめでとう'),
  pos('ついに{nick}の時代が来た'),
];
const E_FIRST_NEG = [neg('{votes}票か…組織票って言われても仕方ない数字だな')];
const E_TOP3 = [pos('{nick}{rank}位！来年こそてっぺん取ろう'), pos('{nick}が表彰台に…感無量'), pos('{rank}位は大健闘！{nick}おめでとう')];
const E_RANKIN = [pos('{nick}{rank}位ランクイン！おめでとう'), pos('{nick}の名前が呼ばれた瞬間、泣いた'), pos('もっと上を目指せるよ{nick}')];
const E_OUT = [
  pos('{nick}{rank}位か…もっと投票すればよかった'),
  pos('来年は絶対ランクインさせる。{nick}待ってて'),
  neg('{nick}、正直この順位は妥当かも'),
];
const E_WINNER = [pos('{winner}1位おめでとう！貫禄がすごい'), neu('{winner}の{winnerVotes}票は圧倒的すぎる')];

export function electionReactions(state: GameState, e: ElectionResult, rng: Rng): Reaction[] {
  const me = e.ranking.find((r) => r.memberId === state.playerId);
  const top = e.ranking[0];
  const ctx: Ctx = {
    rank: me?.rank ?? '-',
    votes: me?.votes.toLocaleString() ?? '0',
    winner: getMember(state, top?.memberId ?? -1)?.name ?? '',
    winnerVotes: top?.votes.toLocaleString() ?? '0',
  };
  const groups: Line[][] = [];
  let hype = 1;
  if (me && me.rank === 1) {
    hype = 3;
    groups.push(take(E_FIRST, 3, rng));
    if (rng.chance(0.4)) groups.push(take(E_FIRST_NEG, 1, rng));
  } else if (me && me.rank <= 3) {
    hype = 2;
    groups.push(take(E_TOP3, 2, rng), take(E_WINNER, 1, rng));
  } else if (me && me.rank <= SENBATSU_SIZE) {
    groups.push(take(E_RANKIN, 2, rng), take(E_WINNER, 1, rng));
  } else {
    groups.push(take(E_OUT, 2, rng), take(E_WINNER, 1, rng));
  }
  return build(state, groups, ctx, hype, rng);
}

/* ---------- プレイヤーの SNS 投稿 ---------- */

const S_BUZZ = [
  pos('{nick}のこの投稿、何回見てもいい'),
  pos('タイムラインが{nick}で埋まってる'),
  pos('これで{nick}を知った。推します'),
  pos('バズってて嬉しい古参です😭'),
];
const S_BUZZ_GENRE: Record<SnsGenreId, Line[]> = {
  selfie: [pos('顔面国宝すぎる'), pos('この写真、待ち受けにした')],
  daily: [pos('{nick}の食レポのワードセンス好きすぎる'), pos('紹介されてたお店、今度行ってみる')],
  members: [pos('このコンビ尊い…'), pos('メンバー同士の仲良し投稿が一番の栄養')],
  work: [pos('努力してる姿を見ると応援したくなる'), pos('{nick}の真面目さが伝わってくる')],
  honne: [pos('言葉選びが誠実で泣いた'), pos('{nick}の本音、もっと聞きたい')],
};
const S_NORMAL = [
  pos('今日も{nick}が投稿してくれて嬉しい'),
  pos('{nick}かわいい'),
  neu('いつもの{nick}って感じで安心する'),
  pos('いいね押した'),
];
const S_FLAME_NEG = [
  neg('{nick}、これはさすがにダメでしょ'),
  neg('アイドルとしての自覚が足りないのでは'),
  neg('運営はちゃんと指導して'),
  neg('ファンやめようかな…'),
  neg('説明もなしにだんまりはよくない'),
];
const S_FLAME_POS = [
  pos('{nick}も人間だから…応援してる'),
  pos('切り取られてるだけだと思う'),
  pos('叩きすぎ。本人の言葉を待とう'),
  pos('こういうときこそ推しを支えたい'),
];
const S_SUSPEND = [pos('謹慎か…ずっと待ってるからね{nick}'), neu('謹慎は重いけど、戻ってきたら全力で応援する')];
const S_FIRED = [pos('卒業命令はさすがに重すぎない…？'), pos('ありがとう{nick}。ずっと大好きだよ')];

export function snsReactions(state: GameState, r: SnsResult, rng: Rng): Reaction[] {
  const groups: Line[][] = [];
  let hype = 1;
  if (r.outcome === 'buzz') {
    hype = 4;
    groups.push(take(S_BUZZ, 2, rng), take(S_BUZZ_GENRE[r.genre], 1, rng));
  } else if (r.outcome === 'normal') {
    groups.push(take(S_NORMAL, 3, rng));
  } else {
    hype = 2;
    // 重いほど批判の割合が高い (軽度 1:2 / 中度 2:2 / 重度 3:1)
    const negN = r.severity === 3 ? 3 : r.severity === 2 ? 2 : 1;
    const total = r.severity === 1 ? 3 : 4;
    groups.push(take(S_FLAME_NEG, negN, rng));
    let special = 0;
    if (r.fired) {
      groups.push(take(S_FIRED, 1, rng));
      special = 1;
    } else if (r.suspendedTurns > 0) {
      groups.push(take(S_SUSPEND, 1, rng));
      special = 1;
    }
    groups.push(take(S_FLAME_POS, total - negN - special, rng));
  }
  return build(state, groups, {}, hype, rng);
}

/* ---------- 日常イベント ---------- */

/** 日常イベントの結果に付いた反応文から、投稿者付きの反応を作る */
export function eventReactions(state: GameState, lines: Line[], memberName: string, rng: Rng): Reaction[] {
  return build(state, [take(lines, 3, rng)], { member: memberName }, 1.5, rng);
}

/* ---------- 他メンバーの卒業 ---------- */

const G_BASE = [
  pos('{member}卒業か…寂しい'),
  pos('{member}の次の道を応援してる'),
  neu('{group}もメンバーが減ってきたな'),
  pos('{member}の笑顔に何度も救われた。ありがとう'),
];
const G_ACE = [pos('エースの{member}が卒業って、グループにとって大きすぎる'), neu('{member}抜きの{group}、想像できない')];
const G_LONG = [pos('{member}、{years}年間お疲れさま')];
const G_FRIEND = [pos('{nick}と{member}の仲良しコンビ、もう見られないのか…'), pos('{nick}、{member}がいなくなって寂しいだろうな')];
const G_UNDER_NEG = [neg('最近あまり見かけなかったし、仕方ないのかも')];

function yearsBetween(from: number, to: number): string {
  return String(Math.max(1, Math.round(((to - from) / 24) * 10) / 10));
}

export function graduationReactions(state: GameState, graduated: Member[], rng: Rng): Reaction[] {
  if (graduated.length === 0) return [];
  const topAttention = new Set(
    activeMembers(state)
      .concat(graduated)
      .filter((m) => !m.isPlayer)
      .sort((a, b) => b.attention - a.attention)
      .slice(0, 5)
      .map((m) => m.id),
  );
  const out: Reaction[] = [];
  const used = new Set<string>();
  const targets = graduated.slice(0, 2);
  for (const m of targets) {
    const ctx: Ctx = { member: m.name, years: yearsBetween(m.joinedTurn, state.turn) };
    const isAce = (m.lastRank !== undefined && m.lastRank <= 5) || topAttention.has(m.id);
    const isFriend = (state.player.affinity[m.id] ?? 0) >= 60;
    const isLong = state.turn - m.joinedTurn >= 24 * 5;
    const isUnder = m.lastRank === undefined || m.lastRank > SENBATSU_SIZE;
    const quota = targets.length === 1 ? 3 : 2;
    const groups: Line[][] = [];
    if (isFriend) groups.push(take(G_FRIEND, 1, rng));
    if (isAce) groups.push(take(G_ACE, 1, rng));
    else if (isLong) groups.push(take(G_LONG, 1, rng));
    if (!isAce && isUnder && rng.chance(0.3)) groups.push(take(G_UNDER_NEG, 1, rng));
    const already = groups.flat().length;
    groups.push(take(G_BASE, Math.max(1, quota - already), rng));
    out.push(...build(state, groups, ctx, isAce ? 2 : 1, rng, used));
  }
  return out.slice(0, 4);
}

/* ---------- オーディション ---------- */

const A_ANNOUNCE = [
  pos('{group}もついに{gen}期生か'),
  neu('応募しようかな…'),
  pos('新メンバー楽しみ！'),
  pos('{nick}が先輩になる日が来るのか'),
];
const A_ANNOUNCE_NEG = [neg('まだ今のメンバーで見ていたかった')];
const A_JOIN = [
  pos('{gen}期生、ビジュアル強すぎない？'),
  pos('{nick}が先輩になるのエモい'),
  neu('推し変しちゃうかも…'),
  pos('{gen}期生の自己紹介動画、全員キャラ立ってる'),
];
const A_PRODIGY = [pos('{prodigy}って子、加入前から完成されてる'), pos('{prodigy}の歌、オーディション映像で鳥肌立った')];
const A_PRODIGY_NEG = [neg('いきなり推されすぎでは？')];

export function auditionReactions(state: GameState, ev: Extract<GameEvent, { kind: 'audition' }>, rng: Rng): Reaction[] {
  const ctx: Ctx = { gen: ev.generation, prodigy: ev.prodigyName ?? '' };
  const groups: Line[][] = [];
  if (ev.announced) {
    groups.push(take(A_ANNOUNCE, 2, rng));
    if (rng.chance(0.5)) groups.push(take(A_ANNOUNCE_NEG, 1, rng));
    else groups.push(take(A_ANNOUNCE.filter((l) => !groups[0].includes(l)), 1, rng));
    return build(state, groups, ctx, 1, rng);
  }
  if (ev.prodigyName) {
    groups.push(take(A_PRODIGY, 2, rng), take(A_JOIN, 1, rng));
    if (rng.chance(0.5)) groups.push(take(A_PRODIGY_NEG, 1, rng));
    return build(state, groups, ctx, 2, rng);
  }
  groups.push(take(A_JOIN, 3, rng));
  return build(state, groups, ctx, 1.5, rng);
}

/* ---------- 自分の卒業 ---------- */

const END_GRAD = [
  pos('{nick}卒業発表…まだ受け止められない'),
  pos('{years}年間ありがとう、{nick}'),
  pos('卒業コンサート絶対行く'),
  pos('{nick}の次の夢も全力で応援する'),
];
const END_AUTO = [pos('8年間走り抜けた{nick}、本当にかっこよかった')];
const END_CENTER = [pos('センターに立つ{nick}、一生忘れない')];
const END_ELECTION = [pos('総選挙1位の景色を見せてくれてありがとう')];
const END_PLAIN = [pos('選抜でもアンダーでも、ずっと{nick}が一番だった')];
const END_FIRED = [pos('こんな終わり方、悲しすぎる'), pos('いつかまたどこかで{nick}に会いたい'), neu('{group}、これからどうなるんだろう')];
const END_FIRED_NEG = [neg('残念だけど、自業自得かな…')];

export function endingReactions(state: GameState, end: GameEnd, rng: Rng): Reaction[] {
  const a = state.player.achievements;
  const ctx: Ctx = { years: Math.round(((end.turn + 1) / 24) * 10) / 10 };
  const groups: Line[][] = [];
  if (end.reason === 'fired') {
    groups.push(take(END_FIRED, 2, rng), take(END_FIRED_NEG, 1, rng));
    return build(state, groups, ctx, 2, rng);
  }
  groups.push(take(END_GRAD, end.reason === 'auto' ? 2 : 3, rng));
  if (end.reason === 'auto') groups.push(END_AUTO);
  if (a.electionWins > 0) groups.push(END_ELECTION);
  else if (a.centerCount > 0) groups.push(END_CENTER);
  else groups.push(END_PLAIN);
  return build(state, groups, ctx, 3, rng);
}

export { pos as reactPos, neg as reactNeg, neu as reactNeu };
