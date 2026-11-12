import { centerStreak, centerStreakPenaltyRate } from '../game/formation';
import { networkBonus, popularIds, quarrelChance, snsOdds } from '../game/actions';
import { fillText, getDailyEvent } from '../game/dailyEvents';
import { formatTurn, nextElectionTurn, nextSingleTurn, toDate } from '../game/calendar';
import { ATTENTION_MAX, STAMINA_MAX, STAT_MAX } from '../game/constants';
import { canGraduate, endingSummary, isPlayerBlocked } from '../game/engine';
import { SNS_GENRES } from '../game/snsPosts';
import type {
  ElectionResult,
  Formation,
  FormationSlot,
  GameEvent,
  GameState,
  SnsResult,
  StatKey,
} from '../game/types';
import { STAT_LABELS } from '../game/types';
import { activeMembers, getMember, getPlayer, signed, totalStats } from '../game/util';
import { bar, esc } from './html';

export type Tab = 'news' | 'members' | 'history';
export type Panel = null | 'sns' | 'interact' | 'graduate';

export interface ViewState {
  tab: Tab;
  panel: Panel;
}

const STAT_ORDER: StatKey[] = ['vocal', 'dance', 'visual'];

function positionLabel(slot: FormationSlot | undefined): string {
  if (!slot) return '不参加';
  if (slot.rank === 1) return 'センター';
  if (slot.row === 0) return 'アンダー';
  return `${slot.row}列目`;
}

function nameOf(state: GameState, id: number): string {
  return getMember(state, id)?.name ?? '???';
}

/* ---------- タイトル ---------- */

const GROUP_NAME_IDEAS = ['ミルキーステラ', 'ハルカナタ', 'CANDY PRISM', 'ソラノート', 'Lumière Days', '夜明けリリィ'];

export function titleScreen(saved: GameState | null): string {
  const groupIdea = GROUP_NAME_IDEAS[Math.floor(Math.random() * GROUP_NAME_IDEAS.length)];
  const cont = saved
    ? `<section class="card">
        <h2>つづきから</h2>
        <p class="muted">${esc(saved.groupName)} ／ ${esc(getPlayer(saved).name)} ／ ${
          saved.ended ? 'エンディング' : esc(formatTurn(saved.turn))
        }</p>
        <button class="btn primary wide" data-act="continue">つづきから遊ぶ</button>
      </section>`
    : '';
  return `
  <main class="title-screen">
    <header class="hero">
      <p class="hero-sub">新結成アイドルグループの一員として生きる</p>
      <h1>Idol<span>Journey</span></h1>
    </header>
    ${cont}
    <section class="card">
      <h2>はじめから</h2>
      <form id="new-game" class="form">
        <label>あなたの名前
          <input name="playerName" maxlength="12" required placeholder="例: 星野 ひかり" autocomplete="off" />
        </label>
        <label>グループ名
          <input name="groupName" maxlength="16" required value="${esc(groupIdea)}" autocomplete="off" />
        </label>
        <fieldset>
          <legend>得意分野</legend>
          <div class="seg">
            ${STAT_ORDER.map(
              (k, i) => `<label class="seg-item"><input type="radio" name="specialty" value="${k}" ${
                i === 0 ? 'checked' : ''
              } /><span>${STAT_LABELS[k]}</span></label>`,
            ).join('')}
          </div>
        </fieldset>
        <button class="btn primary wide" type="submit">デビューする</button>
      </form>
      ${saved ? '<p class="muted small">※ はじめから遊ぶと現在のセーブデータは上書きされます</p>' : ''}
    </section>
    <section class="card rules">
      <h2>あそびかた</h2>
      <ul>
        <li>1ヶ月を前半・後半に分け、毎回1つ行動を選びます。ときどき起きる出来事では、選択次第で結果が変わります。</li>
        <li>3・6・9・12月にシングル発売。能力と注目度で<b>フォーメーション</b>が決まります。連続センターが続くと選ばれにくくなります。</li>
        <li>人気メンバーと仲良くなると、自分にも注目が集まります。ただし喧嘩には注意。</li>
        <li>2年目からは毎年8月に<b>総選挙</b>。こちらは注目度がより重視されます。1位は次のシングルのセンター！</li>
        <li>SNSはバズれば注目度が急上昇。でも炎上すると謹慎や、最悪の場合<b>卒業命令</b>も…。</li>
        <li>メンバーは年々卒業し、18人以下になると新期生オーディションが開かれます。まれに規格外の新人も…。</li>
        <li>3年目以降は自分のタイミングで卒業を発表できます（最長8年）。</li>
        <li>進行はこのブラウザに自動で保存されます。</li>
      </ul>
    </section>
    <p class="disclaimer">このゲームはフィクションです。登場する人物・グループ名・団体などは、実在のものとは関係ありません。</p>
  </main>`;
}

/* ---------- メイン ---------- */

function statusChips(state: GameState): string {
  const chips: string[] = [];
  if (state.player.suspendedTurns > 0) chips.push(`<span class="chip bad">謹慎中 残り${state.player.suspendedTurns}</span>`);
  if (state.player.injuredTurns > 0) chips.push(`<span class="chip bad">ケガ 残り${state.player.injuredTurns}</span>`);
  if (state.player.stamina < 25) chips.push('<span class="chip warn">疲労</span>');
  if (state.player.snsStreak >= 2) chips.push('<span class="chip warn">SNS連投中</span>');
  return chips.join('');
}

function networkLine(state: GameState): string {
  const net = networkBonus(state);
  const best = activeMembers(state)
    .filter((m) => !m.isPlayer && (state.player.affinity[m.id] ?? 0) > 0)
    .sort((a, b) => (state.player.affinity[b.id] ?? 0) * b.attention - (state.player.affinity[a.id] ?? 0) * a.attention)[0];
  return `<p class="network small">人脈ボーナス：注目度 <b>+${net}</b>/ターン${
    best && net > 0 ? `<span class="muted">（主に ${esc(best.name)} のおかげ）</span>` : '<span class="muted">（人気メンバーと仲良くなると増えます）</span>'
  }</p>`;
}

function streakLine(state: GameState): string {
  const n = centerStreak(state, state.playerId);
  if (n === 0) return '';
  return `<p class="small warn-text">${n}作連続センター中：次のシングル選考は −${Math.round(
    centerStreakPenaltyRate(n) * 100,
  )}%（総選挙1位なら影響なし）</p>`;
}

function playerCard(state: GameState): string {
  const p = getPlayer(state);
  const last = state.formations[state.formations.length - 1];
  const slot = last?.slots.find((s) => s.memberId === p.id);
  return `
  <section class="card player">
    <div class="player-head">
      <div>
        <div class="player-name">${esc(p.name)}</div>
        <div class="muted small">${p.generation}期生 ／ 得意: ${STAT_LABELS[state.player.specialty]}</div>
      </div>
      <div class="player-rank">
        ${last ? `<div class="muted small">前作の序列</div><div class="rank-num">${slot ? `${slot.rank}<small>位</small>` : '—'}</div><div class="small">${positionLabel(slot)}</div>` : '<div class="muted small">デビュー前</div>'}
      </div>
    </div>
    <div class="chips">${statusChips(state)}</div>
    <div class="stats">
      ${STAT_ORDER.map(
        (k) => `<div class="stat"><span class="stat-label">${STAT_LABELS[k]}</span>${bar(p[k], STAT_MAX, k)}<span class="stat-val">${p[k]}</span></div>`,
      ).join('')}
      <div class="stat"><span class="stat-label">注目度</span>${bar(p.attention, ATTENTION_MAX, 'attention')}<span class="stat-val">${p.attention}</span></div>
      <div class="stat"><span class="stat-label">体力</span>${bar(state.player.stamina, STAMINA_MAX, 'stamina')}<span class="stat-val">${state.player.stamina}</span></div>
    </div>
    ${networkLine(state)}
    ${streakLine(state)}
  </section>`;
}

function upcoming(state: GameState): string {
  const ns = nextSingleTurn(state.turn);
  const ne = nextElectionTurn(state.turn);
  const items = [`<span>次のシングル：<b>${toDate(ns).month}月後半</b>${ns === state.turn ? '（今回！）' : ''}</span>`];
  if (ne - state.turn < 24) {
    items.push(`<span>総選挙：<b>${toDate(ne).month}月後半</b>${ne === state.turn ? '（今回！）' : ''}</span>`);
  }
  if (state.auditionTurn !== null) {
    items.push(`<span>${state.nextGeneration}期生加入：<b>${toDate(state.auditionTurn).month}月${toDate(state.auditionTurn).half ? '後半' : '前半'}</b></span>`);
  }
  return `<div class="upcoming">${items.join('')}</div>`;
}

function riskLabel(p: number): string {
  if (p >= 0.2) return '高';
  if (p >= 0.1) return '中';
  if (p >= 0.05) return '低';
  return '極低';
}

function actionArea(state: GameState, view: ViewState): string {
  const blocked = isPlayerBlocked(state);
  if (blocked) {
    return `<section class="card actions">
      <p>${blocked === 'suspended' ? '運営から謹慎を言い渡されているため、活動できません…' : 'ケガの治療中のため、活動できません。'}</p>
      <button class="btn primary wide" data-act="wait">次のターンへ</button>
    </section>`;
  }

  let panel = '';
  if (view.panel === 'sns') {
    const best = Math.max(0, ...Object.values(state.player.affinity));
    panel = `<div class="panel">
      <div class="panel-head"><b>どんな投稿をする？</b><button class="link" data-act="close-panel">閉じる</button></div>
      ${state.player.snsStreak > 0 ? '<p class="warn-text small">※ 連続投稿中は炎上しやすくなっています</p>' : ''}
      ${state.player.stamina < 30 ? '<p class="warn-text small">※ 疲れていると失言しやすくなります</p>' : ''}
      <div class="genre-list">
      ${SNS_GENRES.map((g) => {
        const o = snsOdds(state, g.id, g.id === 'members' ? best : 0);
        return `<button class="genre" data-act="sns" data-genre="${g.id}">
          <span class="genre-name">${g.label}</span>
          <span class="genre-desc">${g.description}</span>
          <span class="genre-odds"><span class="good-text">バズ ${riskLabel(o.buzz)}</span>／<span class="bad-text">炎上 ${riskLabel(o.flame)}</span></span>
        </button>`;
      }).join('')}
      <button class="genre" data-act="sns" data-genre="random"><span class="genre-name">おまかせ</span><span class="genre-desc">思いつくままに投稿する</span></button>
      </div>
    </div>`;
  } else if (view.panel === 'interact') {
    const popular = popularIds(state);
    const others = activeMembers(state)
      .filter((m) => !m.isPlayer)
      .sort((a, b) => b.attention - a.attention || a.id - b.id);
    panel = `<div class="panel">
      <div class="panel-head"><b>誰と過ごす？</b><button class="link" data-act="close-panel">閉じる</button></div>
      <p class="small muted">注目度の高いメンバーと仲良くなるほど、自分にも注目が集まります。ただし喧嘩して仲が悪くなることも…。</p>
      ${state.player.stamina < 30 ? `<p class="warn-text small">※ 疲れてイライラしているので喧嘩しやすくなっています（喧嘩率 約${Math.round(quarrelChance(state, 0) * 100)}%）</p>` : ''}
      <div class="member-pick">
      ${others
        .map((m) => {
          const aff = state.player.affinity[m.id] ?? 0;
          return `<button class="pick" data-act="interact" data-id="${m.id}">
            <span class="pick-name">${popular.has(m.id) ? '<span class="star" title="人気メンバー">★</span>' : ''}${esc(m.name)} <small class="muted">${m.generation}期</small>
              <small class="pick-att">注目 ${m.attention}</small></span>
            <span class="aff">${'♥'.repeat(Math.ceil(aff / 20)) || '<span class="muted">♡</span>'}<small class="muted"> ${aff}</small></span>
          </button>`;
        })
        .join('')}
      </div>
    </div>`;
  } else if (view.panel === 'graduate') {
    panel = `<div class="panel">
      <p><b>本当に卒業を発表しますか？</b></p>
      <p class="small muted">卒業を発表するとゲームが終了し、エンディングになります。</p>
      <div class="row-btns">
        <button class="btn danger" data-act="graduate">卒業を発表する</button>
        <button class="btn" data-act="close-panel">やめる</button>
      </div>
    </div>`;
  }

  return `<section class="card actions">
    <h2>${esc(formatTurn(state.turn))}の行動</h2>
    <div class="action-grid">
      <button class="act vocal" data-act="lesson" data-stat="vocal"><b>ボーカル</b><small>レッスン</small></button>
      <button class="act dance" data-act="lesson" data-stat="dance"><b>ダンス</b><small>レッスン</small></button>
      <button class="act visual" data-act="lesson" data-stat="visual"><b>ビジュアル</b><small>レッスン</small></button>
      <button class="act rest" data-act="rest"><b>休み</b><small>体力回復</small></button>
      <button class="act interact ${view.panel === 'interact' ? 'on' : ''}" data-act="open-interact"><b>交流</b><small>他アイドルと</small></button>
      <button class="act sns ${view.panel === 'sns' ? 'on' : ''}" data-act="open-sns"><b>SNS投稿</b><small>バズ or 炎上？</small></button>
    </div>
    ${panel}
    ${canGraduate(state) && view.panel !== 'graduate' ? '<button class="link grad-link" data-act="open-graduate">卒業を発表する…</button>' : ''}
  </section>`;
}

function newsTab(state: GameState): string {
  const entries = state.log.slice(-80).reverse();
  return `<ul class="news">
    ${entries
      .map((e) => `<li class="${e.kind}"><span class="news-date">${esc(formatTurn(e.turn))}</span>${esc(e.text)}</li>`)
      .join('')}
  </ul>`;
}

function membersTab(state: GameState): string {
  const ms = [...activeMembers(state)].sort(
    (a, b) => (a.lastRank ?? 999) - (b.lastRank ?? 999) || totalStats(b) - totalStats(a),
  );
  return `<div class="table-wrap"><table class="members">
    <thead><tr><th>名前</th><th>期</th><th>序列</th><th>Vo</th><th>Da</th><th>Vi</th><th>注目</th><th>♥</th></tr></thead>
    <tbody>
    ${ms
      .map(
        (m) => `<tr class="${m.isPlayer ? 'me' : ''}">
        <td>${m.prodigy ? '<span class="star" title="逸材">★</span>' : ''}${esc(m.name)}</td><td>${m.generation}</td><td>${m.lastRank ?? '—'}</td>
        <td>${m.vocal}</td><td>${m.dance}</td><td>${m.visual}</td><td>${m.attention}</td>
        <td>${m.isPlayer ? '' : state.player.affinity[m.id] ?? 0}</td></tr>`,
      )
      .join('')}
    </tbody></table></div>
    <p class="muted small">在籍 ${ms.length}人 ／ 卒業生 ${state.members.filter((m) => m.graduated && !m.isPlayer).length}人</p>`;
}

function historyTab(state: GameState): string {
  const a = state.player.achievements;
  const singles = [...state.formations].reverse();
  const elections = [...state.elections].reverse();
  return `
  <div class="ach">
    <div><span>最高序列</span><b>${a.bestRank ?? '—'}</b></div>
    <div><span>センター</span><b>${a.centerCount}回</b></div>
    <div><span>選抜</span><b>${a.senbatsuCount}回</b></div>
    <div><span>総選挙最高</span><b>${a.bestElection ?? '—'}</b></div>
    <div><span>バズ</span><b>${a.buzzCount}回</b></div>
    <div><span>炎上</span><b>${a.flameCount}回</b></div>
  </div>
  <h3>シングル</h3>
  ${singles.length === 0 ? '<p class="muted small">まだシングルは発売されていません</p>' : ''}
  <ul class="history">
    ${singles
      .map((f) => {
        const s = f.slots.find((x) => x.memberId === state.playerId);
        return `<li><span>${f.singleNo}th「${esc(f.title)}」</span><span>${s ? `${s.rank}位 ${positionLabel(s)}` : '不参加'}</span><small class="muted">C: ${esc(nameOf(state, f.centerId))}</small></li>`;
      })
      .join('')}
  </ul>
  <h3>総選挙</h3>
  ${elections.length === 0 ? '<p class="muted small">総選挙は2年目の8月からです</p>' : ''}
  <ul class="history">
    ${elections
      .map((e) => {
        const r = e.ranking.find((x) => x.memberId === state.playerId);
        return `<li><span>第${e.year - 1}回</span><span>${r ? `${r.rank}位` : '—'}</span><small class="muted">1位: ${esc(nameOf(state, e.ranking[0].memberId))}</small></li>`;
      })
      .join('')}
  </ul>`;
}

export function mainScreen(state: GameState, view: ViewState): string {
  const tabs: [Tab, string][] = [
    ['news', 'ニュース'],
    ['members', 'メンバー'],
    ['history', '実績'],
  ];
  return `
  <main class="main">
    <header class="topbar">
      <div class="group">${esc(state.groupName)}</div>
      <div class="date">${esc(formatTurn(state.turn))}</div>
      <div class="muted small">メンバー ${activeMembers(state).length}人</div>
    </header>
    ${upcoming(state)}
    ${playerCard(state)}
    ${actionArea(state, view)}
    <section class="card">
      <nav class="tabs">
        ${tabs.map(([k, l]) => `<button class="tab ${view.tab === k ? 'on' : ''}" data-act="tab" data-tab="${k}">${l}</button>`).join('')}
      </nav>
      ${view.tab === 'news' ? newsTab(state) : view.tab === 'members' ? membersTab(state) : historyTab(state)}
    </section>
    <footer class="foot"><button class="link" data-act="to-title">タイトルへ戻る</button></footer>
  </main>`;
}

/* ---------- イベント表示 (モーダル) ---------- */

function memberChip(state: GameState, id: number, rank: number, center: boolean): string {
  const m = getMember(state, id);
  const me = id === state.playerId;
  return `<div class="fm ${center ? 'center' : ''} ${me ? 'me' : ''}">
    <span class="fm-rank">${rank}${m && m.generation > 1 ? `<span class="fm-gen">${m.generation}期</span>` : ''}</span>
    <span class="fm-name">${esc(m?.name ?? '???')}</span>
  </div>`;
}

function formationView(state: GameState, f: Formation): string {
  const rankOf = new Map(f.slots.map((s) => [s.memberId, s.rank]));
  const mine = f.slots.find((s) => s.memberId === state.playerId);
  const under = f.slots.filter((s) => s.row === 0);
  const genCount = new Map<number, number>();
  for (const sl of f.slots) {
    if (sl.row === 0) continue;
    const g = getMember(state, sl.memberId)?.generation ?? 1;
    genCount.set(g, (genCount.get(g) ?? 0) + 1);
  }
  const genSummary =
    genCount.size > 1
      ? `<p class="small muted center-text">選抜の内訳：${[...genCount.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([g, n]) => `${g}期生 ${n}人`)
          .join('／')}</p>`
      : '';
  const rowsHtml = [...f.rows]
    .map((ids, i) => ({ ids, row: i + 1 }))
    .reverse()
    .map(
      ({ ids, row }) => `<div class="fm-row"><span class="fm-row-label">${row}列目</span><div class="fm-row-members">
        ${ids.map((id) => memberChip(state, id, rankOf.get(id) ?? 0, id === f.centerId)).join('')}
      </div></div>`,
    )
    .join('');
  let myLine: string;
  if (!mine) myLine = '<p class="result bad-text">今回は活動休止中のため参加できませんでした…</p>';
  else if (mine.rank === 1) myLine = '<p class="result good-text">🎉 あなたがセンターに選ばれました！</p>';
  else if (mine.row === 1) myLine = `<p class="result good-text">あなたは1列目（序列${mine.rank}位）！フロントメンバーです！</p>`;
  else if (mine.row !== 0) myLine = `<p class="result">あなたは${mine.row}列目（序列${mine.rank}位）。選抜メンバー入り！</p>`;
  else myLine = `<p class="result">あなたは今回アンダーメンバー（序列${mine.rank}位）。次こそ選抜入りを目指そう。</p>`;
  return `
    <p class="eyebrow">${f.singleNo}thシングル フォーメーション発表</p>
    <h2 class="single-title">「${esc(f.title)}」</h2>
    ${f.electionCenter ? '<p class="small muted center-text">総選挙1位メンバーがセンターを務めます</p>' : ''}
    ${
      f.prodigyCenter
        ? `<p class="prodigy-note">⚡ 加入したばかりの${getMember(state, f.centerId)?.generation ?? ''}期生 ${esc(
            nameOf(state, f.centerId),
          )} が、いきなりセンターに大抜擢！</p>`
        : ''
    }
    <div class="formation">${rowsHtml}<div class="stage-front">STAGE FRONT</div></div>
    ${genSummary}
    ${myLine}
    ${
      under.length
        ? `<details class="under"><summary>アンダーメンバー（${under.length}人）</summary><p>${under
            .map((s) => `<span class="${s.memberId === state.playerId ? 'me-text' : ''}">${esc(nameOf(state, s.memberId))}</span>`)
            .join('、')}</p></details>`
        : ''
    }`;
}

function electionView(state: GameState, e: ElectionResult): string {
  const top = e.ranking.slice(0, 16);
  const mine = e.ranking.find((r) => r.memberId === state.playerId);
  const mineInTop = mine && mine.rank <= 16;
  return `
    <p class="eyebrow">第${e.year - 1}回 選抜総選挙</p>
    <h2>開票結果</h2>
    <ol class="election">
      ${top
        .map(
          (r) => `<li class="${r.memberId === state.playerId ? 'me' : ''} ${r.rank === 1 ? 'first' : ''}">
          <span class="el-rank">${r.rank}位</span><span class="el-name">${esc(nameOf(state, r.memberId))}</span><span class="el-votes">${r.votes.toLocaleString()}票</span></li>`,
        )
        .join('')}
      ${
        mine && !mineInTop
          ? `<li class="me sep"><span class="el-rank">${mine.rank}位</span><span class="el-name">${esc(nameOf(state, mine.memberId))}</span><span class="el-votes">${mine.votes.toLocaleString()}票</span></li>`
          : ''
      }
    </ol>
    ${
      mine?.rank === 1
        ? '<p class="result good-text">👑 あなたが総選挙1位！次のシングルのセンターに決定！</p>'
        : mine && mine.rank <= 16
          ? `<p class="result good-text">あなたは${mine.rank}位でランクイン！</p>`
          : mine
            ? `<p class="result">あなたは${mine.rank}位。来年こそランクインを目指そう。</p>`
            : ''
    }
    <p class="small muted center-text">1位のメンバーは次のシングルでセンターを務めます</p>`;
}

function snsView(r: SnsResult): string {
  const outcome =
    r.outcome === 'buzz'
      ? '<div class="sns-outcome buzz">バズった！</div>'
      : r.outcome === 'flame'
        ? `<div class="sns-outcome flame">炎上…<small>（${['', '軽度', '中度', '重度'][r.severity]}）</small></div>`
        : '<div class="sns-outcome normal">いつも通り</div>';
  const lines: string[] = [`注目度 ${signed(r.attentionDelta)}`];
  if (r.suspendedTurns > 0) lines.push(`<span class="bad-text">運営から${r.suspendedTurns}ターンの謹慎を言い渡された…</span>`);
  if (r.fired) lines.push('<span class="bad-text"><b>運営から卒業を命じられた…</b></span>');
  else if (r.outcome === 'flame' && r.suspendedTurns === 0) lines.push('運営からの処分はなかった。');
  return `
    <p class="eyebrow">SNS投稿（${esc(r.genreLabel)}）</p>
    <div class="sns-post"><span class="sns-icon">📱</span>${esc(r.post)}した</div>
    ${outcome}
    <p class="sns-reason">${esc(r.reason)}</p>
    <p class="center-text">${lines.join('<br>')}</p>`;
}

export function eventModal(state: GameState, ev: GameEvent, remaining: number): string {
  let body = '';
  let tone = 'info';
  switch (ev.kind) {
    case 'action':
      tone = ev.tone;
      body = `<h2>${esc(ev.title)}</h2>${ev.lines.map((l) => `<p>${esc(l)}</p>`).join('')}`;
      break;
    case 'sns':
      tone = ev.result.outcome === 'buzz' ? 'good' : ev.result.outcome === 'flame' ? 'bad' : 'info';
      body = snsView(ev.result);
      break;
    case 'formation':
      tone = 'event';
      body = formationView(state, ev.formation);
      break;
    case 'election':
      tone = 'event';
      body = electionView(state, ev.election);
      break;
    case 'graduation':
      tone = 'event';
      body = `<p class="eyebrow">メンバー卒業</p><h2>卒業発表</h2>${ev.lines.map((l) => `<p>${esc(l)}</p>`).join('')}`;
      break;
    case 'audition':
      tone = 'event';
      body = ev.announced
        ? `<p class="eyebrow">お知らせ</p><h2>${ev.generation}期生オーディション開催決定！</h2>
           <p>メンバーの卒業が続き、運営が新メンバーの募集を発表した。</p>
           <p>${ev.joinTurn !== undefined ? esc(formatTurn(ev.joinTurn)) : '近日'}に新メンバーが加入予定。後輩に負けていられない！</p>`
        : `<p class="eyebrow">新メンバー加入</p><h2>${ev.generation}期生 ${ev.names.length}名が加入！</h2>
           <p class="names">${ev.names.map(esc).join('、')}</p>
           ${
             ev.prodigyName
               ? `<div class="prodigy-box"><p class="prodigy-head">★ 規格外の新人が現れた</p>
                  <p>中でも<b>${esc(ev.prodigyName)}</b>は、歌もダンスもビジュアルも先輩に引けを取らない「数年に1人の逸材」と業界でも話題になっている。</p>
                  <p class="small">次のシングルでは、いきなりセンターに抜擢されるかもしれない…！</p></div>`
               : '<p class="small muted">先輩として、交流して仲良くなるのもいいかもしれない。</p>'
           }`;
      break;
    case 'ending':
      tone = ev.end.reason === 'fired' ? 'bad' : 'event';
      body =
        ev.end.reason === 'fired'
          ? '<h2>卒業命令</h2><p>度重なる騒動を受け、運営はあなたの卒業を決定した…。</p>'
          : ev.end.reason === 'auto'
            ? '<h2>卒業の時</h2><p>8年間の活動を経て、あなたはグループを卒業することになった。</p>'
            : '<h2>卒業発表</h2><p>あなたは自らの意思で卒業を発表した。ファンからは惜しむ声と、新たな門出を祝う声が届いた。</p>';
      break;
  }
  return `<div class="overlay">
    <div class="modal ${tone}" role="dialog" aria-modal="true">
      <div class="modal-body">${body}</div>
      <button class="btn primary wide" data-act="next-event" autofocus>${remaining > 1 ? '次へ' : 'OK'}</button>
    </div>
  </div>`;
}

/* ---------- 日常イベントの選択肢 ---------- */

export function choiceModal(state: GameState): string {
  const pc = state.pendingChoice;
  const ev = pc ? getDailyEvent(pc.eventId) : undefined;
  if (!pc || !ev) return '';
  const member = pc.memberId !== undefined ? getMember(state, pc.memberId) : undefined;
  return `<div class="overlay">
    <div class="modal choice" role="dialog" aria-modal="true">
      <div class="modal-body">
        <p class="eyebrow">${esc(formatTurn(state.turn))}の出来事</p>
        <h2>${esc(ev.title)}</h2>
        <p class="choice-text">${esc(fillText(ev.text, member))}</p>
        <p class="small muted center-text">どうする？</p>
      </div>
      <div class="choice-list">
        ${ev.choices
          .map((c, i) => `<button class="btn choice-btn" data-act="choose" data-idx="${i}">${esc(fillText(c.label, member))}</button>`)
          .join('')}
      </div>
    </div>
  </div>`;
}

/* ---------- エンディング ---------- */

export function endingScreen(state: GameState): string {
  const p = getPlayer(state);
  const a = state.player.achievements;
  const sum = endingSummary(state);
  const ranks = state.formations.map((f) => f.slots.find((s) => s.memberId === p.id));
  const fired = state.ended?.reason === 'fired';
  return `
  <main class="ending ${fired ? 'fired' : ''}">
    <p class="eyebrow">${esc(state.groupName)} ${p.generation}期生</p>
    <h1>${esc(p.name)}</h1>
    <div class="ending-title">${esc(sum.title)}</div>
    <p class="ending-comment">${esc(sum.comment)}</p>
    <section class="card">
      <div class="ach">
        <div><span>活動期間</span><b>${sum.years}年</b></div>
        <div><span>シングル参加</span><b>${a.singleCount}作</b></div>
        <div><span>最高序列</span><b>${a.bestRank ?? '—'}</b></div>
        <div><span>センター</span><b>${a.centerCount}回</b></div>
        <div><span>選抜</span><b>${a.senbatsuCount}回</b></div>
        <div><span>フロント</span><b>${a.frontCount}回</b></div>
        <div><span>総選挙最高</span><b>${a.bestElection ?? '—'}</b></div>
        <div><span>総選挙1位</span><b>${a.electionWins}回</b></div>
        <div><span>最高注目度</span><b>${a.peakAttention}</b></div>
        <div><span>バズ</span><b>${a.buzzCount}回</b></div>
        <div><span>炎上</span><b>${a.flameCount}回</b></div>
        <div><span>謹慎</span><b>${a.suspensionCount}回</b></div>
      </div>
      ${
        ranks.length
          ? `<h3>序列の推移</h3><div class="rank-trail">${ranks
              .map(
                (s) =>
                  `<span class="trail ${!s ? 'none' : s.rank === 1 ? 'c' : s.row === 1 ? 'f' : s.row === 0 ? 'u' : 's'}" title="${s ? `${s.rank}位` : '不参加'}">${s ? s.rank : '-'}</span>`,
              )
              .join('')}</div>`
          : ''
      }
      <p class="small muted">最終ステータス：ボーカル ${p.vocal} ／ ダンス ${p.dance} ／ ビジュアル ${p.visual} ／ 注目度 ${p.attention}</p>
    </section>
    <button class="btn primary wide" data-act="restart">もう一度アイドルになる</button>
  </main>`;
}

