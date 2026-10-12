// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { channelURL, ChannelControls } from './channels';
it('focuses, adds and removes rooms while preserving settings and clearing message context', () => {
  const current = new URL('https://chat.subcult.tv/?channel=one,two&colour=mint&mid=old&epopen=1');
  const focused = channelURL(current, ['one', 'two'], { kind: 'focus', channel: 'two' });
  expect(focused.searchParams.get('channel')).toBe('two,one'); expect(focused.searchParams.get('colour')).toBe('mint'); expect(focused.searchParams.has('mid')).toBe(false);
  expect(channelURL(current, ['one', 'two'], { kind: 'remove', channel: 'one' }).searchParams.get('channel')).toBe('two');
  expect(channelURL(current, ['one', 'two'], { kind: 'add', channel: 'three' }).searchParams.get('channel')).toBe('one,two,three');
  expect(() => channelURL(current, ['one'], { kind: 'remove', channel: 'one' })).toThrow();
  expect(() => channelURL(current, ['a', 'b', 'c', 'd', 'e', 'f'], { kind: 'add', channel: 'g' })).toThrow();
});
it('uses send chips without changing focus or bypassing a disabled destination', () => {
  const root = document.createElement('div'), form = document.createElement('form');
  form.innerHTML = '<select><option value="one">one</option><option value="two">two</option></select>';
  const select = form.querySelector('select')!; const controls = new ChannelControls(root, form, select, ['one', 'two']);
  form.querySelector<HTMLButtonElement>('[data-send-channel="two"]')!.click(); expect(select.value).toBe('two');
  expect(form.querySelector('[aria-pressed="true"]')?.textContent).toBe('#two');
  select.disabled = true; form.dispatchEvent(new Event('channelstatechange'));
  expect(form.querySelector<HTMLButtonElement>('[data-send-channel="one"]')!.disabled).toBe(true);
  controls.stop();
});
it('adds a seventh channel under the configured workspace cap and lets channel edits override saved URLs',()=>{
 const current=new URL('https://chat.subcult.tv/?workspace=saved&channel=a,b,c,d,e,f');const next=channelURL(current,['a','b','c','d','e','f'],{kind:'add',channel:'g'},12);expect(next.searchParams.get('channel')).toBe('a,b,c,d,e,f,g');expect(next.searchParams.has('workspace')).toBe(false);expect(()=>channelURL(next,['a','b','c','d','e','f','g'],{kind:'add',channel:'h'},7)).toThrow();
});
it('blocks channel navigation during a pending send',()=>{
 const root=document.createElement('div'),form=document.createElement('form'),select=document.createElement('select');select.innerHTML='<option value=one>one</option><option value=two>two</option>';form.append(select);const controls=new ChannelControls(root,form,select,['one','two'],12);select.disabled=true;const event=new MouseEvent('click',{bubbles:true,cancelable:true});root.querySelector('a')!.dispatchEvent(event);expect(event.defaultPrevented).toBe(true);expect(root.textContent).toContain('Wait for the current send');controls.stop();
});
