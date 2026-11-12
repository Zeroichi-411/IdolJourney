import './style.css';
import { advanceTurn, newGame } from './game/engine';
import { randomSeed } from './game/rng';
import { clearSave, loadGame, saveGame } from './game/save';
import type { Action, GameEvent, GameState, SnsGenreId, StatKey } from './game/types';
import { endingScreen, eventModal, mainScreen, titleScreen, type Panel, type Tab, type ViewState } from './ui/screens';

const app = document.querySelector<HTMLDivElement>('#app')!;

let state: GameState | null = null;
let queue: GameEvent[] = [];
let onTitle = true;
const view: ViewState = { tab: 'news', panel: null };

function render(): void {
  if (onTitle || !state) {
    app.innerHTML = titleScreen(loadGame());
    return;
  }
  const base = state.ended && queue.length === 0 ? endingScreen(state) : mainScreen(state, view);
  app.innerHTML = base + (queue.length ? eventModal(state, queue[0], queue.length) : '');
  app.querySelector<HTMLButtonElement>('[data-act="next-event"]')?.focus();
}

function act(action: Action): void {
  if (!state) return;
  const r = advanceTurn(state, action);
  state = r.state;
  queue = r.events;
  view.panel = null;
  saveGame(state);
  render();
  window.scrollTo({ top: 0 });
}

app.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
  if (!el) return;
  const a = el.dataset.act;
  switch (a) {
    case 'continue':
      state = loadGame();
      onTitle = !state;
      queue = [];
      view.panel = null;
      render();
      return;
    case 'to-title':
      onTitle = true;
      render();
      return;
    case 'restart':
      clearSave();
      state = null;
      onTitle = true;
      render();
      return;
    case 'next-event':
      queue.shift();
      render();
      if (queue.length === 0 && state?.ended) window.scrollTo({ top: 0 });
      return;
    case 'tab':
      view.tab = el.dataset.tab as Tab;
      render();
      return;
    case 'open-sns':
    case 'open-interact':
    case 'open-graduate': {
      const p = a.slice(5) as Exclude<Panel, null>;
      view.panel = view.panel === p ? null : p;
      render();
      return;
    }
    case 'close-panel':
      view.panel = null;
      render();
      return;
    case 'lesson':
      act({ type: 'lesson', stat: el.dataset.stat as StatKey });
      return;
    case 'rest':
      act({ type: 'rest' });
      return;
    case 'interact':
      act({ type: 'interact', targetId: Number(el.dataset.id) });
      return;
    case 'sns':
      act({ type: 'sns', genre: el.dataset.genre as SnsGenreId | 'random' });
      return;
    case 'graduate':
      act({ type: 'graduate' });
      return;
    case 'wait':
      act({ type: 'wait' });
      return;
  }
});

app.addEventListener('submit', (e) => {
  const form = e.target as HTMLFormElement;
  if (form.id !== 'new-game') return;
  e.preventDefault();
  const fd = new FormData(form);
  const playerName = String(fd.get('playerName') ?? '').trim();
  const groupName = String(fd.get('groupName') ?? '').trim();
  if (!playerName || !groupName) return;
  state = newGame({
    playerName,
    groupName,
    specialty: (fd.get('specialty') as StatKey) ?? 'vocal',
    seed: randomSeed(),
  });
  onTitle = false;
  view.tab = 'news';
  view.panel = null;
  queue = [
    {
      kind: 'action',
      title: 'デビュー！',
      tone: 'event',
      lines: [
        `アイドルグループ「${groupName}」の1期生20名のひとりとして、あなたの活動が始まった。`,
        '最初のシングルは3月に発売。フォーメーションの上位を目指してレッスンに励もう！',
      ],
    },
  ];
  saveGame(state);
  render();
});

state = loadGame();
render();
