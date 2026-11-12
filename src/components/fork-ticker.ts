// Fork-only. The running strip at the bottom of the AI Chip Monitor: the newest
// headlines from the news panels, then share prices for the chip and AI names.
// Prices come from /api/fork-quotes; when that has nothing, the strip runs
// headlines only rather than showing stale or invented numbers.
import { allHeadlines } from '@/services/fork-headline-bus';

interface Quote { symbol: string; price: number; changePct: number; currency: string }

const HOT_CATEGORIES = new Set(['tech', 'policy', 'finance', 'hardware']);
const REFRESH_MS = 60_000;
const SPEED_PX_PER_S = 55;

function fmtPrice(value: number): string {
  return value >= 1000
    ? value.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function mountForkTicker(host: HTMLElement): () => void {
  let quotes: Quote[] = [];
  let signature = '';
  let stopped = false;

  host.textContent = '';
  const track = document.createElement('div');
  track.className = 'fk-ticker__track';
  host.appendChild(track);

  const label = (text: string, cls: string): HTMLElement => {
    const el = document.createElement('span');
    el.className = `fk-ticker__label ${cls}`;
    el.textContent = text;
    return el;
  };

  const buildRun = (): { run: HTMLElement; sig: string } => {
    const run = document.createElement('div');
    run.className = 'fk-ticker__run';
    const seen = new Set<string>();
    const news = allHeadlines()
      .filter((h) => HOT_CATEGORIES.has(h.category))
      .sort((a, b) => b.at - a.at)
      .filter((h) => {
        const key = h.title.toLowerCase().slice(0, 60);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 14);

    if (news.length) run.appendChild(label('Hot', 'fk-ticker__label--hot'));
    for (const item of news) {
      const a = document.createElement('a');
      a.className = 'fk-ticker__news';
      a.href = item.link;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = item.title;
      run.appendChild(a);
    }
    if (quotes.length) run.appendChild(label('Markets', 'fk-ticker__label--mkt'));
    for (const q of quotes) {
      const el = document.createElement('span');
      const dir = q.changePct > 0.004 ? 'up' : q.changePct < -0.004 ? 'down' : 'flat';
      el.className = `fk-ticker__quote fk-ticker__quote--${dir}`;
      const sym = document.createElement('b');
      sym.textContent = q.symbol;
      const price = document.createElement('span');
      price.textContent = fmtPrice(q.price);
      const chg = document.createElement('i');
      // Direction is carried by the arrow and sign as well as by colour.
      chg.textContent = `${dir === 'up' ? '▲' : dir === 'down' ? '▼' : '■'} ${q.changePct > 0 ? '+' : ''}${q.changePct.toFixed(2)}%`;
      el.append(sym, price, chg);
      run.appendChild(el);
    }
    const sig = news.map((n) => n.link).join('|') + '#' + quotes.map((q) => `${q.symbol}:${q.price}:${q.changePct.toFixed(2)}`).join('|');
    return { run, sig };
  };

  const render = (): void => {
    if (stopped) return;
    const { run, sig } = buildRun();
    if (sig === signature) return;
    signature = sig;
    track.textContent = '';
    if (!run.childElementCount) { host.classList.add('is-empty'); return; }
    host.classList.remove('is-empty');
    const copy = run.cloneNode(true) as HTMLElement;
    copy.setAttribute('aria-hidden', 'true');
    copy.querySelectorAll('a').forEach((a) => { a.tabIndex = -1; });
    track.append(run, copy);
    requestAnimationFrame(() => {
      const width = run.getBoundingClientRect().width;
      track.style.setProperty('--fk-ticker-shift', `-${width}px`);
      track.style.animationDuration = `${Math.max(30, Math.round(width / SPEED_PX_PER_S))}s`;
    });
  };

  const loadQuotes = async (): Promise<void> => {
    try {
      const resp = await fetch('/api/fork-quotes', { signal: AbortSignal.timeout(12_000) });
      if (!resp.ok) return;
      const data = await resp.json() as { quotes?: Quote[] };
      if (Array.isArray(data.quotes)) {
        quotes = data.quotes.filter((q) => q && typeof q.symbol === 'string' && Number.isFinite(q.price) && Number.isFinite(q.changePct));
      }
    } catch { /* keep the last good quotes */ }
    render();
  };

  void loadQuotes();
  const quoteTimer = setInterval(() => { if (!document.hidden) void loadQuotes(); }, REFRESH_MS);
  // Headlines arrive a few seconds after boot and then every refresh cycle.
  const newsTimer = setInterval(render, 5000);

  return () => {
    stopped = true;
    clearInterval(quoteTimer);
    clearInterval(newsTimer);
  };
}
