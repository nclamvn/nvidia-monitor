// Fork-only. A live channel in a small panel, for the row under the main video
// wall. It reuses the upstream live-video session, so source fallback and live
// checks behave as in the main panel.
//
// The panel is given channels in order of preference: when one is offline it
// moves to the next, so the frame is not left empty. The player starts muted
// once the panel scrolls into view. The embedded player's own controls are
// off, because at this size they cover the picture and linger after the
// pointer has left; the panel draws two small controls that follow the pointer
// exactly instead.
import { Panel } from './Panel';
import { LIVE_NEWS_SOURCES, type LiveNewsSlotId } from '@/config/live-video-sources';
import { withResolvedLiveVideos } from '@/services/live-video/resolved';
import { openLiveVideo, type LiveVideoSession, type LiveVideoState } from '@/services/live-video/session';
import type { LiveVideoSource } from '@/services/live-video/model';

const START_DELAY_MS = 4000;

export interface ForkVideoChannel { slot: LiveNewsSlotId; name: string }

export class ForkVideoPanel extends Panel {
  private session: LiveVideoSession | null = null;
  private readonly stage: HTMLDivElement;
  private readonly cover: HTMLButtonElement;
  private readonly bar: HTMLDivElement;
  private readonly tag: HTMLSpanElement;
  private readonly muteBtn: HTMLButtonElement;
  private readonly pauseBtn: HTMLButtonElement;
  private observer: IntersectionObserver | null = null;
  private index = 0;
  private started = false;
  private muted = true;
  private paused = false;
  /** Channel switches since the last manual start. Capped at two rounds, so
   *  channels that go live and drop again cannot make the panel cycle forever. */
  private switches = 0;
  private generation = 0;

  constructor(id: string, title: string, private readonly channels: ForkVideoChannel[]) {
    super({ id, title, closable: true, collapsible: true });
    this.content.classList.add('fk-video');

    this.stage = document.createElement('div');
    this.stage.className = 'fk-video__stage';

    this.cover = document.createElement('button');
    this.cover.type = 'button';
    this.cover.className = 'fk-video__cover';
    this.cover.addEventListener('click', () => this.onCoverClick());

    this.bar = document.createElement('div');
    this.bar.className = 'fk-video__bar';
    this.tag = document.createElement('span');
    this.tag.className = 'fk-video__tag';
    this.pauseBtn = this.control(() => {
      this.paused = !this.paused;
      this.session?.setPaused(this.paused);
      this.syncControls();
    });
    this.muteBtn = this.control(() => {
      this.muted = !this.muted;
      this.session?.setMuted(this.muted);
      this.syncControls();
    });
    this.bar.append(this.tag, this.pauseBtn, this.muteBtn);

    this.setContentNodes(this.stage, this.cover, this.bar);
    this.setCover('Play live', false);
    this.syncControls();

    // The players wait a few seconds so they do not compete with the map and
    // the news for the first paint, then start when the panel is on screen.
    setTimeout(() => {
      if (this.started || !this.element.isConnected || typeof IntersectionObserver !== 'function') return;
      this.observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) this.start();
      }, { threshold: 0.4 });
      this.observer.observe(this.element);
    }, START_DELAY_MS);
  }

  private get channel(): ForkVideoChannel {
    return this.channels[this.index % this.channels.length] as ForkVideoChannel;
  }

  private control(onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'fk-video__ctl';
    button.addEventListener('click', onClick);
    return button;
  }

  private syncControls(): void {
    this.tag.textContent = this.channel.name;
    this.pauseBtn.textContent = this.paused ? 'Play' : 'Pause';
    this.muteBtn.textContent = this.muted ? 'Sound on' : 'Mute';
    this.muteBtn.setAttribute('aria-pressed', String(!this.muted));
  }

  private setCover(text: string, hidden: boolean): void {
    this.cover.textContent = '';
    const name = document.createElement('b');
    name.textContent = this.channel.name;
    const line = document.createElement('span');
    line.textContent = text;
    this.cover.append(name, line);
    this.cover.hidden = hidden;
    this.bar.hidden = !hidden;
  }

  private onCoverClick(): void {
    if (!this.started) { this.start(); return; }
    // A manual retry starts a fresh round from the preferred channel.
    this.switches = 0;
    this.index = 0;
    this.open();
  }

  private start(): void {
    if (this.started) return;
    this.started = true;
    this.observer?.disconnect();
    this.observer = null;
    this.open();
  }

  private open(): void {
    const generation = ++this.generation;
    this.session?.destroy();
    this.session = null;
    this.paused = false;
    this.syncControls();
    this.setCover('Connecting', false);
    const { slot, name } = this.channel;
    const source: LiveVideoSource = { slot: `fork-video/${slot}`, entries: LIVE_NEWS_SOURCES[slot], origin: 'builtin' };
    void withResolvedLiveVideos(source).then((resolved) => {
      if (generation !== this.generation || !this.element.isConnected) return;
      this.session = openLiveVideo(this.stage, {
        source: resolved,
        autoplay: true,
        muted: this.muted,
        holdUnstarted: true,
        presentation: { title: `${name} feed`, className: 'fk-video__media', controls: false },
        onState: (state) => { if (generation === this.generation) this.onState(state); },
        onMutedChange: (muted) => { this.muted = muted; this.syncControls(); },
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
        this.switches += 1;
        if (this.switches < this.channels.length * 2) {
          this.index += 1;
          this.open();
          return;
        }
        this.setCover('No channel is live right now. Tap to retry', false);
    }
  }

  public override destroy(): void {
    this.generation += 1;
    this.observer?.disconnect();
    this.session?.destroy();
    this.session = null;
    super.destroy();
  }
}
