import { clockTask, stopClockTask } from './shell/clock';
interface TwitchPlayer {
  pause(): void;
  setVolume(volume: number): void;
  setMuted(muted: boolean): void;
  getVolume(): number;
  getMuted(): boolean;
  addEventListener(event: string, listener: () => void): void;
}
interface TwitchSDK {
  Player: {
    new (
      id: string,
      options: { channel: string; parent: string[]; width: string; height: string; autoplay: boolean; muted: boolean },
    ): TwitchPlayer;
    READY: string;
  };
}
declare global {
  interface Window {
    Twitch?: TwitchSDK;
  }
}
let loading: Promise<TwitchSDK> | undefined;
function sdk(): Promise<TwitchSDK> {
  if (typeof window.Twitch?.Player === 'function' && typeof window.Twitch.Player.READY === 'string')
    return Promise.resolve(window.Twitch);
  if (loading) return loading;
  loading = new Promise<TwitchSDK>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://player.twitch.tv/js/embed/v1.js';
    script.async = true;
    const timer = setTimeout(() => finish(false), 5000);
    const finish = (loaded: boolean): void => {
      clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      if (loaded && typeof window.Twitch?.Player === 'function' && typeof window.Twitch.Player.READY === 'string')
        resolve(window.Twitch);
      else {
        script.remove();
        reject(new Error('Twitch volume memory unavailable'));
      }
    };
    script.onload = () => finish(true);
    script.onerror = () => finish(false);
    document.head.append(script);
  }).catch((error) => {
    loading = undefined;
    throw error;
  });
  return loading;
}
export class TwitchVolume {
  private generation = 0;
  private timer: ReturnType<typeof clockTask> | undefined;
  async mount(
    container: HTMLElement,
    channel: string,
    volume: number,
    muted: boolean,
    save: (volume: number, muted: boolean) => void,
  ): Promise<boolean> {
    this.stop();
    const generation = this.generation,
      previous = [...container.childNodes];
    let replaced = false;
    try {
      const api = await sdk();
      if (generation !== this.generation || !container.isConnected) return false;
      // Only replace the fallback after the official API has loaded successfully.
      replaced = true;
      container.replaceChildren();
      const host = document.createElement('div');
      host.id = 'twitch-volume-' + crypto.randomUUID();
      host.style.height = '100%';
      container.append(host);
      const player = new api.Player(host.id, {
        channel,
        parent: [location.hostname],
        width: '100%',
        height: '100%',
        autoplay: false,
        muted,
      });
      let initialized = false;
      player.addEventListener(api.Player.READY, () => {
        if (initialized || generation !== this.generation) return;
        initialized = true;
        player.pause();
        player.setMuted(false);
        player.setVolume(volume);
        player.setMuted(muted);
        this.timer = clockTask(
          'player.volume',
          () => {
            if (generation !== this.generation) return;
            try {
              const current = player.getVolume(),
                mute = player.getMuted();
              if (Number.isFinite(current) && current >= 0 && current <= 1 && typeof mute === 'boolean')
                save(current, mute);
            } catch {
              /* A temporarily unavailable player does not interrupt chat. */
            }
          },
          2000,
        );
      });
      return true;
    } catch {
      if (replaced && generation === this.generation && container.isConnected) container.replaceChildren(...previous);
      return false;
    }
  }
  stop(): void {
    this.generation++;
    if (this.timer !== undefined) {
      stopClockTask(this.timer);
      this.timer = undefined;
    }
  }
}
