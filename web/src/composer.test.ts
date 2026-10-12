// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Composer, parseSendResult, validateMessage } from './composer';
import type { ChatMessage } from './protocol';

const signedIn = { enabled: true, authenticated: true, loginURL: 'https://chat.subcult.tv/api/auth/login', login: 'viewer', userID: '42', csrf: 'csrf' };
const reply: ChatMessage = { id: 'parent-id', channel: 'other', command: 'PRIVMSG', login: 'someone', text: '<b>hi</b>', timestamp: 1000, tags: {} };
let stops: Composer[] = [];
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { for (const composer of stops) composer.stop(); stops = []; vi.unstubAllGlobals(); vi.useRealTimers(); });
function setup() {
  const form = document.createElement('form');
  form.innerHTML = '<select id="send-channel"></select><textarea id="message"></textarea><div id="completions" hidden></div><button id="send"></button><span id="message-length"></span><span id="send-status"></span><div id="reply-target"><span id="reply-label"></span><button type="button" id="cancel-reply"></button></div>';
  const composer = new Composer(form, ['hasanabi', 'other']); stops.push(composer);
  const input = form.querySelector<HTMLTextAreaElement>('#message')!;
  const channel = form.querySelector<HTMLSelectElement>('#send-channel')!;
  const button = form.querySelector<HTMLButtonElement>('#send')!;
  const status = form.querySelector('#send-status')!;
  const edit = (text: string) => { input.value = text; input.dispatchEvent(new Event('input')); };
  const submit = () => form.dispatchEvent(new SubmitEvent('submit', { cancelable: true }));
  return { composer, form, input, channel, button, status, edit, submit };
}
describe('message validation', () => {
  it('counts Unicode codepoints', () => { expect(validateMessage('😀'.repeat(500))).toBeUndefined(); expect(validateMessage('😀'.repeat(501))).toBeDefined(); });
  it.each(['', ' ', 'hi\nthere', '\x01ACTION hi\x01', ' /unsupported user'])('rejects unsafe or unsupported input %j', (text) => expect(validateMessage(text)).toBeDefined());
  it('validates send acknowledgements', () => {
    expect(parseSendResult({ sent: true, messageID: 'id', access_token: 'ignored' })).toEqual({ sent: true, messageID: 'id' });
    expect(parseSendResult({ sent: false, error: 'dropped', uncertain: true })).toEqual({ sent: false, error: 'dropped', uncertain: true });
    for (const value of [null, {}, { sent: true }, { sent: false }, { sent: 'yes' }, { sent: false, error: 'x', uncertain: 'yes' }]) expect(() => parseSendResult(value)).toThrow();
  });
});
it('keeps sending disabled until authenticated', () => {
  const { composer, input, button, edit } = setup();
  expect(input.disabled).toBe(true);
  composer.setAuth(signedIn); expect(input.disabled).toBe(false); expect(button.disabled).toBe(true);
  edit('hi'); expect(button.disabled).toBe(false);
  composer.setAuth(undefined); expect(button.disabled).toBe(true);
});
it('sends CSRF and target, clears accepted text and saves input history', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ sent: true, messageID: 'sent-id' }) }); vi.stubGlobal('fetch', fetcher);
  const { composer, input, status, edit, submit } = setup(); composer.setAuth(signedIn); edit('hello 😀'); submit();
  await vi.advanceTimersByTimeAsync(0);
  expect(input.value).toBe(''); expect(status.textContent).toBe('Sent');
  const options = fetcher.mock.calls[0]?.[1] as RequestInit;
  expect(options.headers).toEqual({ 'Content-Type': 'application/json', 'X-CSRF-Token': 'csrf' });
  expect(JSON.parse(String(options.body))).toMatchObject({ channel: 'hasanabi', message: 'hello 😀', requestID: expect.any(String) });
  expect(JSON.parse(String(options.body))).not.toHaveProperty('sender_id');
  edit('draft'); input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', cancelable: true })); expect(input.value).toBe('hello 😀');
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true })); expect(input.value).toBe('draft');
});
it('keeps channel drafts separate and binds replies to their channel', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ sent: true, messageID: 'id' }) }); vi.stubGlobal('fetch', fetcher);
  const { composer, form, input, channel, edit, submit } = setup(); composer.setAuth(signedIn); edit('first draft');
  composer.selectReply(reply); expect(channel.value).toBe('other');
  expect(form.querySelector('#reply-label')?.textContent).toContain('<b>hi</b>'); expect(form.querySelector('#reply-label b')).toBeNull();
  edit('reply text'); submit(); await vi.advanceTimersByTimeAsync(0);
  expect(JSON.parse(String(fetcher.mock.calls[0]?.[1].body))).toMatchObject({ channel: 'other', replyID: 'parent-id' });
  channel.value = 'hasanabi'; channel.dispatchEvent(new Event('change')); expect(input.value).toBe('first draft');
  expect((form.querySelector('#reply-target') as HTMLElement).hidden).toBe(true);
});
it('preserves rejected text and permits a new request after a definite rejection', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({ sent: false, error: 'Twitch blocked this message' }) }); vi.stubGlobal('fetch', fetcher);
  const { composer, input, status, edit, submit } = setup(); composer.setAuth(signedIn); edit('hello');
  submit(); await vi.advanceTimersByTimeAsync(0); submit(); await vi.advanceTimersByTimeAsync(0);
  expect(input.value).toBe('hello'); expect(status.textContent).toContain('blocked');
  expect(JSON.parse(String(fetcher.mock.calls[0]?.[1].body)).requestID).not.toBe(JSON.parse(String(fetcher.mock.calls[1]?.[1].body)).requestID);
});
it('reuses a request identifier when the response is lost and prevents simultaneous posts', async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error('network')); vi.stubGlobal('fetch', fetcher);
  const { composer, input, status, edit, submit } = setup(); composer.setAuth(signedIn); edit('hello');
  submit(); submit(); await vi.advanceTimersByTimeAsync(0);
  expect(fetcher).toHaveBeenCalledTimes(1); expect(input.value).toBe('hello'); expect(status.textContent).toContain('check chat');
  submit(); await vi.advanceTimersByTimeAsync(0);
  expect(JSON.parse(String(fetcher.mock.calls[0]?.[1].body)).requestID).toBe(JSON.parse(String(fetcher.mock.calls[1]?.[1].body)).requestID);
});
it('disables expired sessions without losing the draft', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ sent: false, error: 'Session expired; log in again' }) }));
  const { composer, input, status, edit, submit } = setup(); composer.setAuth(signedIn); edit('draft'); submit(); await vi.advanceTimersByTimeAsync(0);
  expect(input.disabled).toBe(true); expect(input.value).toBe('draft'); expect(status.textContent).toContain('expired');
});
it('lets completion consume Enter before send and cycles with Tab', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  const { composer, form, input, edit } = setup(); composer.setAuth(signedIn); composer.setCandidates(['viewer', 'violet'], ['Kappa']);
  edit('@vi');
  expect((form.querySelector('#completions') as HTMLElement).hidden).toBe(false);
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', cancelable: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
  expect(input.value).toBe('@violet '); expect(fetcher).not.toHaveBeenCalled();
  expect(input.getAttribute('aria-expanded')).toBe('false');
  edit('Kap'); input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', cancelable: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })); expect(input.value).toBe('Kappa ');
});
it('preserves multiline editing and IME Enter, then sends normalized text', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ sent: true, messageID: 'id' }) }); vi.stubGlobal('fetch', fetcher);
  const { composer, input, edit } = setup(); composer.setAuth(signedIn); edit('one\ntwo');
  const shift = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, cancelable: true }); input.dispatchEvent(shift); expect(shift.defaultPrevented).toBe(false);
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, cancelable: true })); expect(fetcher).not.toHaveBeenCalled();
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })); await vi.advanceTimersByTimeAsync(0);
  expect(JSON.parse(String(fetcher.mock.calls[0]?.[1].body)).message).toBe('one two');
});
it('keeps arrow keys inside multiline drafts and cancels replies with Escape', () => {
  localStorage.setItem('chatthing:v1:sent:hasanabi', '["old"]');
  const { composer, input, form, edit } = setup(); composer.setAuth(signedIn); edit('one\ntwo'); input.setSelectionRange(6, 6);
  const arrow = new KeyboardEvent('keydown', { key: 'ArrowUp', cancelable: true }); input.dispatchEvent(arrow); expect(arrow.defaultPrevented).toBe(false); expect(input.value).toBe('one\ntwo');
  composer.selectReply(reply); input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
  expect((form.querySelector('#reply-target') as HTMLElement).hidden).toBe(true);
});
it('inserts picker codes at the selection with spacing and preserves trailing text', () => {
  const { composer, input, edit } = setup(); composer.setAuth(signedIn); edit('hello world'); input.setSelectionRange(6, 11);
  composer.insert('Kappa'); expect(input.value).toBe('hello Kappa '); expect(input.selectionStart).toBe(12);
  edit('hi'); input.setSelectionRange(2, 2); composer.insert('😀'); expect(input.value).toBe('hi 😀 ');
  composer.setAuth(undefined); composer.insert('Kappa'); expect(input.value).toBe('hi 😀 ');
});
it('accepts commands without echoing them into chat and preserves an armed reply',async()=>{
 const fetcher=vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>({sent:true,command:true})});vi.stubGlobal('fetch',fetcher);
 const {composer,input,status,edit,submit,form}=setup();composer.setAuth(signedIn);
 composer.selectReply({id:'parent',command:'PRIVMSG',channel:'hasanabi',login:'alice',text:'hello',timestamp:1,tags:{}});
 edit('/slow 30');submit();await vi.advanceTimersByTimeAsync(0);expect(status.textContent).toBe('Command completed');expect(input.value).toBe('');
 expect(form.querySelector<HTMLElement>('#reply-target')?.hidden).toBe(false);
 expect(JSON.parse((fetcher.mock.calls[0]?.[1] as RequestInit).body as string)).not.toHaveProperty('replyID');
 expect(parseSendResult({sent:true,command:true})).toEqual({sent:true,command:true});expect(()=>parseSendResult({sent:true,command:'yes'})).toThrow();
});
it('permits supported slash commands and rejects unknown commands',()=>{
 for(const command of ['/ban alice','/timeout alice 60','/clear','/color blue','/announcepurple hello','/followers 10'])expect(validateMessage(command)).toBeUndefined();
 expect(validateMessage('/me hello')).toBeUndefined();expect(validateMessage('/raid alice')).toBeUndefined();
});
it('adopts action acknowledgements while retaining an armed reply',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>({sent:true,action:true,messageID:'action-id'})}));
 const{composer,input,status,edit,submit,form}=setup();composer.setAuth(signedIn);composer.selectReply(reply);edit('/me waves');submit();await vi.advanceTimersByTimeAsync(0);
 expect(status.textContent).toBe('Sent');expect(input.value).toBe('');expect(form.querySelector<HTMLElement>('#reply-target')?.hidden).toBe(false);
 expect(parseSendResult({sent:true,action:true,messageID:'action-id'})).toEqual({sent:true,action:true,messageID:'action-id'});
});
it('keeps whisper content out of persistent drafts and sent history and allows it during room cooldown',async()=>{
 const fetcher=vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>({sent:true,command:true,whisper:true,recipient:'alice'})});vi.stubGlobal('fetch',fetcher);
 const {composer,input,status,edit,submit,button}=setup();composer.setAuth(signedIn);composer.setBlock('Slow mode');edit('/w alice private text');
 expect(button.disabled).toBe(false);expect(sessionStorage.getItem('chatthing:v1:draft:hasanabi')).toBe('');submit();await vi.advanceTimersByTimeAsync(0);
 expect(input.value).toBe('');expect(status.textContent).toContain('does not confirm delivery');expect(localStorage.getItem('chatthing:v1:sent:hasanabi')).not.toContain('private text');
 edit('unfinished');composer.prepareWhisper('alice');expect(input.value).toBe('unfinished');edit('');composer.prepareWhisper('alice');expect(input.value).toBe('/w alice ');
 for(const value of [{sent:true,whisper:true,messageID:'id'},{sent:true,command:true,whisper:'yes'},{sent:true,command:true,whisper:true,recipient:'bad!' }])expect(()=>parseSendResult(value)).toThrow();
});

it('reports a raid as a pending request rather than completed delivery',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>({sent:true,command:true})}));
 const {composer,edit,submit,status}=setup();composer.setAuth(signedIn);edit('/raid alice');submit();await vi.advanceTimersByTimeAsync(0);expect(status.textContent).toContain('Raid requested');
});
it('previews a custom invocation without sending or replacing its unsent draft',()=>{
 const ui=setup();ui.composer.setAuth(signedIn);const preview=vi.fn(()=>true);const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 ui.composer.configureCommands(['/greet'],preview);ui.edit('/greet chat');expect(ui.button.disabled).toBe(false);ui.submit();
 expect(preview).toHaveBeenCalledWith('/greet chat');expect(fetcher).not.toHaveBeenCalled();expect(ui.input.value).toBe('/greet chat');
});
