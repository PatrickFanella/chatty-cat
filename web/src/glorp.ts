import type { ChatMessage } from './protocol';
export function isGlorp(message: Pick<ChatMessage, 'text' | 'login'>): boolean {
  return (
    /\b(?:glorp|florp)\b/i.test(message.text) ||
    /^f$/i.test(message.text.trim()) ||
    (message.login.toLowerCase() === 'fossabot' && /trigger is pulled.*bullet fired/i.test(message.text))
  );
}
