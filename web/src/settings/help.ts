import type { SettingDef } from './registry';
const HELP: Record<string, string> = {
  'display.colour':
    'Choose the interface accent palette. This affects controls and highlights, separately from Twitch username colors.',
  'display.variant': 'Choose how much contrast and decoration the interface uses.',
  'display.shade': 'Choose the background shade. The system light/dark option can change it automatically.',
  'display.autoShade':
    'Follow your operating system’s light or dark appearance instead of keeping a fixed background shade.',
  'display.font': 'Choose the font used for chat messages. Chat size and line spacing are separate controls.',
  'display.weight': 'Choose the weight of chat text. Higher values make the letters heavier.',
  'display.shadow': 'Add a shadow behind chat text to improve separation from the background.',
  'display.lines': 'Choose the style of separators between chat messages.',
  'display.zebra': 'Alternate the background of chat rows to help distinguish messages.',
  'display.times': 'Choose how much detail to include in message timestamps, or hide them.',
  'display.rev': 'Place the newest messages at the top of chat and follow that edge when live.',
  'display.cmodes': 'Show channel restrictions such as subscriber-only or slow mode above chat.',
  'display.pause':
    'Keep your reading position while the pointer is over chat. Scrolling still moves through messages; leaving chat resumes following if you were already at the live edge.',
  'display.peek': 'Choose how much automatic link preview content may load. Usercard hover is controlled separately.',
  'display.split':
    'Choose the chat column arrangement. Some layouts also open video, emotes or statistics in the side rail.',
  'display.scrollback':
    'Limit how many chat messages are retained in memory. A larger value lets you scroll farther back and uses more memory.',
  'display.size': 'Set the chat text size in pixels. Interface scale changes the surrounding controls separately.',
  'display.lh': 'Set the spacing between lines relative to the chat font size.',
  'display.spacing': 'Adjust the spacing between letters in chat text.',
  'display.sub': 'Choose where subscriber month counts appear beside badges, or hide the counts.',
  'display.stitle':
    'Show the stream title, category, viewers and elapsed time above chat. Each part can also be switched off separately.',
  'display.bauto': 'Choose whether the top bar stays visible or recedes until hovered or focused.',
  'display.hfs': 'Override the header text size. Zero uses the normal interface font size.',
  'display.hpfs': 'Adjust the text size used in panel headers.',
  'display.gifsafe':
    'Limit GIF lookup results to the provider’s PG-13 filter. This does not filter arbitrary links posted in chat.',
  'presentation.messageActions':
    'Show Thread, Reply, Link and Bookmark below each message as compact icons or text labels.',
  'presentation.hideReplyUsername':
    'Hide a leading recipient name in displayed reply messages. The stored message and reply relationship are unchanged.',
  'presentation.stripReplyMention':
    'Remove a leading recipient mention from the reply text you send. Twitch still receives the reply target.',
  'presentation.usercardHover':
    'Open a profile preview with recent messages retained in the current channel after hovering over a username. It stays open while the pointer is inside the card and closes after a short grace period. Off keeps usernames quiet; click or use the usercard context menu instead.',
  'presentation.autoCloseUserPopup': 'Close the usercard after you stage a reply in the composer.',
  'presentation.autoCloseThreadPopup': 'Close the thread panel when focus moves elsewhere.',
  'presentation.tooltipDelay':
    'Wait this many milliseconds before showing a control tooltip. Keyboard focus shows help immediately.',
  'presentation.uiScale':
    'Scale the whole interface, including controls and panels. Chat font size can be adjusted independently.',
  'presentation.usernameMode': 'Choose the account login name, localized display name, or both.',
  'presentation.scrollMultiplier':
    'Multiply wheel and trackpad movement. One uses the browser’s native scrolling; higher values move farther for the same gesture.',
  'presentation.smoothScroll':
    'Smooth custom-speed wheel movement without restarting an animation for every event. Normal speed uses the operating system’s scrolling.',
  'presentation.smoothNew':
    'Animate short moves to new chat messages while following live. Turning it off keeps new-message scrolling immediate.',
  'presentation.pauseHoverSeconds':
    'Delay hover pause by this many seconds. Zero uses the pane’s existing pause-on-hover setting.',
  'presentation.pauseModifier':
    'Temporarily hold the selected modifier key to pause following chat. Release the key to resume.',
  'presentation.rightClick':
    'Choose what right-clicking a username does. Usercard menu offers an explicit profile action without hover popups.',
  'presentation.modifiedRightClick': 'Choose the username action while holding the configured right-click modifier.',
  'presentation.paneScrollback':
    'Limit the visible scrollback of each chat pane, within the messages retained by the app.',
  'presentation.collapseLines':
    'Clamp long messages to this many lines with an Expand action. Zero shows the full message.',
  'presentation.loadHistory':
    'Request recent public messages when joining a channel. Availability depends on the history provider.',
  'presentation.historyLimit': 'Maximum recent messages requested per channel when history loading is enabled.',
  'links.enabled':
    'Permit automatic metadata requests for link previews. Turning it off keeps links usable without fetching their cards automatically.',
  'links.tooltip':
    'Show a link card after hovering or focusing a link. Clicking the preview control can still open a card explicitly.',
  'links.thumbnails': 'Allow preview cards to load remote images and site icons.',
  'links.emoteTooltip': 'Show a larger image and provider details when hovering over an emote or badge.',
  'links.doubleClick': 'Require a second click before opening a chat link. Keyboard Enter still opens it normally.',
};
export function settingHelp(def: SettingDef): string {
  if (def.hint) return def.hint;
  const explanation = HELP[def.id];
  if (explanation) return explanation;
  const value = def.defaultValue();
  const fallback =
    def.control.kind === 'choice'
      ? (def.control.options.find((option) => option.value === value)?.label ?? String(value))
      : typeof value === 'boolean'
        ? value
          ? 'On'
          : 'Off'
        : value === ''
          ? 'Empty'
          : String(value);
  const range =
    def.control.kind === 'number'
      ? ` Range: ${def.control.min}–${def.control.max}${def.control.unit ? ' ' + def.control.unit : ''}.`
      : '';
  return `${def.label}. Default: ${fallback}.${range}`;
}
