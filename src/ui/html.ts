export function esc(s: string | number): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function bar(value: number, max: number, cls: string): string {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return `<div class="bar ${cls}"><div class="bar-fill" style="width:${pct.toFixed(1)}%"></div></div>`;
}
