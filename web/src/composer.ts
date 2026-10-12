import {getPresentation} from './presentation';
import {isLocalCommand,LOCAL_COMMANDS} from './local-commands';
import { completions, insertCompletion, wireMessage, type Completion } from './completion';
import type { AuthStatus } from './auth';
import type { ChatMessage } from './protocol';

export type SendResult = { sent: boolean; command?: boolean; action?: boolean; whisper?: boolean; recipient?: string; messageID?: string; error?: string; uncertain?: boolean };
export function validateMessage(text: string): string | undefined {
  if (!text.trim() || [...text].length > 500 || /[\x00-\x1f\x7f-\x9f]/.test(text)) return 'Use 1–500 characters without line breaks or control characters';
  if (text.trimStart().startsWith('/') && !/^\/(?:w|me|ban|timeout|unban|delete|clear|slow|slowoff|followers|followersoff|subscribers|subscribersoff|emoteonly|emoteonlyoff|uniquechat|uniquechatoff|r9kbeta|r9kbetaoff|announce|announceblue|announcegreen|announceorange|announcepurple|color|raid|unraid|mod|unmod|vip|unvip|block|unblock|shoutout)(?:\s|$)/i.test(text.trimStart())) return 'Unsupported slash command; open Help for supported commands';
  return undefined;
}
export function parseSendResult(data: unknown): SendResult {
  if (!data || typeof data !== 'object') throw new Error('Invalid send response');
  const value = data as Record<string, unknown>;
  if (typeof value['sent'] !== 'boolean' || (value['uncertain'] !== undefined && typeof value['uncertain'] !== 'boolean')) throw new Error('Invalid send response');
  if (value['whisper'] !== undefined && typeof value['whisper'] !== 'boolean') throw new Error('Invalid whisper result');
  if (value['whisper'] === true && (value['command'] !== true || value['action'] === true)) throw new Error('Conflicting whisper result');
  if (value['action'] !== undefined && typeof value['action'] !== 'boolean') throw new Error('Invalid action result');
  if (value['command'] === true && value['action'] === true) throw new Error('Conflicting send result');
  if (value['command'] !== undefined && typeof value['command'] !== 'boolean') throw new Error('Invalid command result');
  if (value['sent']) {
    if (value['command'] === true) {
      if (value['whisper'] === true) { if (typeof value['recipient'] !== 'string' || !/^[a-z0-9_]{1,25}$/.test(value['recipient'])) throw new Error('Invalid whisper recipient'); return { sent: true, command: true, whisper: true, recipient: value['recipient'] }; }
      return { sent: true, command: true };
    }
    if (typeof value['messageID'] !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value['messageID'])) throw new Error('Missing message ID');
    return { sent: true, messageID: value['messageID'], ...(value['action'] === true ? { action: true } : {}) };
  }
  if (typeof value['error'] !== 'string' || !value['error']) throw new Error('Missing send error');
  return { sent: false, error: value['error'], uncertain: value['uncertain'] === true };
}

function field<T extends HTMLElement>(form: HTMLFormElement, id: string, ctor: new () => T): T {
  const node = form.querySelector('#' + id);
  if (!(node instanceof ctor)) throw new Error('Missing composer field: ' + id);
  return node;
}
export class Composer {
  mention(login:string,at:boolean,comma:boolean):void{if(!this.canInsert)return;this.input.setRangeText((at?'@':'')+login+(comma?', ':' '),this.input.selectionStart,this.input.selectionEnd,'end');this.edit();this.input.focus();}
  private presentationChanged=():void=>{if(this.blocked&&!this.busy)this.status.textContent=!getPresentation().showWait&&this.blocked.startsWith('Slow mode:')?'Slow mode active; wait before sending':this.blocked;this.render();};
  private outgoing():string{const text=wireMessage(this.input.value);if(!this.reply||!getPresentation().stripReplyMention||text.trimStart().startsWith('/'))return text;const login=this.reply.login.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return text.replace(new RegExp('^@?'+login+'[, :]?\\s+','i'),'');}
  private composing=false;
  private compositionStart=():void=>{this.composing=true;};
  private compositionEnd=():void=>{this.composing=false;};
  private localDispatch:((text:string)=>Promise<string|undefined>)|undefined;
  configureLocal(dispatch:(text:string)=>Promise<string|undefined>):void{this.localDispatch=dispatch;this.render();}
  stageReply(message:ChatMessage,text:string):void{if(!this.canInsert)throw new Error('Log in to stage a public reply');if(this.target!==message.channel&&this.draftFor(message.channel).trim())throw new Error('Finish or clear the destination draft before staging a reply');this.selectReply(message);if(this.reply!==message)throw new Error('Reply channel is unavailable');this.input.value=text;this.edit();}
  private blocked = '';
  private commands:readonly string[]=[];
  private commandPreview:((text:string)=>boolean)|undefined;
  configureCommands(commands:readonly string[],preview:(text:string)=>boolean):void{this.commands=[...commands];this.commandPreview=preview;this.render();}
  get draft():string{return this.input.value;}
  draftFor(channel:string):string{try{return sessionStorage.getItem('chatthing:v1:draft:'+channel)??'';}catch{return '';}}
  prepare(text:string):void{if(!this.canInsert)return;this.reply=undefined;this.input.value=text;this.edit();this.input.focus();}
  private validation(text:string):string|undefined{const error=validateMessage(text);if(getPresentation().overflow==='truncate'&&[...text].length>500&&!text.trimStart().startsWith('/')&&!/[\x00-\x1f\x7f-\x9f]/.test(text))return undefined;if(this.localDispatch&&isLocalCommand(text))return undefined;return error?.startsWith('Unsupported slash')&&this.commands.some(trigger=>trigger.toLowerCase()===text.split(/\s/)[0]?.toLowerCase())?undefined:error;}
  setBlock(reason: string): void { if (this.blocked === reason) return; this.blocked = reason; if (!this.busy) this.status.textContent = !getPresentation().showWait&&reason.startsWith('Slow mode:')?'Slow mode active; wait before sending':reason; this.render(); }
  private readonly input: HTMLTextAreaElement;
  private readonly suggestions: HTMLElement;
  private completion: Completion | undefined;
  private completionIndex = 0;
  private names: readonly string[] = [];
  private emotes: readonly string[] = [];
  private readonly channel: HTMLSelectElement;
  private readonly button: HTMLButtonElement;
  private readonly count: HTMLElement;
  private readonly status: HTMLElement;
  private readonly replyTarget: HTMLElement;
  private readonly replyLabel: HTMLElement;
  private readonly cancelReply: HTMLButtonElement;
  private auth: AuthStatus | undefined;
  private authGeneration=0;
  private reply: ChatMessage | undefined;
  private busy = false;
  private disposed = false;
  private requestID: string | undefined;
  private historyIndex = -1;
  private savedDraft = '';
  private readonly abort = new AbortController();
  constructor(private readonly form: HTMLFormElement, channels: string[], private readonly accepted: (id: string, channel: string, text: string) => void = () => {}, private readonly commandAccepted: (result: SendResult, text: string, requestID: string) => void = () => {}) {
    this.input = field(form, 'message', HTMLTextAreaElement);
    this.suggestions = field(form, 'completions', HTMLElement);
    this.channel = field(form, 'send-channel', HTMLSelectElement);
    this.button = field(form, 'send', HTMLButtonElement);
    this.count = field(form, 'message-length', HTMLElement);
    this.status = field(form, 'send-status', HTMLElement);
    this.replyTarget = field(form, 'reply-target', HTMLElement);
    this.replyLabel = field(form, 'reply-label', HTMLElement);
    this.cancelReply = field(form, 'cancel-reply', HTMLButtonElement);
    for (const channel of channels) { const option = document.createElement('option'); option.value = channel; option.textContent = '#' + channel; this.channel.append(option); }
    this.restoreDraft();
    document.addEventListener('presentationchange',this.presentationChanged);form.addEventListener('submit', this.submit);
    this.input.addEventListener('input', this.edit);this.input.addEventListener('compositionstart',this.compositionStart);this.input.addEventListener('compositionend',this.compositionEnd);
    this.input.addEventListener('keydown', this.key);
    this.input.addEventListener('click', this.closeCompletion);
    this.input.addEventListener('blur', this.closeCompletion);
    this.suggestions.addEventListener('mousedown', this.pickCompletion);
    this.channel.addEventListener('change', this.changeChannel);
    this.cancelReply.addEventListener('click', this.clearReply);
    this.render();
  }
  get canInsert(): boolean { return this.auth?.authenticated === true && !this.busy; }
  insert(code: string): void {
    if (!this.canInsert) return;
    const start = this.input.selectionStart; const end = this.input.selectionEnd;
    const prefix = start > 0 && !/\s/.test(this.input.value[start - 1] ?? '') ? ' ' : '';
    this.input.setRangeText(prefix + code + ' ', start, end, 'end');
    this.closeCompletion(); this.requestID = undefined; this.historyIndex = -1; this.saveDraft(); this.render(); this.input.focus();
  }
  focusTyping(text:string):void {
    if(!this.canInsert)return;
    this.input.focus();if(text){this.input.setRangeText(text,this.input.selectionStart,this.input.selectionEnd,'end');this.edit();}
  }
  prepareWhisper(login: string): void {
    if (!this.canInsert || !/^[a-z0-9_]{1,25}$/.test(login)) return;
    if (this.input.value.trim()) { this.status.textContent = 'Finish or clear your current draft before replying privately'; this.input.focus(); return; }
    this.input.value = '/w ' + login + ' '; this.reply = undefined; this.edit(); this.input.focus();
  }
  get target(): string { return this.channel.value; }
  get sending(): boolean { return this.busy; }
  setTarget(channel: string): void { if(this.busy || channel===this.target || ![...this.channel.options].some(option=>option.value===channel))return;this.saveDraft();this.channel.value=channel;this.channel.dispatchEvent(new Event('change')); }
  setCandidates(names: readonly string[], emotes: readonly string[]): void { this.names = names; this.emotes = emotes; }
  private closeCompletion = (): void => {
    this.completion = undefined; this.suggestions.hidden = true;
    this.input.setAttribute('aria-expanded', 'false'); this.input.removeAttribute('aria-activedescendant');
  };
  private paintCompletion(): void {
    if (!this.completion) { this.closeCompletion(); return; }
    this.suggestions.replaceChildren(); this.suggestions.hidden = false;
    this.input.setAttribute('aria-expanded', 'true');
    this.completion.items.forEach((item, index) => {
      const option = document.createElement('div');
      option.id = `completion-${index}`; option.role = 'option'; option.dataset.index = String(index);
      option.setAttribute('aria-selected', String(index === this.completionIndex));
      option.textContent = item.value; this.suggestions.append(option);
    });
    const active = this.suggestions.children[this.completionIndex];
    if (active instanceof HTMLElement) { this.input.setAttribute('aria-activedescendant', active.id); active.scrollIntoView?.({ block: 'nearest' }); }
  }
  private acceptCompletion(): void {
    if (!this.completion) return;
    const result = insertCompletion(this.input.value, this.completion, this.completionIndex);
    this.input.value = result.text; this.input.setSelectionRange(result.caret, result.caret);
    this.closeCompletion(); this.requestID = undefined; this.historyIndex = -1; this.saveDraft(); this.render();
  }
  private pickCompletion = (event: MouseEvent): void => {
    if (!(event.target instanceof Element)) return;
    const index = event.target.closest<HTMLElement>('[data-index]')?.dataset.index;
    if (index === undefined) return;
    event.preventDefault(); this.completionIndex = Number(index); this.acceptCompletion(); this.input.focus();
  };
  setAuth(auth: AuthStatus | undefined): void {
    if((this.auth?.userID??this.auth?.login)!==(auth?.userID??auth?.login)||!auth?.authenticated){this.authGeneration++;this.requestID=undefined;this.reply=undefined;if(/^\s*[/.](?:w|r|whisper|msg)(?:\s|$)/i.test(this.input.value))this.input.value='';}
    this.auth = auth;
    if (!auth?.authenticated) this.closeCompletion();
    document.documentElement.dataset.authenticated = String(auth?.authenticated === true);
    if (!this.busy) this.status.textContent = auth?.authenticated ? '' : 'Log in with Twitch to send messages';
    this.render();
  }
  selectReply(message: ChatMessage): void {
    if (!this.auth?.authenticated || this.busy || !message.id || message.command !== 'PRIVMSG') return;
    if (![...this.channel.options].some((option) => option.value === message.channel)) return;
    this.closeCompletion(); this.saveDraft(); this.channel.value = message.channel; this.restoreDraft();
    this.reply = message; this.requestID = undefined; this.historyIndex = -1;
    this.render(); this.input.focus();
  }
  private history(): string[] {
    try {
      const data: unknown = JSON.parse(localStorage.getItem('chatthing:v1:sent:' + this.channel.value) ?? '[]');
      return Array.isArray(data) ? data.filter((item): item is string => typeof item === 'string' && !validateMessage(item)).slice(-50) : [];
    } catch { return []; }
  }
  private saveDraft(): void {
    try { sessionStorage.setItem('chatthing:v1:draft:' + this.channel.value, /^\s*[/.](?:w|r|whisper|msg)(?:\s|$)/i.test(this.input.value) ? '' : this.input.value); } catch { /* optional storage */ }
  }
  private restoreDraft(): void {
    try { this.input.value = sessionStorage.getItem('chatthing:v1:draft:' + this.channel.value) ?? ''; } catch { this.input.value = ''; }
  }
  private render(): void {
    const signedIn = this.auth?.authenticated === true;
    const local=!!this.localDispatch&&isLocalCommand(this.input.value);
    this.input.disabled = this.busy || !signedIn&&!this.localDispatch;
    this.channel.disabled = this.busy;
    this.button.disabled = this.busy || !signedIn&&!local || (!!this.blocked && !/^\s*\//.test(this.input.value)) || !!this.validation(wireMessage(this.input.value));
    this.button.textContent = this.busy ? 'Sending…' : local?'Run locally':'Send';
    this.input.placeholder = signedIn ? 'Message' : this.localDispatch?'Local command (/help) or log in to send':'Log in';
    const length = [...wireMessage(this.input.value)].length;
    this.count.textContent = `${length}/500`;
    this.count.hidden=!getPresentation().showLength;this.form.dataset.empty=String(!this.input.value);this.count.classList.toggle('warn', getPresentation().overflow==='highlight'&&length >= 460);
    this.count.title = length > 500 ? 'Message exceeds Twitch’s 500-character limit' : length >= 460 ? 'Approaching Twitch’s message limit' : '';
    this.input.style.height = 'auto';
    this.input.style.height = Math.max(34, Math.min(this.input.scrollHeight + 2, 160)) + 'px';
    this.input.style.overflowY = this.input.scrollHeight > 158 ? 'auto' : 'hidden';
    this.form.dispatchEvent(new Event('composerresize'));
    this.replyTarget.hidden = !this.reply;
    this.replyLabel.textContent = this.reply ? `Replying to ${this.reply.login}: ${this.reply.text.slice(0, 120)}` : '';
    this.cancelReply.disabled = this.busy;
    this.form.dispatchEvent(new Event('channelstatechange'));
  }
  private edit = (): void => { this.requestID = undefined; this.historyIndex = -1; this.saveDraft(); this.render();
    this.completion = completions(this.input.value, this.input.selectionStart, this.input.selectionEnd, this.names, this.emotes,false,[...this.commands,...this.localDispatch?LOCAL_COMMANDS:[]]);
    this.completionIndex = 0; this.paintCompletion();
  };
  private clearReply = (): void => { this.reply = undefined; this.requestID = undefined; this.render(); };
  private changeChannel = (): void => {
    this.closeCompletion();
    // Drafts are saved on every edit, before the selection changes.
    this.reply = undefined; this.requestID = undefined; this.historyIndex = -1;
    this.restoreDraft(); this.status.textContent = ''; this.render();
  };
  private key = (event: KeyboardEvent): void => {
    if (this.busy || this.input.disabled || event.isComposing) return;
    if (this.completion) {
      if (['Tab', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();
        const direction = event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey) ? -1 : 1;
        this.completionIndex = (this.completionIndex + direction + this.completion.items.length) % this.completion.items.length;
        this.paintCompletion(); return;
      }
      if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); this.acceptCompletion(); return; }
      if (event.key === 'Escape') { event.preventDefault(); this.closeCompletion(); return; }
    }
    if (event.key === 'Tab' && !event.shiftKey) {
      this.completion = completions(this.input.value, this.input.selectionStart, this.input.selectionEnd, this.names, this.emotes, true);
      if (this.completion) { event.preventDefault(); this.completionIndex = 0; this.paintCompletion(); return; }
    }
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); this.form.requestSubmit(); return; }
    if (event.key === 'Escape' && this.reply) { event.preventDefault(); this.clearReply(); return; }
    if (event.key === 'ArrowUp' && this.input.value.slice(0, this.input.selectionStart).includes('\n')) return;
    if (event.key === 'ArrowDown' && this.input.value.slice(this.input.selectionEnd).includes('\n')) return;
    if ((event.key !== 'ArrowUp' && event.key !== 'ArrowDown') || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const values = this.history();
    if (!values.length || (this.historyIndex < 0 && event.key === 'ArrowDown')) return;
    event.preventDefault();
    if (this.historyIndex < 0) { this.savedDraft = this.input.value; this.historyIndex = values.length; }
    this.historyIndex += event.key === 'ArrowUp' ? -1 : 1;
    this.historyIndex = Math.max(0, this.historyIndex);
    if (this.historyIndex >= values.length) { this.historyIndex = -1; this.input.value = this.savedDraft; }
    else this.input.value = values[this.historyIndex] ?? '';
    this.requestID = undefined; this.render();
  };
  private submit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    if(this.busy||this.composing)return;
    if(this.localDispatch&&isLocalCommand(wireMessage(this.input.value))){const generation=this.authGeneration;try{const report=await this.localDispatch(wireMessage(this.input.value));if(generation===this.authGeneration)this.status.textContent=report??'Local command unavailable';}catch(error){if(generation===this.authGeneration)this.status.textContent=error instanceof Error?error.message:'Local command failed';}this.render();return;}
    if (!this.auth?.authenticated || !this.auth.csrf) return;
    if(getPresentation().overflow==='truncate'&&[...this.outgoing()].length>500&&!this.input.value.trimStart().startsWith('/')){this.input.value=[...this.outgoing()].slice(0,500).join('');this.edit();this.status.textContent='Truncated to 500 characters; review and press Send';return;}
    if (this.blocked && !/^\s*\//.test(this.input.value)) { this.status.textContent = this.blocked; return; }
    try{if(this.commandPreview?.(wireMessage(this.input.value)))return;}catch(error){this.status.textContent=error instanceof Error?error.message:'Command preview failed';return;}
    const error = validateMessage(this.outgoing());
    if (error) { this.status.textContent = error; return; }
    const sendingAccount=this.auth.userID??this.auth.login,sendingGeneration=this.authGeneration;
    this.busy = true; this.status.textContent = 'Sending…'; this.render();
    const text = this.outgoing();
    this.closeCompletion();
    try {
      this.requestID ??= crypto.randomUUID();
      const response = await fetch('/api/chat/send', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': this.auth.csrf },
        body: JSON.stringify({ channel: this.channel.value, message: text, requestID: this.requestID, ...(this.reply && !text.trimStart().startsWith('/') ? { replyID: this.reply.id } : {}) }),
        signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(30000)]),
      });
      const result = parseSendResult(await response.json());
      if (this.disposed) return;
      if(this.authGeneration!==sendingGeneration||!this.auth?.authenticated||(this.auth.userID??this.auth.login)!==sendingAccount){this.status.textContent='Account changed; check Twitch for the previous send outcome';return;}
      if (response.ok && result.sent && (result.messageID || result.command)) {
        const history = this.history(); if (!result.whisper && history.at(-1) !== text) history.push(text);
        try { localStorage.setItem('chatthing:v1:sent:' + this.channel.value, JSON.stringify(history.slice(-50))); } catch { /* optional storage */ }
        if (result.command) this.commandAccepted(result, text, this.requestID);
        this.input.value = ''; if (!result.command && !result.action) this.reply = undefined; this.requestID = undefined; this.historyIndex = -1; this.saveDraft();
        this.status.textContent = result.whisper ? 'Whisper request accepted; Twitch does not confirm delivery' : result.command ? /^\/raid(?:\s|$)/i.test(text.trim())?'Raid requested; complete or cancel it in Twitch':'Command completed' : 'Sent'; if (result.messageID && !result.command) this.accepted(result.messageID, this.channel.value, text);
      } else {
        this.status.textContent = result.error || 'Delivery could not be confirmed; check chat before sending again';
        if (!result.uncertain) this.requestID = undefined;
        if (response.status === 401) this.setAuth(undefined);
      }
    } catch {
      if (!this.disposed) this.status.textContent = 'Delivery could not be confirmed; check chat before retrying';
      // Retain the request ID after an ambiguous failure to prevent duplicates.
    } finally {
      this.busy = false;
      if (!this.disposed) { this.render(); if (!this.input.disabled) this.input.focus(); }
    }
  };
  stop(): void {
    this.disposed = true; this.saveDraft(); this.abort.abort();
    document.removeEventListener('presentationchange',this.presentationChanged);this.form.removeEventListener('submit', this.submit); this.input.removeEventListener('input', this.edit);this.input.removeEventListener('compositionstart',this.compositionStart);this.input.removeEventListener('compositionend',this.compositionEnd);
    this.input.removeEventListener('keydown', this.key); this.input.removeEventListener('click', this.closeCompletion); this.input.removeEventListener('blur', this.closeCompletion); this.suggestions.removeEventListener('mousedown', this.pickCompletion); this.channel.removeEventListener('change', this.changeChannel);
    this.cancelReply.removeEventListener('click', this.clearReply);
  }
}
