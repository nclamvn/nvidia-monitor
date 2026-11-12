// Fork-only. A fixed live channel in a small panel, for the row under the main
// video wall. It reuses the upstream live-video session, so source fallback and
// live checks behave as in the main panel. The player starts muted once the
// panel scrolls into view; the viewer can also start it from the cover.
import { Panel } from './Panel';
import { LIVE_NEWS_SOURCES, type LiveNewsSlotId } from '@/config/live-video-sources';
import { withResolvedLiveVideos } from '@/services/live-video/resolved';
import { openLiveVideo, type LiveVideoSession, type LiveVideoState } from '@/services/live-video/session';
import type { LiveVideoSource } from '@/services/live-video/model';

export class ForkVideoPanel extends Panel {
  private session: LiveVideoSession | null = null;
  private stage: HTMLDivElement;
  private cover: HTMLButtonElement;
  private observer: IntersectionObserver | null = null;
  private started = false;
  private muted = true;

  constructor(id: string, private readonly slot: LiveNewsSlotId, private readonly label: string) {
    super({ id, title: label, closable: true, collapsible: true });
    this.content.classList.add('fk-video');
    this.stage = document.createElement('div');
    this.stage.className = 'fk-video__stage';
    this.cover = document.createElement('button');
    this.cover.type = 'button';
    this.cover.className = 'fk-video__cover';
    this.setCover('Play live', false);
    this.cover.addEventListener('click', () => this.start(true));
    this.setContentNodes(this.stage, this.cover);

    if (typeof IntersectionObserver === 'function') {
      this.observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) this.start(false);
      }, { threshold: 0.4 });
      this.observer.observe(this.element);
    }
  }

  private setCover(text: string, hidden: boolean): void {
    this.cover.textContent = '';
    const tag = document.createElement('b');
    tag.textContent = this.label;
    const line = document.createElement('span');
    line.textContent = text;
    this.cover.append(tag, line);
    this.cover.hidden = hidden;
  }

  private start(byViewer: boolean): void {
    if (this.started) {
      if (byViewer) { this.session?.retry(); this.session?.setPaused(false); }
      return;
    }
    this.started = true;
    this.observer?.disconnect();
    this.observer = null;
    this.setCover('Connecting', false);
    const source: LiveVideoSource = { slot: `fork-video/${this.slot}`, entries: LIVE_NEWS_SOURCES[this.slot], origin: 'builtin' };
    void withResolvedLiveVideos(source).then((resolved) => {
      if (!this.element.isConnected) { this.started = false; return; }
      this.session = openLiveVideo(this.stage, {
        source: resolved,
        autoplay: true,
        muted: this.muted,
        holdUnstarted: true,
        presentation: { title: `${this.label} feed`, className: 'fk-video__media', controls: true },
        onState: (state) => this.onState(state),
        onMutedChange: (muted) => { this.muted = muted; },
      });
    });
  }

  private onState(state: LiveVideoState): void {
    switch (state.phase) {
      case 'connecting':
        this.setCover(state.tapToPlay ? 'Play live' : 'Connecting', state.ready && !state.tapToPlay);
        return;
      case 'live':
      case 'recording':
        this.setCover('', true);
        return;
      case 'unverified':
        this.setCover('Play live', state.reason !== 'not-started');
        return;
      case 'offline':
        this.setCover('Channel offline. Tap to retry', false);
    }
  }

  public override destroy(): void {
    this.observer?.disconnect();
    this.session?.destroy();
    this.session = null;
    super.destroy();
  }
}
