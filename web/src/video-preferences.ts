export interface VideoPreferences {
  channel: string;
  volume: number;
  muted: boolean;
  docked: boolean;
  rememberVolume: boolean;
}
export function parseVideo(value: unknown, channels: readonly string[]): VideoPreferences {
  const defaults = {
    channel: channels[0] ?? 'hasanabi',
    volume: 0.5,
    muted: true,
    docked: false,
    rememberVolume: false,
  };
  if (!value || typeof value !== 'object') return defaults;
  const data = value as Record<string, unknown>;
  return {
    channel: typeof data.channel === 'string' && channels.includes(data.channel) ? data.channel : defaults.channel,
    volume:
      typeof data.volume === 'number' && Number.isFinite(data.volume) && data.volume >= 0 && data.volume <= 1
        ? data.volume
        : 0.5,
    muted: typeof data.muted === 'boolean' ? data.muted : true,
    docked: data.docked === true,
    rememberVolume: data.rememberVolume === true,
  };
}
export function twitchParent(hostname: string): string {
  if (!/^[a-z0-9.-]+$/i.test(hostname)) throw new Error('Invalid Twitch parent domain');
  return hostname;
}
