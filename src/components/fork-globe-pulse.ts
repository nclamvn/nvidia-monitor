// Fork-only. Live pulse overlay for the 3D globe in the AI Chip Monitor.
//
// Real headlines from the news panels surface one after another as small cards
// pinned to a place on the globe, hold for a few seconds and fade, the way a
// market wall keeps moving. The place is inferred from keywords in the
// headline (a company seat or a capital), so it marks what the story is about,
// not where it was reported from. Headlines with no recognisable place are
// skipped. The card text is the publisher's headline, unedited.
import { allHeadlines, type PulseHeadline } from '@/services/fork-headline-bus';

interface GlobeLike {
  getScreenCoords(lat: number, lng: number, altitude?: number): { x: number; y: number } | null;
  pointOfView(): { lat: number; lng: number; altitude: number };
}

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

const SPAWN_MS = 2600;
const HOLD_MS = 6500;
const MAX_LIVE = 3;
const FRONT_LIMIT_DEG = 68;
const MIN_SEPARATION_DEG = 28;

interface LiveCard { el: HTMLElement; place: Place; expires: number; leaving: boolean }

function ago(at: number): string {
  const mins = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  return hours < 48 ? `${hours}h` : `${Math.round(hours / 24)}d`;
}

function angularDistanceDeg(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180;
  const cos = Math.sin(aLat * rad) * Math.sin(bLat * rad)
    + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.cos((aLng - bLng) * rad);
  return Math.acos(Math.min(1, Math.max(-1, cos))) / rad;
}

export class GlobePulse {
  private readonly layer: HTMLElement;
  private readonly live: LiveCard[] = [];
  private readonly shown = new Map<string, number>();
  private spawnTimer: ReturnType<typeof setInterval> | null = null;
  private frame: number | null = null;
  private stopped = false;
  private readonly reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  constructor(private readonly container: HTMLElement, private readonly globe: GlobeLike) {
    this.layer = document.createElement('div');
    this.layer.className = 'fk-pulse-layer';
    this.layer.setAttribute('aria-hidden', 'true');
    container.appendChild(this.layer);
    this.spawnTimer = setInterval(() => this.spawn(), SPAWN_MS);
    setTimeout(() => this.spawn(), 1200);
    const tick = () => {
      if (this.stopped) return;
      this.position();
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  destroy(): void {
    this.stopped = true;
    if (this.spawnTimer) clearInterval(this.spawnTimer);
    if (this.frame != null) cancelAnimationFrame(this.frame);
    this.layer.remove();
  }

  private facing(place: Place): boolean {
    const pov = this.globe.pointOfView();
    return angularDistanceDeg(pov.lat, pov.lng, place.lat, place.lng) < FRONT_LIMIT_DEG;
  }

  private spawn(): void {
    if (this.stopped || document.hidden || this.live.length >= MAX_LIVE) return;
    if (this.container.clientWidth < 420) return;
    const now = Date.now();
    const busy = new Set(this.live.map((card) => card.place.name));
    const candidates: { headline: PulseHeadline; place: Place; last: number }[] = [];
    for (const headline of allHeadlines()) {
      const place = PLACES.find((p) => p.test.test(headline.title));
      if (!place || busy.has(place.name) || !this.facing(place)) continue;
      // Cards are about 240px wide; keep live ones apart so they never stack.
      if (this.live.some((card) => angularDistanceDeg(card.place.lat, card.place.lng, place.lat, place.lng) < MIN_SEPARATION_DEG)) continue;
      candidates.push({ headline, place, last: this.shown.get(headline.link) ?? 0 });
    }
    if (!candidates.length) return;
    // Least recently shown first, then newest, with a little shuffle on ties so
    // the wall does not replay in a fixed order.
    candidates.sort((a, b) => (a.last - b.last) || (b.headline.at - a.headline.at) || (Math.random() - 0.5));
    const pick = candidates[Math.floor(Math.random() * Math.min(4, candidates.length))];
    if (!pick) return;
    this.shown.set(pick.headline.link, now);
    this.add(pick.headline, pick.place);
  }

  private add(headline: PulseHeadline, place: Place): void {
    const el = document.createElement('a');
    el.className = `fk-pulse fk-pulse--${headline.category}`;
    el.href = headline.link;
    el.target = '_blank';
    el.rel = 'noopener noreferrer';
    el.tabIndex = -1;

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
    const title = document.createElement('span');
    title.className = 'fk-pulse__title';
    title.textContent = headline.title;
    card.append(meta, title);
    el.append(dot, card);

    this.layer.appendChild(el);
    this.live.push({ el, place, expires: Date.now() + HOLD_MS, leaving: false });
    this.position();
    requestAnimationFrame(() => el.classList.add('is-in'));
  }

  private position(): void {
    const now = Date.now();
    const width = this.container.clientWidth;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const card = this.live[i];
      if (!card) continue;
      const coords = this.globe.getScreenCoords(card.place.lat, card.place.lng, 0.01);
      const visible = !!coords && this.facing(card.place);
      if (coords) {
        card.el.style.transform = `translate3d(${Math.round(coords.x)}px, ${Math.round(coords.y)}px, 0)`;
        card.el.classList.toggle('is-left', coords.x > width * 0.62);
      }
      if (!card.leaving && (now > card.expires || !visible)) {
        card.leaving = true;
        card.el.classList.remove('is-in');
        const remove = () => {
          card.el.remove();
          const index = this.live.indexOf(card);
          if (index >= 0) this.live.splice(index, 1);
        };
        setTimeout(remove, this.reducedMotion ? 0 : 420);
      }
    }
  }
}
