/** バランス調整用の定数 */

export const TURNS_PER_YEAR = 24;
export const MAX_YEARS = 8;
export const MAX_TURNS = TURNS_PER_YEAR * MAX_YEARS;
/** 自分から卒業を発表できるようになる年 */
export const GRADUATE_ALLOWED_YEAR = 3;

export const INITIAL_MEMBERS = 20;
/** 在籍人数がこの数以下になるとオーディション開催 */
export const AUDITION_THRESHOLD = 18;
export const AUDITION_MIN = 9;
export const AUDITION_MAX = 11;
/** オーディション告知から加入までのターン数 */
export const AUDITION_DELAY = 4;

export const STAT_MAX = 999;
export const ATTENTION_MAX = 999;
export const STAMINA_MAX = 100;

export const SINGLE_MONTHS = [3, 6, 9, 12];
export const ELECTION_MONTH = 8;

/** 選抜人数と列構成 (1列目, 2列目, 3列目) */
export const SENBATSU_ROWS = [5, 5, 6] as const;
export const SENBATSU_SIZE = SENBATSU_ROWS.reduce((a, b) => a + b, 0);

/** シングル序列スコア: 能力合計 + 注目度×係数 */
export const FORMATION_ATTENTION_WEIGHT = 1.0;
export const FORMATION_NOISE = 30;
/** 総選挙スコア: 能力合計×係数 + 注目度×係数 (注目度重視) */
export const ELECTION_STAT_WEIGHT = 0.4;
export const ELECTION_ATTENTION_WEIGHT = 2.5;
export const ELECTION_NOISE = 60;

/** 毎ターンの注目度自然減衰率 */
export const ATTENTION_DECAY = 0.02;

/** レッスン */
export const LESSON_GAIN_MIN = 9;
export const LESSON_GAIN_MAX = 15;
export const LESSON_STAMINA_COST = 18;
export const SPECIALTY_MULT = 1.2;
export const INJURY_STAMINA_LINE = 20;
export const INJURY_CHANCE = 0.3;

export const REST_RECOVERY = 40;
export const INTERACT_RECOVERY = 10;

/** 謹慎中の毎ターンの注目度減少 */
export const SUSPENSION_ATTENTION_LOSS = 3;

/** 日常イベントの発生率 (1ターンあたり) */
export const DAILY_EVENT_RATE = 0.35;

/** 交流 */
export const QUARREL_BASE = 0.18;
export const QUARREL_TIRED_BONUS = 0.1;
export const QUARREL_CLOSE_REDUCTION = 0.05;
/** 交流相手の人気が自分の注目度に波及する係数 (相手の注目度 × 仲良し度/100 × 係数) */
export const INTERACT_FAME_RATE = 0.04;
/** 人脈ボーナス: Σ(仲良し度/100 × 相手の注目度) × 係数 を毎ターン加算 */
export const NETWORK_RATE = 0.004;
export const NETWORK_MAX = 6;
/** 「人気メンバー」とみなす注目度の上位人数 */
export const POPULAR_TOP = 5;

/** シングル選考の「期の若さ」補正: 最新期に 平均基礎スコア × 係数 を加点 */
export const FRESHNESS_WEIGHT = 0.3;
/** 加入1年以内の最新期から最低限選抜入りさせる人数 */
export const ROOKIE_SENBATSU_SLOTS = 2;

/** 連続センター補正: 連続回数 × 係数 × 本人の基礎スコア を減点 (総選挙による確約センターは対象外) */
export const CENTER_STREAK_PENALTY = 0.08;
export const CENTER_STREAK_PENALTY_MAX = 0.5;

/** オーディションに「逸材」が混ざる確率 (1回のオーディションあたり) */
export const PRODIGY_CHANCE = 0.2;

/** 公開URL (シェア用) */
export const GAME_URL = 'https://zeroichi-411.github.io/IdolJourney/';
export const SHARE_HASHTAG = 'IdolJourney';
