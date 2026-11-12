import { GAME_URL, SHARE_HASHTAG } from './constants';
import { endingSummary } from './engine';
import type { ElectionResult, Formation, GameState } from './types';
import { getPlayer } from './util';

/** X の投稿画面を開く URL */
export function shareUrl(text: string): string {
  const q = new URLSearchParams({ text, url: GAME_URL, hashtags: SHARE_HASHTAG });
  return `https://twitter.com/intent/tweet?${q.toString()}`;
}

export function endingShareText(state: GameState): string {
  const p = getPlayer(state);
  const a = state.player.achievements;
  const sum = endingSummary(state);
  if (state.ended?.reason === 'fired') {
    return `アイドルグループ「${state.groupName}」の${p.name}は、SNSの炎上で卒業命令を受けてしまった…（在籍${sum.years}年）`;
  }
  const parts = [`センター${a.centerCount}回`, `最高序列${a.bestRank ?? '-'}位`];
  if (a.bestElection !== null) parts.push(`総選挙最高${a.bestElection}位`);
  return `アイドルグループ「${state.groupName}」の${p.name}として${sum.years}年活動し、称号「${sum.title}」を獲得！\n${parts.join('／')}`;
}

export function centerShareText(state: GameState, f: Formation): string {
  return `${getPlayer(state).name}が「${state.groupName}」${f.singleNo}thシングル「${f.title}」でセンターに選ばれた！`;
}

export function electionShareText(state: GameState, e: ElectionResult): string {
  const mine = e.ranking.find((r) => r.memberId === state.playerId);
  return `第${e.year - 1}回総選挙で${getPlayer(state).name}が${mine?.votes.toLocaleString() ?? ''}票を獲得し、1位に輝いた！`;
}

/** X の文字数 (日本語などは2、URLは23として数える) */
export function xWeightedLength(text: string, withUrl = true): number {
  let n = 0;
  for (const ch of text) n += /[\u0000-ჿ -‍‐-‟′-‷]/.test(ch) ? 1 : 2;
  return n + (withUrl ? 24 : 0) + SHARE_HASHTAG.length + 2;
}
