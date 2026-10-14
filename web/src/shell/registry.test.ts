// @vitest-environment happy-dom
import {describe,expect,it} from 'vitest';
import {CommandRegistry,groupFor,labelFor} from './registry';
import {scoreMatch} from './palette';
import {prettyBinding} from './index';
function button(html:string):HTMLButtonElement {const host=document.createElement('div');host.innerHTML=html;return host.querySelector('button')!;}
describe('command registry',()=>{
 it('derives labels and groups from header buttons',()=>{
  expect(labelFor(button('<button id="display-open" data-short="⚙">Settings</button>'))).toBe('Settings');
  expect(labelFor(button('<button aria-label="Toggle light theme">◐</button>'))).toBe('Toggle light theme');
  expect(labelFor(button('<button id="header-min" data-short="↕">Header ↕</button>'))).toBe('Header');
  expect(groupFor(button('<button id="display-open">Settings</button>'))).toBe('view');
  expect(groupFor(button('<button>Provider activity</button>'))).toBe('providers');
  expect(groupFor(button('<button>Device sync</button>'))).toBe('tools');
  expect(groupFor(button('<button>Moderation</button>'))).toBe('moderation');
 });
 it('mirrors header buttons as commands and drops them when removed',async()=>{
  const header=document.createElement('header');header.innerHTML='<button id="stats-open">Stats</button><form><button>Join</button></form><button id="header-min">Header</button>';document.body.append(header);
  const registry=new CommandRegistry();registry.watch(header,new Set(['header-min']));
  expect(registry.all().map(command=>command.id)).toEqual(['header:stats-open']);
  expect(registry.get('header:stats-open')?.panel).toBe('stats-panel');
  let clicked=0;header.querySelector('#stats-open')!.addEventListener('click',()=>clicked++);registry.get('header:stats-open')!.run();expect(clicked).toBe(1);
  const late=document.createElement('button');late.textContent='Bookmarks';header.append(late);await new Promise(resolve=>setTimeout(resolve,0));
  expect(registry.get('header:bookmarks')?.group).toBe('chat');
  late.remove();await new Promise(resolve=>setTimeout(resolve,0));expect(registry.get('header:bookmarks')).toBeUndefined();
  registry.stop();header.remove();
 });
 it('scores palette matches by prefix, substring and subsequence',()=>{
  expect(scoreMatch('','anything')).toBe(1);
  expect(scoreMatch('prov','Provider activity')).toBe(3);
  expect(scoreMatch('activity','Provider activity')).toBe(2);
  expect(scoreMatch('prvact','Provider activity')).toBe(1);
  expect(scoreMatch('zzz','Provider activity')).toBe(0);
 });
 it('prints bindings for humans',()=>{
  expect(prettyBinding('Alt+Shift+KeyH')).toBe('Alt+Shift+H');expect(prettyBinding('Alt+BracketRight')).toBe('Alt+]');expect(prettyBinding('F5')).toBe('F5');expect(prettyBinding('')).toBe('');
 });
});
