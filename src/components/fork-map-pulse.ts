// Fork-only. Live pulse overlay for the map of the AI Chip Monitor, flat or globe.
//
// Real headlines from the news panels surface one after another as small cards
// pinned to a place on the map, hold for a few seconds and fade, the way a
// market wall keeps moving. The place is inferred from keywords in the
// headline (a company seat or a capital), so it marks what the story is about,
// not where it was reported from. Headlines with no recognisable place are
// skipped. Card and dialog text is the publisher's headline, unedited.
//
// Selecting a card opens a dialog with the headline, its publisher and time,
// other current headlines pinned to the same place, and a link to the article.
import { allHeadlines, type PulseHeadline } from '@/services/fork-headline-bus';

/** Screen position of a coordinate inside the map container, or null when it
 *  is not visible (far side of the globe, outside the viewport). */
export type PulseProjector = (lat: number, lng: number) => { x: number; y: number } | null;

interface Place { name: string; lat: number; lng: number; test: RegExp }

// Ordered: the first match wins, so specific actors come before countries.
const PLACES: Place[] = [
  { name: 'Singapore', lat: 1.35, lng: 103.82, test: /megaspeed|singapore/i },
  { name: 'Hsinchu', lat: 24.78, lng: 120.99, test: /tsmc|taiwan|cowos/i },
  { name: 'Shenzhen', lat: 22.54, lng: 114.06, test: /huawei|ascend|shenzhen/i },
  { name: 'Shanghai', lat: 31.23, lng: 121.47, test: /smic|shanghai/i },
  { name: 'Hangzhou', lat: 30.27, lng: 120.15, test: /alibaba|hangzhou/i },
  { name: 'Seoul', lat: 37.57, lng: 126.98, test: /sk hynix|samsung|korea|hbm/i },
  { name: 'Tokyo', lat: 35.68, lng: 139.69, test: /japan|softbank|tokyo/i },
  { name: 'Veldhoven', lat: 51.42, lng: 5.4, test: /asml|netherlands/i },
  { name: 'Brussels', lat: 50.85, lng: 4.35, test: /\beu\b|european|brussels/i },
  { name: 'London', lat: 51.51, lng: -0.13, test: /\buk\b|britain|london/i },
  { name: 'Abu Dhabi', lat: 24.45, lng: 54.38, test: /uae|abu dhabi|g42|saudi|gulf/i },
  { name: 'New Delhi', lat: 28.61, lng: 77.21, test: /india/i },
  { name: 'Washington', lat: 38.9, lng: -77.04, test: /commerce|lutnick|bis\b|congress|senat|lawmaker|white house|trump|justice department|\bdoj\b|export control|house panel|democrat|republican|bessent|greer/i },
  { name: 'New York', lat: 40.71, lng: -74.01, test: /wall street|stock|shares|nasdaq|investor|market cap|analyst/i },
  { name: 'Beijing', lat: 39.9, lng: 116.4, test: /china|chinese|beijing|xi\b/i },
  { name: 'Northern Virginia', lat: 39.02, lng: -77.49, test: /data cent(er|re)|grid|hyperscal/i },
  { name: 'San Francisco', lat: 37.77, lng: -122.42, test: /openai|anthropic|chatgpt|claude/i },
  { name: 'Seattle', lat: 47.61, lng: -122.33, test: /microsoft|amazon|aws/i },
  { name: 'Austin', lat: 30.27, lng: -97.74, test: /musk|tesla|xai|amd\b/i },
  { name: 'Santa Clara', lat: 37.37, lng: -121.97, test: /nvidia|huang|kress|intel\b/i },
];

const CATEGORY_LABEL: Record<string, string> = {
  tech: 'Nvidia', policy: 'Policy', hardware: 'Chips', cloud: 'Data centers', ai: 'AI', finance: 'Markets',
};

const SPAWN_MS = 900;
const HOLD_MS = 5200;
const MAX_LIVE = 8;
const EXIT_MS = 320;
// Card box relative to its anchor point, and the gap kept between live cards.
const CARD_W = 230;
const CARD_OFFSET = 30;
const CARD_TOP = -24;
const CARD_BOTTOM = 42;
const CARD_GAP = 8;

interface Box { x0: number; y0: number; x1: number; y1: number }

function cardBox(x: number, y: number, left: boolean): Box {
  const x0 = left ? x - CARD_OFFSET - CARD_W : x + CARD_OFFSET;
  return { x0, y0: y + CARD_TOP, x1: x0 + CARD_W, y1: y + CARD_BOTTOM };
}

interface LiveCard { el: HTMLElement; place: Place; left: boolean; x: number; y: number; expires: number; leaving: boolean }

function ago(at: number): string {
  const mins = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  return hours < 48 ? `${hours}h` : `${Math.round(hours / 24)}d`;
}

function placeOf(headline: PulseHeadline): Place | undefined {
  return PLACES.find((p) => p.test.test(headline.title));
}

/** Google News titles end in " - Publisher"; split that off for display. */
function splitPublisher(headline: PulseHeadline): { title: string; publisher: string } {
  const cut = headline.title.lastIndexOf(' - ');
  if (cut > 20 && headline.title.length - cut < 48) {
    return { title: headline.title.slice(0, cut), publisher: headline.title.slice(cut + 3) };
  }
  return { title: headline.title, publisher: headline.source };
}

export class MapPulse {
  private readonly layer: HTMLElement;
  private readonly live: LiveCard[] = [];
  private readonly shown = new Map<string, number>();
  private spawnTimer: ReturnType<typeof setInterval> | null = null;
  private frame: number | null = null;
  private stopped = false;
  private dialog: HTMLElement | null = null;
  private restoreFocus: HTMLElement | null = null;
  private readonly reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  private readonly onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.dialog) this.closeDialog();
  };

  constructor(private readonly container: HTMLElement, private readonly project: PulseProjector) {
    this.layer = document.createElement('div');
    this.layer.className = 'fk-pulse-layer';
    container.appendChild(this.layer);
    this.spawnTimer = setInterval(() => this.spawn(), SPAWN_MS);
    setTimeout(() => this.spawn(), 600);
    const tick = (): void => {
      if (this.stopped) return;
      this.position();
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
    document.addEventListener('keydown', this.onKey);
  }

  destroy(): void {
    this.stopped = true;
    if (this.spawnTimer) clearInterval(this.spawnTimer);
    if (this.frame != null) cancelAnimationFrame(this.frame);
    document.removeEventListener('keydown', this.onKey);
    this.closeDialog();
    this.layer.remove();
  }

  /** Which side of its point a new card can open on without covering a live
   *  card or leaving the map: false = right, true = left, null = neither. */
  private side(x: number, y: number): boolean | null {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const clear = (left: boolean): boolean => {
      const box = cardBox(x, y, left);
      if (box.x0 < 6 || box.x1 > w - 6 || box.y0 < 44 || box.y1 > h - 30) return false;
      return !this.live.some((card) => {
        const other = cardBox(card.x, card.y, card.left);
        return box.x0 < other.x1 + CARD_GAP && box.x1 > other.x0 - CARD_GAP
          && box.y0 < other.y1 + CARD_GAP && box.y1 > other.y0 - CARD_GAP;
      });
    };
    const preferLeft = x > w * 0.6;
    if (clear(preferLeft)) return preferLeft;
    if (clear(!preferLeft)) return !preferLeft;
    return null;
  }

  private spawn(): void {
    if (this.stopped || this.dialog || document.hidden || this.live.length >= MAX_LIVE) return;
    if (this.container.clientWidth < 420 || this.container.offsetParent === null) return;
    const busy = new Set(this.live.map((card) => card.place.name));
    const candidates: { headline: PulseHeadline; place: Place; x: number; y: number; left: boolean; last: number }[] = [];
    for (const headline of allHeadlines()) {
      const place = placeOf(headline);
      if (!place || busy.has(place.name)) continue;
      const at = this.project(place.lat, place.lng);
      if (!at) continue;
      const left = this.side(at.x, at.y);
      if (left === null) continue;
      candidates.push({ headline, place, x: at.x, y: at.y, left, last: this.shown.get(headline.link) ?? 0 });
    }
    if (!candidates.length) return;
    // Least recently shown first, then newest. Picking among the top few keeps
    // the wall from replaying in a fixed order.
    candidates.sort((a, b) => (a.last - b.last) || (b.headline.at - a.headline.at));
    const pick = candidates[Math.floor(Math.random() * Math.min(5, candidates.length))];
    if (!pick) return;
    this.shown.set(pick.headline.link, Date.now());
    this.add(pick.headline, pick.place, pick.x, pick.y, pick.left);
  }

  private add(headline: PulseHeadline, place: Place, x: number, y: number, left: boolean): void {
    const { title } = splitPublisher(headline);
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `fk-pulse fk-pulse--${headline.category}`;
    el.setAttribute('aria-label', `${place.name}: ${title}`);
    el.addEventListener('click', () => this.openDialog(headline, place, el));

    const dot = document.createElement('span');
    dot.className = 'fk-pulse__dot';
    const card = document.createElement('span');
    card.className = 'fk-pulse__card';
    const meta = document.createElement('span');
    meta.className = 'fk-pulse__meta';
    const tag = document.createElement('b');
    tag.textContent = CATEGORY_LABEL[headline.category] ?? headline.category;
    const where = document.createElement('span');
    where.textContent = place.name;
    const when = document.createElement('i');
    when.textContent = ago(headline.at);
    meta.append(tag, where, when);
    const text = document.createElement('span');
    text.className = 'fk-pulse__title';
    text.textContent = title;
    card.append(meta, text);
    el.append(dot, card);

    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    el.classList.toggle('is-left', left);
    this.layer.appendChild(el);
    this.live.push({ el, place, left, x, y, expires: Date.now() + HOLD_MS, leaving: false });
    // Two frames: the first paints the hidden state, the second starts the transition.
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in')));
  }

  private position(): void {
    const now = Date.now();
    for (let i = this.live.length - 1; i >= 0; i--) {
      const card = this.live[i];
      if (!card) continue;
      const at = this.project(card.place.lat, card.place.lng);
      if (at) {
        card.x = at.x;
        card.y = at.y;
        // Sub-pixel transforms keep the card gliding with the map instead of stepping.
        card.el.style.transform = `translate3d(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px, 0)`;
      }
      const hold = this.dialog !== null;
      if (!card.leaving && !hold && (now > card.expires || !at)) {
        card.leaving = true;
        card.el.classList.remove('is-in');
        setTimeout(() => {
          card.el.remove();
          const index = this.live.indexOf(card);
          if (index >= 0) this.live.splice(index, 1);
        }, this.reducedMotion ? 0 : EXIT_MS);
      }
    }
  }

  private openDialog(headline: PulseHeadline, place: Place, origin: HTMLElement): void {
    this.closeDialog();
    this.restoreFocus = origin;
    const { title, publisher } = splitPublisher(headline);

    const backdrop = document.createElement('div');
    backdrop.className = `fk-news-modal fk-pulse--${headline.category}`;
    backdrop.addEventListener('click', (event) => { if (event.target === backdrop) this.closeDialog(); });

    const box = document.createElement('div');
    box.className = 'fk-news-modal__box';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', title);

    const head = document.createElement('div');
    head.className = 'fk-news-modal__head';
    const tag = document.createElement('b');
    tag.textContent = CATEGORY_LABEL[headline.category] ?? headline.category;
    const where = document.createElement('span');
    where.textContent = place.name;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'fk-news-modal__close';
    close.setAttribute('aria-label', 'Close');
    close.textContent = 'Close';
    close.addEventListener('click', () => this.closeDialog());
    head.append(tag, where, close);

    const h = document.createElement('h2');
    h.className = 'fk-news-modal__title';
    h.textContent = title;

    const facts = document.createElement('dl');
    facts.className = 'fk-news-modal__facts';
    const fact = (k: string, v: string): void => {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      facts.append(dt, dd);
    };
    fact('Publisher', publisher);
    fact('Published', `${new Date(headline.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} (${ago(headline.at) === 'now' ? 'just now' : `${ago(headline.at)} ago`})`);
    fact('Feed', headline.source);
    fact('Pinned to', `${place.name}, inferred from the headline`);

    box.append(head, h);
    if (headline.snippet) {
      const p = document.createElement('p');
      p.className = 'fk-news-modal__snippet';
      p.textContent = headline.snippet;
      box.appendChild(p);
    }
    box.appendChild(facts);

    const open = document.createElement('a');
    open.className = 'fk-news-modal__open';
    open.href = headline.link;
    open.target = '_blank';
    open.rel = 'noopener noreferrer';
    open.textContent = `Read the article at ${publisher}`;
    box.appendChild(open);

    const seen = new Set([headline.title.toLowerCase().slice(0, 60)]);
    const related = allHeadlines()
      .filter((other) => other.link !== headline.link && placeOf(other)?.name === place.name)
      .sort((a, b) => b.at - a.at)
      .filter((other) => {
        const key = other.title.toLowerCase().slice(0, 60);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 6);
    if (related.length) {
      const label = document.createElement('div');
      label.className = 'fk-news-modal__label';
      label.textContent = `Also pinned to ${place.name}`;
      const list = document.createElement('ol');
      list.className = 'fk-news-modal__related';
      for (const other of related) {
        const parts = splitPublisher(other);
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = other.link;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = parts.title;
        const small = document.createElement('span');
        small.textContent = `${parts.publisher} · ${ago(other.at)}`;
        li.append(a, small);
        list.appendChild(li);
      }
      box.append(label, list);
    }

    backdrop.appendChild(box);
    document.body.appendChild(backdrop);
    this.dialog = backdrop;
    requestAnimationFrame(() => backdrop.classList.add('is-in'));
    close.focus();
  }

  private closeDialog(): void {
    const dialog = this.dialog;
    if (!dialog) return;
    this.dialog = null;
    dialog.classList.remove('is-in');
    setTimeout(() => dialog.remove(), this.reducedMotion ? 0 : 200);
    // Cards held open behind the dialog get a moment before they expire.
    const until = Date.now() + 1500;
    for (const card of this.live) card.expires = Math.max(card.expires, until);
    if (this.restoreFocus?.isConnected) this.restoreFocus.focus();
    this.restoreFocus = null;
  }
}

/** Great-circle distance in degrees; the globe uses it to hide far-side places. */
export function angularDistanceDeg(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180;
  const cos = Math.sin(aLat * rad) * Math.sin(bLat * rad)
    + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.cos((aLng - bLng) * rad);
  return Math.acos(Math.min(1, Math.max(-1, cos))) / rad;
}
