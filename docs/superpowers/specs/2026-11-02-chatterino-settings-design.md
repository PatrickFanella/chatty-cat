# Chatterino-style Settings window

Date: 2026-11-02. Status: design approved in conversation; spec awaiting owner review.

## Goal

Replace the fifteen or so separate settings panels with one Settings window modelled on
Chatterino 2.5.6: a searchable sidebar of pages, each page a list of headed sections with
compact label-and-control rows. Settings should be easy to find, consistent to edit and
out of the way of chat.

Owner decisions (2026-11-02):

- Regroup settings into Chatterino-style pages, splitting today's Display and
  Presentation panels where needed (not a sidebar of today's panels).
- The window is modal, not a workbench panel.
- Build approach A: a settings registry rendered by one window.

## Out of scope

- Tools that are not settings stay workbench panels in the cat menu: IRC conversations,
  Moderation workspace, Archive, Stats, Video, Whispers, Threads, Bookmarks, Inbox, User
  notes, Channels, Compare activity, Export logs, Provider activity, Upload image, VOD
  context, Public message context, Workspaces.
- No change to storage keys, parse functions, `settings-bundle` workspace parts, share-URL
  parameters or the Chatterino import format.
- No new settings. Chatterino settings the app lacks stay tracked in
  `docs/chatterino-coverage.csv`.

## Components

### Registry — `web/src/settings/registry.ts`

```ts
type PageId =
  | 'general' | 'accounts' | 'commands' | 'highlights' | 'ignores' | 'hotkeys'
  | 'moderation' | 'notifications' | 'integrations' | 'privacy' | 'about';

type Control =
  | { kind: 'toggle' }
  | { kind: 'choice'; options: { value: string | number; label: string }[] }
  | { kind: 'number'; min: number; max: number; step: number; unit?: string }
  | { kind: 'text'; placeholder?: string; maxLength?: number }
  | { kind: 'color' };

interface SettingDef {
  id: string;              // '<source>.<key>', e.g. 'display.size'
  page: PageId;
  section: string;         // must exist in that page's section order
  label: string;
  hint?: string;
  keywords?: string;
  control: Control;
  read(): unknown;
  write(value: unknown): void;   // through the owning store's parse/set
  defaultValue(): unknown;
  visible?(): boolean;           // overlay-only, signed-in-only, privacy
}

interface CustomSection {
  id: string;
  page: PageId;
  section: string;
  keywords: string;              // searched; a match lists the section as a result
  mount(host: HTMLElement): Promise<() => void>;   // lazy import; returns dispose
  visible?(): boolean;
}
```

`PAGES` fixes each page's title and section order. The registry rejects duplicate ids
and sections that are not in the page's order. Sources call `onChange` after a write so
open rows can refresh their values.

### Sources — `web/src/settings/sources/*.ts`

One file per store, each exporting its `SettingDef[]`:

| Source | Store API wrapped |
| --- | --- |
| `display.ts` | `DisplayRuntime.options` / `setOptions` |
| `presentation.ts` | `getPresentation` / `setPresentation` |
| `links.ts` | `getLinkPreferences` / `setLinkPreferences` |
| `completion.ts` | `getCompletionPreferences` / `setCompletionPreferences` |
| `providers.ts` | `getProviderPreferences` / `setProviderPreferences` |
| `notifications.ts` | display `notify` plus `Attention.permission` and `Attention.test` |

Writes always go through the store's parse function. Labels use the display option label
map in `display-option-labels.ts` where it exists.

### Window — `web/src/settings/window.ts`, `settings.css`

- Modal `<dialog id="settings-window">`, about 900×640, a full-screen sheet below 700px.
- Sidebar: search box, then the page list. Content: page title, then sections, each with
  a heading, rows (label and hint on the left, control on the right) and a "Reset
  section" link.
- Search matches labels, hints, keywords, section titles and custom-section keywords
  across every page. Results are grouped by page and editable in place. Clearing the
  search returns to the selected page.
- Opening: a "Settings…" item in the cat menu, Ctrl+, (Command+, on macOS), and palette
  entries for every page and every setting. A setting entry opens its page and focuses
  its row.
- Changes apply and save immediately. Escape closes the window.
- The module loads lazily on first open, like other panels.

## Page map

Stored keys in parentheses; sections in this order.

- **General**
  - Appearance: preset, colour, variant, shade, auto shade, interface scale; custom
    theme editor (custom section).
  - Font: font, size, line height, weight, letter spacing, text shadow.
  - Messages: separators (`lines`), zebra, timestamps (`times`), username style, bold
    usernames, colour usernames, colour mentions, subscriber months (`sub`), reverse
    order (`rev`), collapse long messages, deleted-message limit, fade history,
    last-message line (with pattern and colour), show joins, show parts, pronouns,
    channel modes (`cmodes`), stream title row (`stitle`).
  - Emotes: emote-only size (`eonly`), animate only while focused, provider image and
    animation options, emote scale, zero-width emotes, remove spaces between emotes,
    tooltip scale, unlisted 7TV emotes.
  - Links and cards: previews (`peek`), YouTube (`yt`), GIF safety (`gifsafe`), link
    icons (`lkico`), link weight (`lw`), links (`links`, `pn`, `clean`), link tooltip,
    thumbnails and sizes, double-click, unshorten, lowercase domains, emote tooltip,
    selection search and engine.
  - Scrolling: scrollback, rows per pane, scroll speed, smooth scrolling, smooth new
    messages, pause (`pause`), pause after hover, pause modifier, scrollbar markers, hide
    scrollbar.
  - Composer: autohide (`bauto`), composer on top (`bartop`), send button, character
    count, slow-mode countdown, full empty input, overlong-message behaviour, pulse on own
    message.
  - Layout: columns and rail (`split`), header viewers, title, uptime and category, help
    font size (`hpfs`), header font size (`hfs`), labels (`lbls`).
  - Motion: nick shimmer (`anim`), rainbow mode (`rbw`).
  - Overlay (visible in overlay mode only): background opacity, shadow and its colour,
    opacity, offsets and radius.
- **Accounts**: accounts (custom section, `account-profiles-ui`); hide account controls
  (`presentation.hideAccount`); own message feedback (custom section, `user-holds`).
- **Commands**: custom commands (custom section, `commands-ui`); Completion section with
  every completion preference, including nicknames and emote priority.
- **Highlights**: keywords (`keywords`), highlight own messages (`self`), ping sound
  (`ping`); message rules (custom section, `rules-ui`: highlight and hide rules,
  similarity filtering and quiet hours).
- **Ignores**: blocked words (`blocked`), hidden users (`hidden`), hide mode
  (`hideMode`), hide bots (`nbots`), hide moderated messages, hide timeout and ban
  notices, hide deletion notices, hide reply context, reply buttons, strip reply mention.
  A row links to Highlights › Message rules for rule-based hiding.
- **Hotkeys**: shortcuts (custom section, `shortcuts-ui`); username right-click,
  modified right-click and its modifier.
- **Moderation**: a built-in section explaining that moderation presets are edited in
  the Moderation workspace, with an "Open moderation workspace" button. The presets
  editor stages actions into that workspace, so it stays there.
- **Notifications**: desktop alerts (`notify`, which requests permission when turned
  on); a built-in section with the alert test button and its status; muted channels.
- **Integrations**: Providers and badges section (provider enablement, live updates,
  badge categories, cosmetics, FFZ artwork, bits stacking), with a built-in row for
  "Reload provider metadata" and the live-update and cosmetics status; custom sections for web
  extensions, browser companion, desktop playback, device sync and Chatterino import.
- **Privacy**: visible workspaces while privacy mode is on (custom section,
  `privacy-settings`). Privacy mode itself and panic stay on their existing toggle and
  Alt+Shift+P.
- **About**: version, source code link (AGPL-3.0), local command help,
  resource readout.

Every key of each source store is either placed above or listed under "Exclusions".

### Duplicates collapse to one control

| Concept | Control writes | Presentation copy set to |
| --- | --- | --- |
| Timestamps | display `times` | `showTimestamps` true, `timestampFormat` `legacy` |
| Separators | display `lines` | `separators` `legacy` |
| Alternating rows | display `zebra` | `alternating` `legacy` |
| Mention `@` / comma | completion `mentionAt` / `mentionComma` | presentation copies mirror completion |

### Exclusions (stored and parsed, not shown)

- `presentation.hideSettings` and display `min`: no effect in the current shell.
- Version fields and nested structures edited only by a custom section.

## Compatibility

- Panel UIs deleted (their settings come from sources): `display-panel`,
  `presentation-panel`, `link-preferences-panel`, `completion-preferences-panel`,
  `provider-preferences-panel`.
- Panels kept as modules but embedded as custom sections and removed from the menu:
  `privacy-settings`, `shortcut-settings`, `custom-theme-panel`, `account-profiles`,
  `user-hold-panel`, `commands-panel`, `rules-panel`, `extensions-panel`,
  `browser-companion-panel`, `desktop-playback-panel`, `device-sync-panel`,
  `chatterino-import-panel`, `local-command-help`, `resource-readout`.
- Their `panel:<id>` commands, saved workbench layouts that reference them, help-tab URL
  actions (`display-open`, `stats-open` mapping) and hotkey actions open the Settings
  window at the matching page or section instead. Saved layouts drop the removed ids
  without error.
- Panels with runtime behaviour beyond settings keep that behaviour in their modules;
  only the UI moves.

## Error handling

- A write the store's parser clamps or rejects re-renders the stored value with a
  one-line message beside the row.
- A custom section whose import or mount fails shows "Couldn't load · Retry" in place;
  the rest of the page keeps working.
- Privacy mode hides the same sections it hides today from both pages and search.
- When storage is unavailable the window opens with defaults and a notice that changes
  will not persist.

## Rollout

Three slices on the current branch. Each passes the build, bundle budgets, overlay check
and full test suite, and gets desktop and phone screenshots, before the next starts.

1. Registry, renderer, search, section reset, window, opening paths and the seven
   sources. Old panels remain registered for comparison.
2. Custom sections mounted in their pages.
3. Old panels unregistered, redirects added, `docs/design-system.md` and
   `docs/chatterino-coverage.md` updated.

## Testing

- Registry: unique ids; every setting on a declared page and section; `read` after
  `write` returns the parsed value.
- Coverage per source: every store key is placed or listed in Exclusions, so a new store
  field cannot be silently missing.
- Renderer (happy-dom): each control kind; search across pages; section reset; deep link
  focuses the row; privacy hiding; custom-section failure and retry.
- Migration: duplicate concepts write one source of truth; removed panel ids and saved
  layouts redirect or drop cleanly.
- Existing store and runtime tests stay. UI tests for removed panels move to source or
  renderer tests.
- Record entry and lazy-chunk bundle sizes against `scripts/bundle-budgets.json`.
