// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { inlineImageSource, appendLinks, cleanURL, readableColor } from './links';
it('removes tracking while preserving content and rejects non-http and credentials', () => {
  expect(cleanURL('https://example.com/post?a=1&utm_source=x&fbclid=2#part')).toBe('https://example.com/post?a=1#part');
  expect(cleanURL('javascript:alert(1)')).toBeUndefined(); expect(cleanURL('https://user:pass@example.com')).toBeUndefined();
});
it('keeps punctuation and markup as text and protects external tabs', () => {
  const node = document.createElement('span'); appendLinks(node, '<b> See (https://example.com/wiki_(a)). https://example.com/a?utm_medium=x!');
  expect(node.querySelector('b')).toBeNull(); expect(node.querySelectorAll('a')).toHaveLength(2);
  expect(node.querySelector('a')?.href).toBe('https://example.com/wiki_(a)');
  expect(node.querySelector('a')?.rel).toBe('noopener noreferrer'); expect(node.textContent).toContain(')).');
});
it('adjusts black and white nicknames for their theme without accepting CSS values', () => {
  expect(readableColor('#000000', false)).not.toBe('#000000'); expect(readableColor('#ffffff', true)).not.toBe('#ffffff');
  expect(readableColor('url(x)', false)).toBe('#9bbfff'); expect(readableColor('#00ff00', false)).toBe('#00ff00');
});
it('renders mentions safely without treating URL at-signs as usernames',()=>{
 const root=document.createElement('span');appendLinks(root,'@Alice hi https://example.com/@Other and user@example.com @hasanabi');
 expect(root.querySelectorAll('a.mention')).toHaveLength(2);expect(root.querySelector<HTMLAnchorElement>('[data-mention=alice]')?.href).toBe('https://www.twitch.tv/alice');expect(root.querySelector('.rainbow')?.textContent).toBe('@hasanabi');
 document.documentElement.dataset.clean='true';root.replaceChildren();appendLinks(root,'https://www.example.com/index.html');expect(root.querySelector('a.chat-link')?.textContent).toBe('example.com');delete document.documentElement.dataset.clean;
});
it('links original bare domains without linking email addresses or changing case-sensitive IDs',async()=>{const {findLinks,linkFingerprint}=await import('./links');const value='email me@subcult.tv then (youtu.be/aBcDeFgHiJk). www.subcult.tv/help?utm_source=test!';expect(findLinks(value).map(link=>link.href)).toEqual(['https://youtu.be/aBcDeFgHiJk','https://www.subcult.tv/help']);expect(linkFingerprint('https://www.example.com/a?utm_source=x')).toBe(linkFingerprint('http://example.com/a'));expect(linkFingerprint('youtu.be/aBcDeFgHiJk')).not.toBe(linkFingerprint('youtu.be/abcdefghijk'));});

it('recognizes public HTTPS image and Giphy paths without mistaking page anchors for images',()=>{
 expect(inlineImageSource('https://example.com/picture.PNG?size=2#part')).toBe('https://example.com/picture.PNG?size=2');
 expect(inlineImageSource('https://i.imgur.com/abc.gifv')).toBe('https://i.imgur.com/abc.gif');
 expect(inlineImageSource('https://giphy.com/gifs/cat-funny-abc123')).toBe('https://media.giphy.com/media/abc123/giphy.gif');
 for(const url of ['https://example.com/wiki#/media/file.png','https://giphy.com.evil.test/gifs/cat-abc','http://example.com/a.gif','https://localhost/a.png','https://192.168.1.1/a.gif','https://user:pass@example.com/a.png'])expect(inlineImageSource(url)).toBeUndefined();
});
it('renders a bounded lazy inline image while retaining the readable URL',()=>{
 const root=document.createElement('span');appendLinks(root,'https://example.com/pic.png');
 expect(root.querySelector<HTMLImageElement>('.chat-image')?.loading).toBe('lazy');expect(root.querySelector<HTMLImageElement>('.chat-image')?.referrerPolicy).toBe('no-referrer');expect(root.querySelector('.chat-link')?.textContent).toContain('example.com/pic.png');
 root.querySelector('.chat-image')?.dispatchEvent(new Event('error'));expect(root.querySelector('.chat-image-link')).toBeNull();expect(root.querySelector('.chat-link')).not.toBeNull();
});
