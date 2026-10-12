import type { ChatMessage } from './protocol';
import type { DisplayOptions } from './display';

export class Attention {
  private missed: { id: string; channel: string }[] = [];
  private seen = new Set<string>();
  private audio: AudioContext | undefined;
  private lastNote = -Infinity;
  private lastSound = -Infinity;
  private streams = new Map<string, boolean>();
  private stopped = false;
  constructor(private button: HTMLButtonElement, private options: () => DisplayOptions,
    private jump: (id: string, channel: string) => void) {
    button.addEventListener('click', this.click); document.addEventListener('pointerdown', this.unlock);
  }
  async permission(): Promise<void> {
    if (this.options().notify && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch { /* browser denied or unavailable */ }
    }
  }
  async test():Promise<string>{
    this.unlock();if(this.audio?.state==='suspended')try{await this.audio.resume();}catch{/* report unavailable below */}
    this.sound();const reports:string[]=[];
    if(this.options().ping)reports.push(this.audio?.state==='running'?'Test sound requested':'Sound unavailable in this browser');
    if(this.options().notify){await this.permission();if(typeof Notification!=='undefined'&&Notification.permission==='granted'){await this.notify('Chatty Cat test alert','Notifications are enabled','test','',true);reports.push('Test notification requested');}else reports.push('Notification permission unavailable');}
    return reports.join(' · ')||'Enable mention sound or notifications to test';
  }
  mention(message: ChatMessage, highlight: boolean, replay = false): void {
    if (this.stopped || replay || !highlight || !message.id || message.command !== 'PRIVMSG' || (!document.hidden && document.hasFocus())) return;
    const key = message.channel + ':' + message.id;
    if (this.seen.has(key)) return;
    this.seen.add(key); while (this.seen.size > 2000) { const first = this.seen.values().next().value; if (first) this.seen.delete(first); else break; }
    this.missed.push({ id: message.id, channel: message.channel }); if (this.missed.length > 500) this.missed.shift(); this.render(); this.sound();
    if (Date.now() - this.lastNote >= 8000) { this.lastNote = Date.now(); void this.notify(`${message.tags['display-name'] || message.login} mentioned you`, message.text.slice(0, 140), 'mention', message.channel); }
  }
  whisper(message: ChatMessage): void { if (document.hidden || !document.hasFocus()) { this.sound(); void this.notify(`${message.tags['display-name'] || message.login} whispered you`, message.text.slice(0, 140), 'whisper', ''); } }
  stream(channel: string, live: boolean, title: string): void {
    const previous = this.streams.get(channel); this.streams.set(channel, live);
    if (previous === false && live) void this.notify(`${channel} is live`, title.slice(0, 300), 'live-' + channel, channel);
  }
  private async notify(title: string, body: string, tag: string, channel: string,explicitTest=false): Promise<void> {
    if (this.stopped || !this.options().notify || (!explicitTest&&!document.hidden) || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const options = { body, tag, icon: '/icon-192.png', data: { channel } };
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      if (this.stopped) return;
      if (registration) await registration.showNotification(title, options);
      else { const note = new Notification(title, options); note.onclick = () => { window.focus(); note.close(); }; }
    } catch { /* optional notifications must not interrupt chat */ }
  }
  private unlock = (): void => {
    if (!this.options().ping || this.stopped) return;
    try { this.audio ??= new AudioContext(); if (this.audio.state === 'suspended') void this.audio.resume().catch(() => {}); } catch { /* unsupported */ }
  };
  private sound(): void {
    if (!this.options().ping || !this.audio || this.audio.state !== 'running' || Date.now() - this.lastSound < 250) return;
    this.lastSound = Date.now();
    try {
      const time = this.audio.currentTime, oscillator = this.audio.createOscillator(), gain = this.audio.createGain();
      oscillator.frequency.setValueAtTime(880, time); oscillator.frequency.exponentialRampToValueAtTime(660, time + .12);
      gain.gain.setValueAtTime(.07, time); gain.gain.exponentialRampToValueAtTime(.001, time + .3);
      oscillator.connect(gain); gain.connect(this.audio.destination); oscillator.start(time); oscillator.stop(time + .32);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    } catch { /* audio is optional */ }
  }
  private click = (event: MouseEvent): void => {
    if (event.shiftKey) this.missed = [];
    else { const next = this.missed.shift(); if (next) this.jump(next.id, next.channel); }
    this.render();
  };
  private render(): void {
    this.button.hidden = !this.missed.length; this.button.textContent = '@' + this.missed.length;
    this.button.setAttribute('aria-label', `${this.missed.length} missed mentions. Jump to next; Shift-click clears.`);
    this.button.title = 'Missed mentions · click to jump · Shift-click clears';
  }
  stop(): void { this.stopped = true; this.button.removeEventListener('click', this.click); document.removeEventListener('pointerdown', this.unlock); void this.audio?.close().catch(() => {}); }
}
