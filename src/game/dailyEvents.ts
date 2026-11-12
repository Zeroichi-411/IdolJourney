import { DAILY_EVENT_RATE, STAMINA_MAX } from './constants';
import type { Rng } from './rng';
import type { GameEvent, GameState, LogKind, Member, PendingChoice, StatKey } from './types';
import { STAT_LABELS } from './types';
import { activeMembers, addAttention, addLog, addStat, clamp, getMember, getPlayer, signed } from './util';

export interface EventEffect {
  vocal?: number;
  dance?: number;
  visual?: number;
  attention?: number;
  stamina?: number;
  /** イベント相手との仲良し度 */
  affinity?: number;
  /** 謹慎ターン数 */
  suspend?: number;
  /** ケガで休むターン数 */
  injury?: number;
}

export interface EventOutcome {
  /** この結果になる確率 (選択肢内の合計が1) */
  p: number;
  text: string;
  effect: EventEffect;
}

export interface EventChoice {
  label: string;
  outcomes: EventOutcome[];
}

/**
 * any: 誰か / popular: 人気メンバー / junior: 後輩 / friend: 仲の良いメンバー / none: 相手なし
 */
export type EventTarget = 'none' | 'any' | 'popular' | 'junior' | 'friend';

export interface DailyEvent {
  id: string;
  title: string;
  /** {member} は相手の名前に置き換え */
  text: string;
  target: EventTarget;
  weight: number;
  condition?: (s: GameState) => boolean;
  choices: EventChoice[];
}

const one = (text: string, effect: EventEffect): EventOutcome[] => [{ p: 1, text, effect }];

export const DAILY_EVENTS: DailyEvent[] = [
  {
    id: 'variety_offer',
    title: 'バラエティ番組のオファー',
    text: '人気バラエティ番組から、体を張る企画への出演オファーが届いた。',
    target: 'none',
    weight: 3,
    choices: [
      {
        label: '体当たりで挑戦する',
        outcomes: [
          { p: 0.6, text: '全力のリアクションが大ウケ！「あの子誰？」と話題になった。', effect: { attention: 18, stamina: -12 } },
          { p: 0.4, text: '空回りしてスベってしまった…。でも爪痕は残せた。', effect: { attention: 4, stamina: -12 } },
        ],
      },
      {
        label: '断ってレッスンに集中する',
        outcomes: one('浮いた時間でみっちり自主練をした。', { dance: 5, vocal: 3, stamina: -5 }),
      },
    ],
  },
  {
    id: 'fan_on_street',
    title: '街でファンに遭遇',
    text: '移動中、ファンに「いつも応援してます！」と声をかけられた。次の予定まであまり時間がない。',
    target: 'none',
    weight: 3,
    choices: [
      {
        label: '笑顔でサインに応じる',
        outcomes: [
          { p: 0.7, text: '「神対応だった」とファンが投稿し、ほっこり話題に。', effect: { attention: 6, stamina: -3 } },
          { p: 0.3, text: '人が集まってきてしまい、マネージャーに少し怒られた。', effect: { attention: 3, stamina: -6 } },
        ],
      },
      {
        label: '急いでいるので会釈だけする',
        outcomes: [
          { p: 0.6, text: 'ファンも事情を察してくれたようだ。', effect: {} },
          { p: 0.4, text: '「塩対応された」と書き込まれ、ちょっとした騒ぎに…。', effect: { attention: -6 } },
        ],
      },
    ],
  },
  {
    id: 'few_lines',
    title: '歌割りが少ない',
    text: '新曲の歌割りが発表されたが、自分のソロパートはほんの一言だけだった。',
    target: 'none',
    weight: 2,
    choices: [
      {
        label: '運営に直談判する',
        outcomes: [
          { p: 0.4, text: '熱意が伝わり、サビ前のソロパートをもらえた！', effect: { attention: 10, vocal: 4 } },
          { p: 0.6, text: '「わがまま」と受け取られ、スタッフとの空気が少し悪くなった…。', effect: { attention: -4 } },
        ],
      },
      {
        label: '黙って歌を磨く',
        outcomes: one('悔しさをバネに、ボイストレーニングに打ち込んだ。', { vocal: 7, stamina: -6 }),
      },
    ],
  },
  {
    id: 'choreo_clash',
    title: '振付で意見が衝突',
    text: '{member}と、新曲の振付の解釈をめぐって意見がぶつかった。',
    target: 'any',
    weight: 3,
    choices: [
      {
        label: '自分の意見を押し通す',
        outcomes: one('自分のイメージ通りに踊れたが、{member}とは気まずくなった。', { dance: 6, affinity: -10 }),
      },
      {
        label: '相手に譲る',
        outcomes: one('{member}が「ありがとう」と笑ってくれた。', { affinity: 8 }),
      },
      {
        label: 'とことん話し合う',
        outcomes: [
          { p: 0.55, text: '話し合いの末、二人で最高の振付にたどり着いた！', effect: { dance: 5, affinity: 12, stamina: -8 } },
          { p: 0.45, text: '平行線のまま夜が更け、お互い疲れ果ててしまった…。', effect: { affinity: -5, stamina: -12 } },
        ],
      },
    ],
  },
  {
    id: 'popular_dinner',
    title: '人気メンバーからの誘い',
    text: 'グループの人気メンバー、{member}から「今度ご飯行かない？」と誘われた。',
    target: 'popular',
    weight: 3,
    choices: [
      {
        label: '喜んで行く',
        outcomes: [
          { p: 0.75, text: '{member}と打ち解けて、すっかり意気投合した！', effect: { affinity: 15, stamina: 5 } },
          { p: 0.25, text: '{member}がSNSに二人の写真を載せ、ファンの間で話題に！', effect: { affinity: 10, attention: 12 } },
        ],
      },
      {
        label: 'レッスンがあるので断る',
        outcomes: one('{member}は少し寂しそうだった。', { affinity: -6, visual: 3 }),
      },
    ],
  },
  {
    id: 'junior_advice',
    title: '後輩からの相談',
    text: '後輩の{member}から「どうしたら先輩みたいになれますか？」と相談された。',
    target: 'junior',
    weight: 3,
    choices: [
      {
        label: '優しくアドバイスする',
        outcomes: one('{member}はすっかりなついてくれたようだ。', { affinity: 15, stamina: -3 }),
      },
      {
        label: '厳しく指導する',
        outcomes: [
          { p: 0.5, text: '{member}は涙をこらえながら食らいついてきた。自分の基礎も見直せた。', effect: { affinity: 5, dance: 4 } },
          { p: 0.5, text: '{member}を泣かせてしまい、「怖い先輩」という噂が…。', effect: { affinity: -10, attention: -3 } },
        ],
      },
    ],
  },
  {
    id: 'mixer_invite',
    title: '怪しい誘い',
    text: '昔の友人から「芸能関係の人も来る食事会があるんだけど、来ない？」と連絡が来た。',
    target: 'none',
    weight: 1.5,
    choices: [
      {
        label: '少しだけ顔を出す',
        outcomes: [
          { p: 0.55, text: '何事もなく楽しい時間を過ごせた。', effect: { stamina: 8 } },
          { p: 0.3, text: '週刊誌に写真を撮られ、運営から謹慎を言い渡された…。', effect: { attention: -30, suspend: 2 } },
          { p: 0.15, text: '業界人と知り合い、雑誌の仕事を紹介してもらえた。', effect: { attention: 10, visual: 3 } },
        ],
      },
      {
        label: 'きっぱり断る',
        outcomes: one('今はアイドルとしての活動が一番大事だ。', {}),
      },
    ],
  },
  {
    id: 'feeling_sick',
    title: '体調不良',
    text: '朝から少し熱っぽい。今日は大事な撮影の日だ。',
    target: 'none',
    weight: 2,
    choices: [
      {
        label: '無理をして出演する',
        outcomes: [
          { p: 0.65, text: 'プロ意識でやりきった！スタッフからも感心された。', effect: { attention: 6, stamina: -15 } },
          { p: 0.35, text: '撮影中に倒れてしまい、しばらく休養することに…。', effect: { stamina: -10, injury: 2 } },
        ],
      },
      {
        label: '事情を話して休む',
        outcomes: one('しっかり休んで体調が戻った。代役のメンバーが話題になったのは少し悔しい。', { stamina: 25, attention: -4 }),
      },
    ],
  },
  {
    id: 'midnight_snack',
    title: '深夜の誘惑',
    text: 'レッスン帰りの深夜、どうしてもお腹が空いてしまった。',
    target: 'none',
    weight: 2,
    choices: [
      { label: 'ラーメンを食べる', outcomes: one('幸せの味がした。体に力がみなぎる。', { stamina: 10, visual: -3 }) },
      { label: 'ぐっと我慢する', outcomes: one('我慢した分、翌朝のむくみはゼロだった。', { visual: 4, stamina: -4 }) },
    ],
  },
  {
    id: 'gravure_offer',
    title: 'グラビアのオファー',
    text: '青年誌から表紙グラビアのオファーが届いた。',
    target: 'none',
    weight: 2,
    choices: [
      {
        label: '引き受ける',
        outcomes: [
          { p: 0.75, text: '「奇跡の表紙」と雑誌が重版に！', effect: { attention: 16, visual: 5, stamina: -8 } },
          { p: 0.25, text: '一部のファンから「方向性が違う」と不満の声も…。', effect: { attention: 6, visual: 5, stamina: -8 } },
        ],
      },
      { label: '今回は見送る', outcomes: one('自分のペースを大切にした。', { stamina: 5 }) },
    ],
  },
  {
    id: 'reporter',
    title: '記者の直撃取材',
    text: '事務所の前で週刊誌の記者に「グループ内の不仲説について一言！」と声をかけられた。',
    target: 'none',
    weight: 1.5,
    choices: [
      {
        label: '笑顔で否定する',
        outcomes: [
          { p: 0.7, text: '堂々とした対応が「大人の対応」と好意的に報じられた。', effect: { attention: 6 } },
          { p: 0.3, text: '発言の一部を切り取られて記事にされてしまった…。', effect: { attention: -8 } },
        ],
      },
      {
        label: '無言で立ち去る',
        outcomes: [
          { p: 0.6, text: '特に記事にはならなかった。', effect: {} },
          { p: 0.4, text: '「無言で逃げるように立ち去った」と書かれてしまった。', effect: { attention: -5 } },
        ],
      },
    ],
  },
  {
    id: 'fan_letter',
    title: 'ファンレター',
    text: '「あなたの笑顔に救われました」という長い手紙が届いた。',
    target: 'none',
    weight: 2,
    choices: [
      { label: 'SNSで感謝を伝える', outcomes: one('丁寧なお礼の投稿に、ファンからの反響が広がった。', { attention: 6 }) },
      { label: '大切に読み返す', outcomes: one('胸が温かくなり、明日も頑張ろうと思えた。', { stamina: 15 }) },
    ],
  },
  {
    id: 'special_lesson',
    title: '特別レッスンの誘い',
    text: '有名トレーナーが特別レッスンをしてくれることになった。ただし内容はかなりハードらしい。',
    target: 'none',
    weight: 2,
    choices: [
      { label: 'ボーカルを見てもらう', outcomes: one('喉の使い方が根本から変わった！', { vocal: 10, stamina: -15 }) },
      { label: 'ダンスを見てもらう', outcomes: one('キレが一段階上がった！', { dance: 10, stamina: -15 }) },
      { label: '体力が心配なので断る', outcomes: one('無理は禁物だ。', { stamina: 5 }) },
    ],
  },
  {
    id: 'handshake',
    title: '握手会',
    text: '今日は握手会。長い列ができている。',
    target: 'none',
    weight: 2.5,
    choices: [
      {
        label: '一人ひとりに全力で神対応',
        outcomes: one('「また会いに来るね」の声がたくさん聞けた。でもヘトヘト…。', { attention: 9, stamina: -14 }),
      },
      { label: 'ペース配分を考えて対応', outcomes: one('無難にこなした。', { attention: 3, stamina: -5 }) },
    ],
  },
  {
    id: 'friend_trouble',
    title: '仲間の悩み',
    text: '仲の良い{member}が楽屋で一人、落ち込んでいるようだ。',
    target: 'friend',
    weight: 2.5,
    choices: [
      {
        label: '話を聞いてあげる',
        outcomes: [
          { p: 0.8, text: '{member}は「話せてスッキリした」と笑ってくれた。', effect: { affinity: 12, stamina: -5 } },
          { p: 0.2, text: '余計な一言で{member}を怒らせてしまった…。', effect: { affinity: -8, stamina: -5 } },
        ],
      },
      {
        label: 'そっとしておく',
        outcomes: [
          { p: 0.5, text: '{member}は自分で立ち直ったようだ。', effect: {} },
          { p: 0.5, text: '後から{member}に「気づいてたのに…」と言われてしまった。', effect: { affinity: -6 } },
        ],
      },
    ],
  },
  {
    id: 'rival_gossip',
    title: '楽屋のうわさ話',
    text: '楽屋で、何人かのメンバーが{member}の悪口で盛り上がっている。',
    target: 'any',
    weight: 1.5,
    choices: [
      {
        label: '「やめなよ」と止める',
        outcomes: one('場の空気は凍ったが、後で{member}が感謝しに来てくれた。', { affinity: 12 }),
      },
      {
        label: '話を合わせておく',
        outcomes: [
          { p: 0.6, text: 'その場はやり過ごせた。', effect: {} },
          { p: 0.4, text: '{member}の耳に入ってしまい、関係が悪化した…。', effect: { affinity: -15 } },
        ],
      },
    ],
  },
  {
    id: 'radio_guest',
    title: 'ラジオの代打出演',
    text: 'メンバーの急病で、深夜ラジオの代打をお願いされた。',
    target: 'none',
    weight: 2,
    choices: [
      {
        label: '引き受ける',
        outcomes: [
          { p: 0.5, text: 'トークが冴え渡り「レギュラーにして」とリスナーから要望が殺到！', effect: { attention: 14, stamina: -8 } },
          { p: 0.5, text: '緊張でガチガチだったが、なんとかやりきった。', effect: { attention: 4, stamina: -8 } },
        ],
      },
      { label: '自信がないので断る', outcomes: one('別のメンバーが代打を務めた。', {}) },
    ],
  },
  {
    id: 'skincare',
    title: '美容の新習慣',
    text: 'メイクさんにおすすめのスキンケアを教えてもらった。少しお高い。',
    target: 'none',
    weight: 1.5,
    choices: [
      {
        label: '試してみる',
        outcomes: [
          { p: 0.7, text: '肌の調子が見違えるほど良くなった！', effect: { visual: 7 } },
          { p: 0.3, text: '肌に合わず、少し荒れてしまった…。', effect: { visual: -3 } },
        ],
      },
      { label: 'いつものケアを続ける', outcomes: one('いつも通りが一番。', { visual: 1 }) },
    ],
  },
];

export function getDailyEvent(id: string): DailyEvent | undefined {
  return DAILY_EVENTS.find((e) => e.id === id);
}

/** イベントの相手候補 */
export function targetCandidates(state: GameState, target: EventTarget): Member[] {
  const me = getPlayer(state);
  const others = activeMembers(state).filter((m) => !m.isPlayer);
  switch (target) {
    case 'none':
      return [];
    case 'any':
      return others;
    case 'popular':
      return [...others].sort((a, b) => b.attention - a.attention).slice(0, 5);
    case 'junior':
      return others.filter((m) => m.generation > me.generation);
    case 'friend':
      return others.filter((m) => (state.player.affinity[m.id] ?? 0) >= 40);
  }
}

/** 新しいターンの日常イベントを抽選する */
export function rollDailyEvent(state: GameState, rng: Rng, rate = DAILY_EVENT_RATE): PendingChoice | null {
  if (!rng.chance(rate)) return null;
  const available = DAILY_EVENTS.filter(
    (e) => (e.target === 'none' || targetCandidates(state, e.target).length > 0) && (!e.condition || e.condition(state)),
  );
  if (available.length === 0) return null;
  const total = available.reduce((a, e) => a + e.weight, 0);
  let r = rng.next() * total;
  let ev = available[available.length - 1];
  for (const e of available) {
    r -= e.weight;
    if (r <= 0) {
      ev = e;
      break;
    }
  }
  if (ev.target === 'none') return { eventId: ev.id };
  return { eventId: ev.id, memberId: rng.pick(targetCandidates(state, ev.target)).id };
}

export function fillText(text: string, member?: Member): string {
  return text.split('{member}').join(member?.name ?? 'メンバー');
}

const STATS: StatKey[] = ['vocal', 'dance', 'visual'];

function pickOutcome(outcomes: EventOutcome[], rng: Rng): EventOutcome {
  let r = rng.next();
  for (const o of outcomes) {
    r -= o.p;
    if (r <= 0) return o;
  }
  return outcomes[outcomes.length - 1];
}

/** 選択肢を解決して効果を適用する (state は変更される) */
export function applyDailyChoice(state: GameState, pending: PendingChoice, choiceIndex: number, rng: Rng): GameEvent {
  const ev = getDailyEvent(pending.eventId);
  const choice = ev?.choices[choiceIndex];
  if (!ev || !choice) {
    return { kind: 'action', title: 'イベント', tone: 'info', lines: ['特に何も起こらなかった。'] };
  }
  const member = pending.memberId !== undefined ? getMember(state, pending.memberId) : undefined;
  const outcome = pickOutcome(choice.outcomes, rng);
  const p = getPlayer(state);
  const e = outcome.effect;
  const deltas: string[] = [];

  for (const k of STATS) {
    if (e[k]) deltas.push(`${STAT_LABELS[k]} ${signed(addStat(p, k, e[k]!))}`);
  }
  if (e.attention) deltas.push(`注目度 ${signed(addAttention(p, e.attention))}`);
  if (e.stamina) {
    const before = state.player.stamina;
    state.player.stamina = clamp(before + e.stamina, 0, STAMINA_MAX);
    deltas.push(`体力 ${signed(state.player.stamina - before)}`);
  }
  if (e.affinity && member && !member.graduated) {
    const before = state.player.affinity[member.id] ?? 0;
    const after = clamp(before + e.affinity, 0, 100);
    state.player.affinity[member.id] = after;
    deltas.push(`${member.name}との仲良し度 ${before} → ${after}`);
  }
  if (e.suspend) {
    state.player.suspendedTurns = Math.max(state.player.suspendedTurns, e.suspend);
    state.player.achievements.suspensionCount++;
    deltas.push(`謹慎 ${e.suspend}ターン`);
  }
  if (e.injury) {
    state.player.injuredTurns = Math.max(state.player.injuredTurns, e.injury);
    deltas.push(`休養 ${e.injury}ターン`);
  }

  const text = fillText(outcome.text, member);
  const bad = (e.attention ?? 0) < 0 || (e.affinity ?? 0) < 0 || !!e.suspend || !!e.injury;
  const good = (e.attention ?? 0) > 0 || (e.affinity ?? 0) > 0 || STATS.some((k) => (e[k] ?? 0) > 0);
  const tone: LogKind = bad ? 'bad' : good ? 'good' : 'info';
  addLog(state, `${ev.title}：${choice.label} → ${text}`, tone);
  return {
    kind: 'action',
    title: ev.title,
    tone,
    lines: [`「${choice.label}」`, text, ...(deltas.length ? [deltas.join('　')] : [])],
  };
}
