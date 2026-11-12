export type StatKey = 'vocal' | 'dance' | 'visual';

export const STAT_LABELS: Record<StatKey, string> = {
  vocal: 'ボーカル',
  dance: 'ダンス',
  visual: 'ビジュアル',
};

export interface Member {
  id: number;
  name: string;
  /** 何期生か (1 = 1期生) */
  generation: number;
  isPlayer: boolean;
  vocal: number;
  dance: number;
  visual: number;
  /** 世間の注目度 */
  attention: number;
  /** 加入したターン (通算) */
  joinedTurn: number;
  graduated: boolean;
  graduatedTurn?: number;
  /** 直近シングルの序列 (1始まり)。未参加なら undefined */
  lastRank?: number;
  /** NPC が好んで伸ばす能力 */
  focus: StatKey;
  /** NPC の成長速度・人気の伸びやすさ (0.6〜1.5) */
  talent: number;
}

export type RowNo = 1 | 2 | 3;

export interface FormationSlot {
  memberId: number;
  /** 序列 (1 = センター) */
  rank: number;
  /** 何列目か。0 はアンダー */
  row: RowNo | 0;
}

export interface Formation {
  singleNo: number;
  title: string;
  turn: number;
  /** 序列順 */
  slots: FormationSlot[];
  /** 列ごとの並び (表示用、左→右)。index 0 = 1列目 */
  rows: number[][];
  centerId: number;
  /** 総選挙1位がセンターに選ばれた回か */
  electionCenter: boolean;
}

export interface ElectionEntry {
  memberId: number;
  rank: number;
  votes: number;
}

export interface ElectionResult {
  year: number;
  turn: number;
  ranking: ElectionEntry[];
}

export type LogKind = 'info' | 'good' | 'bad' | 'event';

export interface LogEntry {
  turn: number;
  text: string;
  kind: LogKind;
}

export interface Achievements {
  bestRank: number | null;
  centerCount: number;
  senbatsuCount: number;
  frontCount: number;
  singleCount: number;
  bestElection: number | null;
  electionWins: number;
  buzzCount: number;
  flameCount: number;
  severeFlameCount: number;
  suspensionCount: number;
  peakAttention: number;
}

export interface PlayerState {
  specialty: StatKey;
  stamina: number;
  suspendedTurns: number;
  injuredTurns: number;
  /** memberId → 仲良し度 (0〜100) */
  affinity: Record<number, number>;
  /** 連続でSNS投稿したターン数 */
  snsStreak: number;
  achievements: Achievements;
}

export type EndReason = 'graduate' | 'auto' | 'fired';

export interface GameEnd {
  reason: EndReason;
  turn: number;
}

export interface GameState {
  version: 1;
  groupName: string;
  rngState: number;
  /** 通算ターン (0 = 1年目1月前半) */
  turn: number;
  members: Member[];
  playerId: number;
  nextMemberId: number;
  nextGeneration: number;
  player: PlayerState;
  singleNo: number;
  formations: Formation[];
  elections: ElectionResult[];
  log: LogEntry[];
  /** オーディション新メンバーが加入するターン。null なら予定なし */
  auditionTurn: number | null;
  /** 次のシングルでセンターが確約されたメンバー (総選挙1位) */
  electionCenterId: number | null;
  ended: GameEnd | null;
}

export type SnsGenreId = 'selfie' | 'daily' | 'members' | 'work' | 'honne';

export type Action =
  | { type: 'lesson'; stat: StatKey }
  | { type: 'rest' }
  | { type: 'interact'; targetId: number }
  | { type: 'sns'; genre: SnsGenreId | 'random' }
  | { type: 'graduate' }
  /** 謹慎・ケガで行動できないターン */
  | { type: 'wait' };

export type SnsOutcome = 'buzz' | 'normal' | 'flame';

export interface SnsResult {
  genre: SnsGenreId;
  genreLabel: string;
  post: string;
  outcome: SnsOutcome;
  reason: string;
  severity: 0 | 1 | 2 | 3;
  attentionDelta: number;
  suspendedTurns: number;
  fired: boolean;
}

export type GameEvent =
  | { kind: 'action'; title: string; lines: string[]; tone: LogKind }
  | { kind: 'sns'; result: SnsResult }
  | { kind: 'formation'; formation: Formation }
  | { kind: 'election'; election: ElectionResult }
  | { kind: 'graduation'; names: string[]; lines: string[] }
  | { kind: 'audition'; generation: number; names: string[]; announced: boolean; joinTurn?: number }
  | { kind: 'ending'; end: GameEnd };
