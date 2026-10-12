import { parseChannels,parseWorkspaceChannels } from './protocol';
type ChannelAction = { kind: 'focus' | 'add' | 'remove'; channel: string };
export function channelURL(current: URL, joined: readonly string[], action: ChannelAction,capacity=6): URL {
  const requested = parseChannels(action.channel); const channel = requested[0]; if (requested.length !== 1 || !channel) throw new Error('Invalid channel');
  let channels: string[];
  switch (action.kind) {
    case 'focus': if (!joined.includes(channel)) throw new Error('Channel is not joined'); channels = [channel, ...joined.filter(name => name !== channel)]; break;
    case 'add': channels = [...new Set([...joined, channel])]; break;
    case 'remove': channels = joined.filter(name => name !== channel); break;
  }
  parseWorkspaceChannels(channels.join(','),capacity);
  const url = new URL(current); url.searchParams.set('channel', channels.join(',')); url.searchParams.delete('mid');url.searchParams.delete('workspace'); return url;
}
export const CHANNEL_COLORS = ['#6ea8ff', '#e08fd0', '#ff9a5e', '#ffd75f', '#5fd8b0', '#b48fff'];
export class ChannelControls {
  private chips: HTMLElement;
  private addForm: HTMLFormElement;
  private input: HTMLInputElement;
  private status: HTMLElement;
  constructor(private root: HTMLElement, private composer: HTMLFormElement, private select: HTMLSelectElement, private channels: readonly string[],private capacity=6) {
    root.setAttribute('aria-label', 'Joined channels');
    for (const [index, channel] of channels.entries()) {
      const group = document.createElement('span'); group.className = 'joined-channel'; group.style.setProperty('--channel-color', CHANNEL_COLORS[index] ?? CHANNEL_COLORS[0]!);
      const link = document.createElement('a'); link.href = channelURL(new URL(location.href), channels, { kind: 'focus', channel },Math.max(channels.length,capacity)).href; link.textContent = '#' + channel; link.title = 'Focus #' + channel;
      if (index === 0) link.setAttribute('aria-current', 'page'); group.append(link);
      if (channels.length > 1) { const remove = document.createElement('a'); remove.href = channelURL(new URL(location.href), channels, { kind: 'remove', channel },Math.max(channels.length,capacity)).href; remove.textContent = '×'; remove.setAttribute('aria-label', 'Leave #' + channel); group.append(remove); }
      root.append(group);
    }
    this.addForm = document.createElement('form'); this.input = document.createElement('input'); this.input.maxLength = 25; this.input.placeholder = 'Add channel'; this.input.setAttribute('aria-label', 'Channel to add');
    const add = document.createElement('button'); add.type = 'submit'; add.textContent = 'Add'; this.status = document.createElement('span'); this.status.role = 'status';
    this.addForm.append(this.input, add, this.status); root.append(this.addForm); this.addForm.hidden = channels.length >= capacity; this.addForm.addEventListener('submit', this.add);
    const limit=document.createElement('span');limit.className='channel-capacity';limit.textContent=channels.length+'/'+capacity+' workspace channels · up to 6 per pane';root.append(limit);
    this.chips = document.createElement('div'); this.chips.className = 'send-channel-chips'; this.chips.setAttribute('aria-label', 'Send destination'); this.chips.hidden = channels.length < 2;
    for (const [index, channel] of channels.entries()) { const button = document.createElement('button'); button.type = 'button'; button.dataset.sendChannel = channel; button.textContent = '#' + channel; button.style.setProperty('--channel-color', CHANNEL_COLORS[index] ?? CHANNEL_COLORS[0]!); this.chips.append(button); }
    composer.prepend(this.chips); this.chips.addEventListener('click', this.pick); select.addEventListener('change', this.paint); composer.addEventListener('channelstatechange', this.paint); this.paint();
    root.addEventListener('click',this.navigate);
  }
  private paint = (): void => { for (const button of this.chips.querySelectorAll<HTMLButtonElement>('button')) { button.setAttribute('aria-pressed', String(button.dataset.sendChannel === this.select.value)); button.disabled = this.select.disabled; } };
  private pick = (event: MouseEvent): void => {
    if (this.select.disabled || !(event.target instanceof Element)) return;
    const channel = event.target.closest<HTMLButtonElement>('[data-send-channel]')?.dataset.sendChannel;
    if (!channel || !this.channels.includes(channel)) return;
    this.select.value = channel; this.select.dispatchEvent(new Event('change')); this.paint(); this.composer.querySelector<HTMLTextAreaElement>('textarea')?.focus();
  };
  private navigate=(event:MouseEvent):void=>{if(this.select.disabled&&event.target instanceof Element&&event.target.closest('a')){event.preventDefault();this.status.textContent='Wait for the current send outcome before changing channels';}};
  private add = (event: SubmitEvent): void => { event.preventDefault();if(this.select.disabled){this.status.textContent='Wait for the current send outcome before changing channels';return;}try { location.assign(channelURL(new URL(location.href), this.channels, { kind: 'add', channel: this.input.value.trim().replace(/^#/, '') },this.capacity).href); } catch (error) { this.status.textContent = error instanceof Error ? error.message : 'Invalid channel'; } };
  stop(): void {this.root.removeEventListener('click',this.navigate); this.addForm.removeEventListener('submit', this.add); this.chips.removeEventListener('click', this.pick); this.select.removeEventListener('change', this.paint); this.composer.removeEventListener('channelstatechange', this.paint); }
}
