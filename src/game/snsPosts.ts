import type { SnsGenreId } from './types';

export interface BuzzReason {
  text: string;
  /** 注目度上昇の幅 */
  gain: [number, number];
}

export interface FlameReason {
  text: string;
  /** 1 = 軽度, 2 = 中度, 3 = 重度 */
  severity: 1 | 2 | 3;
}

export interface SnsGenre {
  id: SnsGenreId;
  label: string;
  description: string;
  /** バズる基本確率 */
  buzzRate: number;
  /** 炎上する基本確率 */
  flameRate: number;
  /** 投稿内容。{member} はメンバー名に置き換え */
  posts: string[];
  buzzReasons: BuzzReason[];
  flameReasons: FlameReason[];
}

export const SNS_GENRES: SnsGenre[] = [
  {
    id: 'selfie',
    label: '自撮り',
    description: 'ビジュアル勝負。そこそこバズりやすいが、写り込みに注意。',
    buzzRate: 0.18,
    flameRate: 0.08,
    posts: [
      'すっぴん風の自撮り',
      '新しい髪色にした自撮り',
      '衣装姿のオフショット',
      '眼鏡姿の自撮り',
      '寝起きのゆるい自撮り',
      '浴衣姿の自撮り',
      '変顔に挑戦した自撮り',
      '雨の日の窓辺で撮った自撮り',
    ],
    buzzReasons: [
      { text: '「ギャップが可愛すぎる」とトレンド入り', gain: [30, 55] },
      { text: '「奇跡の一枚」としてまとめサイトに掲載', gain: [40, 70] },
      { text: 'ファッション誌の編集者が反応して話題に', gain: [25, 45] },
      { text: '海外ファンの間で拡散され世界中から「いいね」', gain: [45, 80] },
    ],
    flameReasons: [
      { text: '加工しすぎだと揶揄されてしまった', severity: 1 },
      { text: '鏡に写り込んだ部屋の散らかりようがネタにされた', severity: 1 },
      { text: '背景に男性物の小物が写り込み「匂わせ」疑惑が浮上', severity: 3 },
      { text: '位置情報が残っていて自宅の場所が特定されかける騒動に', severity: 2 },
    ],
  },
  {
    id: 'daily',
    label: '日常・グルメ',
    description: '親しみやすさアップ。リスクは低め。',
    buzzRate: 0.12,
    flameRate: 0.05,
    posts: [
      '深夜のラーメンの写真',
      '手作りのお弁当の写真',
      '実家の猫の写真',
      '休日のカフェ巡りの報告',
      '最近ハマっている漫画の紹介',
      'コンビニ新作スイーツの食レポ',
      '朝ランニングの記録',
      '推しているアニメの感想',
    ],
    buzzReasons: [
      { text: '食レポのワードセンスが天才的だと話題に', gain: [20, 40] },
      { text: '紹介したお店に行列ができ「〇〇効果」と報道された', gain: [30, 55] },
      { text: '作者本人から引用リポストが届いた', gain: [35, 60] },
      { text: '猫があまりにも可愛くて動物系アカウントが拡散', gain: [20, 35] },
    ],
    flameReasons: [
      { text: '誤字が煽りに見えると話題になってしまった', severity: 1 },
      { text: '食べ物を残した写真が「もったいない」と批判された', severity: 1 },
      { text: 'ネタバレを含んでいてファンから苦情が殺到', severity: 2 },
      { text: 'レッスンを休んだ日の投稿だと気づかれ「サボり」と叩かれた', severity: 2 },
    ],
  },
  {
    id: 'members',
    label: 'メンバーとの写真',
    description: '仲良しのメンバーとならバズりやすい。リスクは最も低い。',
    buzzRate: 0.13,
    flameRate: 0.04,
    posts: [
      '{member}との寝起きツーショット',
      '{member}とおそろいコーデの写真',
      '{member}と楽屋で撮った変顔プリ',
      '{member}の誕生日をお祝いする写真',
      '{member}と一緒に作ったお菓子の写真',
      '{member}とのダンス練習動画',
    ],
    buzzReasons: [
      { text: '二人の関係性が尊すぎると「てぇてぇ」がトレンド入り', gain: [35, 60] },
      { text: '切り抜き動画が100万再生を突破', gain: [40, 70] },
      { text: '二人のコンビ名がファンの間で自然発生した', gain: [25, 45] },
    ],
    flameReasons: [
      { text: '{member}だけ写りが悪いと{member}のファンが反発', severity: 1 },
      { text: '他のメンバーを仲間外れにしていると邪推された', severity: 2 },
      { text: '撮影禁止の場所で撮った写真だと判明した', severity: 2 },
    ],
  },
  {
    id: 'work',
    label: 'レッスン・お仕事報告',
    description: '真面目さが伝わる。伸びは控えめだが安全。',
    buzzRate: 0.08,
    flameRate: 0.02,
    posts: [
      'ボーカルレッスン後の汗だくの写真',
      '新曲の振り入れが終わった報告',
      'ラジオ収録の裏話',
      '握手会のお礼メッセージ',
      '雑誌の撮影オフショット',
      '目標を書いたノートの写真',
    ],
    buzzReasons: [
      { text: '努力する姿に心を打たれたという声が広がった', gain: [20, 40] },
      { text: '有名振付師が「この子は伸びる」と引用', gain: [30, 50] },
      { text: 'ファンへの長文メッセージが「神対応」と拡散された', gain: [25, 45] },
    ],
    flameReasons: [
      { text: '未発表の新曲情報が写り込んでいて運営に注意された', severity: 2 },
      { text: '「意識高すぎ」と一部で冷笑された', severity: 1 },
    ],
  },
  {
    id: 'honne',
    label: '本音・語り',
    description: 'ハイリスク・ハイリターン。心を動かせば大バズ、失言すれば大炎上。',
    buzzRate: 0.26,
    flameRate: 0.2,
    posts: [
      'アイドルを目指したきっかけを語る長文',
      '選抜に入れなかった悔しさを綴った投稿',
      '深夜に送った「最近ちょっと疲れた」という一言',
      '理想のアイドル像についての熱弁',
      '恋愛観についての質問への回答',
      '他グループのライブを見た感想',
      'グループの今後についての思い',
    ],
    buzzReasons: [
      { text: '飾らない本音に共感が集まり、ニュースサイトに取り上げられた', gain: [45, 80] },
      { text: '「この子を推したい」と新規ファンが急増', gain: [55, 95] },
      { text: '有名インフルエンサーが引用して大拡散', gain: [40, 75] },
      { text: 'テレビの情報番組で紹介された', gain: [60, 100] },
    ],
    flameReasons: [
      { text: '言葉足らずで他グループ批判だと誤解された', severity: 2 },
      { text: '恋愛を肯定するような発言がファンの逆鱗に触れた', severity: 3 },
      { text: '運営批判と取れる発言が拡散された', severity: 3 },
      { text: 'ネガティブすぎると心配と批判が入り混じる騒ぎに', severity: 1 },
      { text: '過去の発言と矛盾していると掘り返された', severity: 2 },
    ],
  },
];

export const NORMAL_REACTIONS = [
  'いいねがそこそこ付いた',
  'ファンから温かいコメントがたくさん届いた',
  'いつものファンが反応してくれた',
  'メンバーからリプライが付いて少し盛り上がった',
  '特に大きな反響はなかったが、フォロワーが少し増えた',
];

/** 重症度ごとの処分パラメータ */
export const FLAME_PENALTY: Record<
  1 | 2 | 3,
  { attention: [number, number]; suspendChance: number; suspendTurns: [number, number]; fireChance: number; label: string }
> = {
  1: { attention: [5, 15], suspendChance: 0.05, suspendTurns: [1, 1], fireChance: 0, label: '軽度' },
  2: { attention: [15, 30], suspendChance: 0.35, suspendTurns: [2, 3], fireChance: 0.01, label: '中度' },
  3: { attention: [30, 60], suspendChance: 0.65, suspendTurns: [3, 5], fireChance: 0.08, label: '重度' },
};

/** 過去の重度炎上1回ごとに加算される卒業命令確率 */
export const FIRE_CHANCE_PER_PAST_SEVERE = 0.06;

export function getGenre(id: SnsGenreId): SnsGenre {
  const g = SNS_GENRES.find((x) => x.id === id);
  if (!g) throw new Error(`unknown genre ${id}`);
  return g;
}
