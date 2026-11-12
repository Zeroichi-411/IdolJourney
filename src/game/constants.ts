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
