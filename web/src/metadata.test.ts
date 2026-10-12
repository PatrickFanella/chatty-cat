import { describe, expect, it } from 'vitest';
import { parseMetadata } from './metadata';

const valid = { emoteUse:{Wave:42}, channel: 'room', errors: ['FFZ channel'], stream: { uptime: '2 hours', viewers: '1000', title: 'Hello' },
  emotes: { Wave: { code: 'Wave', url: 'https://cdn.example/wave', staticUrl: '', source: '7TV', animated: true, zeroWidth: false } },
  badges: { subscriber: { '1': { url: 'https://cdn.example/badge', title: 'Subscriber', description: 'One month' } } },
};
describe('metadata wire boundary', () => {
  it('retains normalized data and partial-provider failures', () => expect(parseMetadata(valid)).toEqual(valid));
  it.each([null, [], {}, { ...valid, channel: '../room' }, { ...valid, stream: { title: 1 } }, { ...valid, errors: [42] }])('rejects malformed responses', (value) => expect(parseMetadata(value)).toBeNull());
  it.each(['javascript:alert(1)', 'http://cdn.example/image', 'https://user:password@cdn.example/image'])('rejects unsafe image %s', (url) => {
    expect(parseMetadata({ ...valid, emotes: { Wave: { ...valid.emotes.Wave, url } } })).toBeNull();
    expect(parseMetadata({ ...valid, badges: { subscriber: { '1': { ...valid.badges.subscriber['1'], url } } } })).toBeNull();
  });
  it('keeps dictionaries free of inherited emote keys', () => {
    const metadata = parseMetadata(valid);
    expect(metadata).not.toBeNull();
    expect(Object.getPrototypeOf(metadata?.emotes)).toBeNull();
    expect(metadata?.emotes.constructor).toBeUndefined();
  });
  it('rejects an emote with a mismatched code', () => expect(parseMetadata({ ...valid, emotes: { Wave: { ...valid.emotes.Wave, code: 'Other' } } })).toBeNull());
});

it('validates optional lifetime usage seeds separately from stream/emote data',()=>{expect(parseMetadata({...valid,emoteUse:undefined})?.emoteUse).toEqual({});for(const count of [-1,Infinity,1.5,'12'])expect(parseMetadata({...valid,emoteUse:{Wave:count}})).toBeNull();});
it('validates public VOD timing and Twitch-only destinations',()=>{const lastVod={start:'2026-10-10T12:00:00Z',end:'2026-10-10T13:00:00Z',url:'https://www.twitch.tv/videos/12345',title:'Latest archive'};expect(parseMetadata({...valid,lastVod})?.lastVod).toEqual(lastVod);for(const bad of [{...lastVod,end:lastVod.start},{...lastVod,url:'https://evil.test/videos/12345'},{...lastVod,start:'not a date'}])expect(parseMetadata({...valid,lastVod:bad})).toBeNull();});

it('validates optional category metadata while accepting older servers',()=>{expect(parseMetadata({...valid,stream:{...valid.stream,game:'Music'}})?.stream.game).toBe('Music');expect(parseMetadata({...valid,stream:{...valid.stream,game:42}})).toBeNull();expect(parseMetadata(valid)?.stream.game).toBeUndefined();});
