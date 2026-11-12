import { ELECTION_MONTH, SINGLE_MONTHS, TURNS_PER_YEAR } from './constants';

export interface CalendarDate {
  year: number;
  month: number;
  /** 0 = 前半, 1 = 後半 */
  half: 0 | 1;
}

export function toDate(turn: number): CalendarDate {
  return {
    year: Math.floor(turn / TURNS_PER_YEAR) + 1,
    month: Math.floor((turn % TURNS_PER_YEAR) / 2) + 1,
    half: (turn % 2) as 0 | 1,
  };
}

export function toTurn(year: number, month: number, half: 0 | 1): number {
  return (year - 1) * TURNS_PER_YEAR + (month - 1) * 2 + half;
}

export function formatTurn(turn: number): string {
  const d = toDate(turn);
  return `${d.year}年目 ${d.month}月${d.half === 0 ? '前半' : '後半'}`;
}

export function isSingleTurn(turn: number): boolean {
  const d = toDate(turn);
  return d.half === 1 && SINGLE_MONTHS.includes(d.month);
}

export function isElectionTurn(turn: number): boolean {
  const d = toDate(turn);
  return d.half === 1 && d.month === ELECTION_MONTH && d.year >= 2;
}

export function isMonthEnd(turn: number): boolean {
  return turn % 2 === 1;
}

export function nextSingleTurn(turn: number): number {
  for (let t = turn; t < turn + TURNS_PER_YEAR; t++) if (isSingleTurn(t)) return t;
  return turn;
}

export function nextElectionTurn(turn: number): number {
  for (let t = turn; t < turn + TURNS_PER_YEAR * 2; t++) if (isElectionTurn(t)) return t;
  return turn;
}
