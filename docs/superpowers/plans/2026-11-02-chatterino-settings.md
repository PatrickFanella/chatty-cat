# Chatterino-style Settings Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the separate settings panels with one modal Settings window: a searchable
sidebar of Chatterino-style pages drawn from a settings registry.

**Architecture:** Feature stores stay where they are. Small source modules describe their
settings as `SettingDef` data. One window module renders pages, search and section reset
from the registry. Editor-style panels are embedded as custom sections through a new
`LazyPanels.embed()` that bypasses the workbench.

**Tech Stack:** TypeScript 5.9, Vite 7, Vitest 5 with happy-dom, no UI framework. Prettier
3.9 formatting.

**Spec:** `docs/superpowers/specs/2026-11-02-chatterino-settings-design.md`

## Global Constraints

- Storage keys, parse functions, `settings-bundle` parts, share-URL parameters and the
  Chatterino import format do not change.
- Every write goes through the owning store's parse function; nothing bypasses validation.
- New chrome uses the existing tokens (`--bg`, `--panel`, `--line`, `--fg`, `--muted`,
  `--accent`, `--danger`, `--popline`); no hex values in component rules.
- The window module and its sources load lazily; `index.html` entry budgets in
  `scripts/bundle-budgets.json` must still pass, and every new lazy entry gets a budget.
- Pages, in order: General, Accounts, Commands, Highlights, Ignores, Hotkeys, Moderation,
  Notifications, Integrations, Privacy, About.
- Window: modal `<dialog id="settings-window">`, about 900×640, full-screen sheet below
  700px. Ctrl+, (Command+, on macOS) opens it.
- Run tests with `npx --prefix web vitest run --testTimeout=60000 <paths>` (default 5s
  timeouts fail under load on this machine regardless of changes).
- Commits use the agent identity (`SUBCULT Agent <info@subcult.tv>`), unsigned, ending
  with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Typing into a number or text field (for example "120" toward a max of 100) must not be
   clamped or saved mid-keystroke; values commit on `change` and Enter. Test in Task 2.
2. A saved workbench layout that docks a removed settings panel must not pop the Settings
   window on load; the id is released silently. Test in Task 6.
3. Settings changed elsewhere (another tab, a workspace switch, a preset) while the
   window is open must not show stale values; rows re-read on page show and on
   `registry.notify()`. Test in Task 2.
4. Search text with regex characters (`(`, `*`, `[`) or no matches must not throw; it is a
   plain case-insensitive substring and shows "No settings match". Test in Task 2.
5. Turning privacy mode on while the window is open hides privacy-guarded sections at
   once, in pages and search. Test in Task 2.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `web/src/settings/registry.ts` | Types, `PAGES`, `SettingsRegistry` (add, validate, query, search, notify) |
| `web/src/settings/window.ts` | `SettingsWindow`: dialog, sidebar, pages, rows, controls, search, reset, deep link |
| `web/src/settings/settings.css` | Window styles, imported by `window.ts` |
| `web/src/settings/host.ts` | `SettingsHost` interface: the runtime handles sources need from `main.ts` |
| `web/src/settings/sources/display.ts` | Display options → defs |
| `web/src/settings/sources/presentation.ts` | Presentation options → defs, duplicate collapse |
| `web/src/settings/sources/links.ts` | Link preferences → defs |
| `web/src/settings/sources/completion.ts` | Completion preferences → defs |
| `web/src/settings/sources/providers.ts` | Provider preferences → defs |
| `web/src/settings/sources/builtin.ts` | Built-in custom sections: alert test, moderation link, provider reload/status |
| `web/src/settings/index.ts` | `startSettings(host)`: builds registry from all sources, returns window opener |
| `web/src/shell/panels.ts` | Add `settings` placement, `embed()`, redirect |
| `web/src/shell/index.ts` | Ctrl+, binding, "Settings…" menu command |
| `web/src/main.ts` | Build `SettingsHost`, wire opener into hotkeys, palette and panel registrations |

---

### Task 1: Settings registry

**Files:**
- Create: `web/src/settings/registry.ts`
- Test: `web/src/settings/registry.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type PageId = 'general' | 'accounts' | 'commands' | 'highlights' | 'ignores' | 'hotkeys'
    | 'moderation' | 'notifications' | 'integrations' | 'privacy' | 'about';
  export interface PageDef { id: PageId; title: string; sections: readonly string[] }
  export const PAGES: readonly PageDef[];
  export type Control =
    | { kind: 'toggle' }
    | { kind: 'choice'; options: readonly { value: string | number; label: string }[] }
    | { kind: 'number'; min: number; max: number; step: number; unit?: string }
    | { kind: 'text'; placeholder?: string; maxLength?: number; multiline?: boolean }
    | { kind: 'color' };
  export interface SettingDef {
    id: string; page: PageId; section: string; label: string; hint?: string; keywords?: string;
    control: Control; read(): unknown; write(value: unknown): void; defaultValue(): unknown;
    visible?(): boolean; private?: boolean;   // private: hidden while privacy mode is on
  }
  export interface CustomSection {
    id: string; page: PageId; section: string; keywords: string;
    mount(host: HTMLElement): Promise<() => void>; visible?(): boolean; private?: boolean;
  }
  export type Entry = { type: 'setting'; def: SettingDef } | { type: 'custom'; def: CustomSection };
  export class SettingsRegistry extends EventTarget {
    add(entries: readonly (SettingDef | CustomSection)[]): void;   // throws on duplicate id or unknown page/section
    page(id: PageId): { section: string; entries: Entry[] }[];      // sections in PAGES order, empty ones omitted, hidden entries filtered
    search(text: string): { page: PageId; section: string; entries: Entry[] }[];
    get(id: string): Entry | undefined;
    notify(): void;                                                 // dispatches 'change'
    constructor(privacy: () => boolean);
  }
  ```
- Section order per page (copy exactly):
  - general: Appearance, Font, Messages, Emotes, Links and cards, Scrolling, Composer, Layout, Motion, Overlay
  - accounts: Accounts, Own message feedback
  - commands: Custom commands, Completion
  - highlights: Highlights, Message rules
  - ignores: Ignores
  - hotkeys: Shortcuts, Mouse
  - moderation: Moderation
  - notifications: Desktop alerts, Muted channels
  - integrations: Providers and badges, Web extensions, Browser companion, Desktop playback, Device sync, Chatterino import
  - privacy: Visible workspaces
  - about: About, Local command help, Resource readout

- [ ] **Step 1: Write failing tests** in `registry.test.ts`:
  - `rejects duplicate ids` — adding two defs with id `'a.x'` throws `/duplicate/i`.
  - `rejects unknown sections` — def with page `'general'`, section `'Nope'` throws `/section/i`.
  - `orders sections by PAGES and drops empty ones` — defs in Font then Appearance return `['Appearance','Font']`.
  - `filters hidden and private entries` — `visible: () => false` omitted; `private: true` omitted when constructed with `() => true`.
  - `search matches label, hint, keywords and section case-insensitively as plain text` — query `'TIME'` finds label "Timestamps"; query `'(['` returns `[]` without throwing; query matching section name `'Scrolling'` returns every entry in that section.
  - `search matches custom section keywords` — custom section with keywords `'oauth login'` found by `'login'`.
- [ ] **Step 2: Run** `npx --prefix web vitest run --testTimeout=60000 src/settings/registry.test.ts` — expect FAIL (module missing).
- [ ] **Step 3: Implement `registry.ts`.** Search is `includes()` on lowercased `[label, hint, keywords, section].join(' ')`; never build a RegExp from input.
- [ ] **Step 4: Run** the same command — expect PASS.
- [ ] **Step 5: Commit** `feat(settings): add settings registry`.

### Task 2: Settings window

**Files:**
- Create: `web/src/settings/window.ts`, `web/src/settings/settings.css`
- Test: `web/src/settings/window.test.ts`

**Interfaces:**
- Consumes: Task 1 types.
- Produces:
  ```ts
  export class SettingsWindow {
    readonly root: HTMLDialogElement;            // id 'settings-window', appended to document.body
    constructor(registry: SettingsRegistry, options: { storageAvailable: boolean });
    open(target?: { page?: PageId; setting?: string; section?: string }): void;  // showModal; focuses the row for `setting`
    close(): void;
    stop(): void;                                // disposes mounted custom sections, removes root
  }
  ```

DOM contract (tests rely on it): sidebar `nav.settings-nav` with `input[type=search]` and one
`button[data-page]` per page (`aria-current="page"` on the selected one); content
`section.settings-page` holding `section.settings-section[data-section]` blocks, each with
an `h3`, rows `div.settings-row[data-setting=<id>]`, and a `button.settings-reset` "Reset
section". Each row has a `label` bound to its control, an optional `p.settings-hint` and a
`p.settings-error` (empty unless a write was clamped or threw).

Controls: toggle → checkbox (writes on `change`); choice → `select` (values converted back to
number when the option value is a number); number → `input type=number` with min/max/step;
text → `input` or `textarea` when `multiline`; color → `input type=color`. Number and text
write on `change` (blur or Enter), never on `input`. After a write, re-read: if
`read()` differs from what was entered, show the stored value and "Adjusted to the
allowed value" in `.settings-error`; if `write` throws, show the error message.

Custom sections mount into a `div.settings-custom` on first display of their page; while
pending show "Loading…"; on rejection show "Couldn't load" plus a `button` "Retry" that
re-runs `mount`. Disposers run on `stop()`.

When `storageAvailable` is false, show `p.settings-notice` "Changes won't be saved in this
browser" at the top of the content.

- [ ] **Step 1: Write failing tests** in `window.test.ts` (happy-dom; stub `HTMLDialogElement.prototype.showModal` as setting `open`):
  - `renders the first page with ordered sections and rows`
  - `toggle, choice, number, text and color controls write through def.write` — choice option value `2` writes number `2`.
  - `number input commits on change, not input` — dispatch `input` with "120": no write; dispatch `change`: one write.
  - `shows the stored value and an adjustment note when the store clamps` — def clamps to 100; after change to 120, input shows 100 and `.settings-error` contains "Adjusted".
  - `shows the thrown message when a write fails`
  - `reset section writes each def's defaultValue`
  - `search shows results grouped by page and edits in place; clearing returns to the page`
  - `search with no match shows "No settings match"` and with `'(['` does not throw.
  - `open({ setting }) selects its page and focuses the row control`
  - `re-reads values when registry notifies` — change backing value, `registry.notify()`, input reflects it.
  - `privacy change hides private entries immediately` — flip the privacy function, `registry.notify()`, row gone from page and search.
  - `custom section shows Loading, then content; failure shows Retry which remounts`
  - `storage notice appears when storage is unavailable`
- [ ] **Step 2: Run** `npx --prefix web vitest run --testTimeout=60000 src/settings/window.test.ts` — expect FAIL.
- [ ] **Step 3: Implement `window.ts` and `settings.css`.** CSS: grid of 200px sidebar and
  content; rows `display:grid; grid-template-columns: 1fr minmax(160px, 260px)`; section
  `h3` 11px uppercase `--muted` with a `--line` rule; dialog on `--panel` with
  `--popline` border and 8px corner; below 700px the dialog fills the viewport and the
  sidebar becomes a horizontal scrolling page strip above the content.
- [ ] **Step 4: Run** the same command — expect PASS.
- [ ] **Step 5: Commit** `feat(settings): add settings window`.

### Task 3: Host interface and display source

**Files:**
- Create: `web/src/settings/host.ts`, `web/src/settings/sources/display.ts`
- Test: `web/src/settings/sources/display.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // host.ts
  export interface SettingsHost {
    display: DisplayRuntime;                  // from ../display
    presentation: PresentationRuntime;        // from ../presentation-runtime
    rerender(): void;                         // main's scheduleRender after presentation-affecting changes
    providersChanged(): void;                 // main's provider callback (activity, cosmetics, events, metadata, render)
    reloadProviders(): boolean;               // main's reloadProviderMetadata
    providerStatus(): string;                 // events + cosmetics notices joined with " · "
    attention: { permission(): Promise<unknown>; test(): Promise<string> };
    openPanel(id: string): void;              // lazyPanels.open
    overlay: boolean;
    readonlyView: boolean;                    // pane popout / ephemeral popout / overlay
    privacy(): boolean;                       // privacyEnabled
  }
  // sources/display.ts
  export const DISPLAY_EXCLUDED: readonly (keyof DisplayOptions)[];   // ['min']
  export function displaySettings(host: SettingsHost): SettingDef[];
  ```

Placement (key → page/section; labels from the matching `<label>` text in
`web/src/panel-templates/display-panel.html`, choice labels from `DISPLAY_OPTION_LABELS`
where present, units per `docs/design-system.md` "Display option labels"):

| Section | Keys |
| --- | --- |
| general/Appearance | `colour`, `variant`, `shade`, `autoShade`, plus a `display.preset` choice (values: keys of `PRESETS`, labels from `display-option-labels`) |
| general/Font | `font`, `size`, `lh`, `weight`, `spacing`, `shadow` |
| general/Messages | `lines`, `zebra`, `times`, `sub`, `rev`, `cmodes`, `stitle` |
| general/Emotes | `eonly` |
| general/Links and cards | `peek`, `yt`, `gifsafe`, `lkico`, `lw`, `links`, `pn`, `clean` |
| general/Scrolling | `scrollback`, `pause` |
| general/Composer | `bauto`, `bartop` |
| general/Layout | `split`, `hfs`, `hpfs`, `lbls` |
| general/Motion | `anim`, `rbw` |
| highlights/Highlights | `keywords`, `self`, `ping` |
| ignores/Ignores | `blocked`, `hidden`, `hideMode`, `nbots` |
| notifications/Desktop alerts | `notify` (write: when turning on, call `host.attention.permission()` after saving) |

Writes: `host.display.setOptions({ ...host.display.options, [key]: value })`; writing `shade`
also sets `autoShade: false`. The preset write applies
`displayFromURL(host.display.options, new URLSearchParams({ theme: value }))` then
`setOptions`. `defaultValue()` returns the key from `firstVisitDisplay()`; the preset's
default is `'nightshade'` and its `read()` returns `''` (no preset is "current").

- [ ] **Step 1: Write failing tests** in `display.test.ts`:
  - `covers every display key except exclusions` — `Object.keys(defaultDisplay())` minus `DISPLAY_EXCLUDED` equals the set of `display.<key>` ids.
  - `writes through setOptions and parse` — writing `display.size` 99 leaves a valid size (parse clamps/rejects) and `read()` returns the stored value.
  - `writing shade turns off autoShade`
  - `preset write applies the preset values` — after writing `'irc'`, `display.options.font === 'fixedsys'`.
  - `defaults come from firstVisitDisplay`
  - `turning notify on requests permission once`
- [ ] **Step 2: Run** `npx --prefix web vitest run --testTimeout=60000 src/settings/sources/display.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** `host.ts` (types only) and `sources/display.ts`.
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `feat(settings): describe display settings`.

### Task 4: Presentation source with duplicate collapse

**Files:**
- Create: `web/src/settings/sources/presentation.ts`
- Test: `web/src/settings/sources/presentation.test.ts`

**Interfaces:**
- Consumes: `SettingsHost`, `presentationFields`, `presentationDefaults`, `parsePresentation`.
- Produces: `export const PRESENTATION_EXCLUDED: readonly (keyof PresentationOptions)[]; export function presentationSettings(host: SettingsHost): SettingDef[];`

`PRESENTATION_EXCLUDED` = `hideSettings`, `showTimestamps`, `timestampFormat`, `separators`,
`alternating`, `mentionAt`, `mentionComma` (the last six are represented by display or
completion controls). Labels and number ranges come from `presentationFields`. Placement:

| Section | Keys |
| --- | --- |
| general/Appearance | `uiScale` |
| general/Messages | `usernameMode`, `boldUsernames`, `colorUsernames`, `colorMentions`, `findAllUsernames`, `collapseLines`, `deletedLength`, `fadeHistory`, `lastMessage`, `lastPattern`, `lastColor`, `showJoins`, `showParts`, `showPronouns`, `loadHistory`, `historyLimit` |
| general/Emotes | `animateOnlyFocused` |
| general/Scrolling | `paneScrollback`, `scrollMultiplier`, `smoothScroll`, `smoothNew`, `pauseHoverSeconds`, `pauseModifier`, `markers`, `hideScrollbar` |
| general/Composer | `showSendButton`, `showLength`, `showWait`, `showEmptyInput`, `overflow`, `pulseSelf` |
| general/Layout | `headerViewers`, `headerTitle`, `headerUptime`, `headerGame` |
| general/Overlay | all `overlay*` keys, `visible: () => host.overlay` |
| accounts/Accounts | `hideAccount` |
| ignores/Ignores | `hideModerated`, `hideModerationActions`, `hideDeletionActions`, `hideReplyContext`, `showReplyButton`, `stripReplyMention` |
| hotkeys/Mouse | `rightClick`, `modifiedRightClick`, `rightClickModifier` |
| notifications/Muted channels | `mutedChannels` (text) |

Writes: `host.presentation.persist(parsePresentation({ ...host.presentation.saved, [key]: value }))`
then `host.rerender()`. Every write also forces the collapsed duplicates to follow the single
source of truth: `showTimestamps: true`, `timestampFormat: 'legacy'`, `separators: 'legacy'`,
`alternating: 'legacy'`, and `mentionAt`/`mentionComma` copied from
`getCompletionPreferences()`.

- [ ] **Step 1: Write failing tests**:
  - `covers every presentation key except exclusions`
  - `writes persist through parsePresentation and rerender` — writing `collapseLines` 99 stores the clamped value 20.
  - `writes collapse duplicate copies to legacy` — start with `separators: 'on'`, write `boldUsernames`; saved `separators === 'legacy'`, `timestampFormat === 'legacy'`.
  - `overlay settings are visible only in overlay mode`
- [ ] **Step 2: Run** `npx --prefix web vitest run --testTimeout=60000 src/settings/sources/presentation.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** `sources/presentation.ts`.
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `feat(settings): describe presentation settings`.

### Task 5: Links, completion and providers sources, built-in sections

**Files:**
- Create: `web/src/settings/sources/links.ts`, `completion.ts`, `providers.ts`, `builtin.ts`
- Test: `web/src/settings/sources/preferences.test.ts`, `web/src/settings/sources/builtin.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function linkSettings(host: SettingsHost): SettingDef[];
  export function completionSettings(host: SettingsHost): SettingDef[];
  export function providerSettings(host: SettingsHost): SettingDef[];
  export function builtinSections(host: SettingsHost): CustomSection[];
  export const LINK_EXCLUDED = ['version'] as const;
  export const COMPLETION_EXCLUDED = ['version'] as const;
  export const PROVIDER_EXCLUDED = ['version'] as const;
  ```

Each preference write: `next = parseX({ ...getX(), ...patch })`; `new XStore().save(next)`;
`setX(next)`; then the side effect the old panel ran:
- links: dispatch `presentation-before-change` and `linkpreferenceschange` on `document`, then `host.rerender()`.
- completion: dispatch `presentation-before-change` and `completionpreferenceschange`, then `host.rerender()`.
- providers: dispatch `presentation-before-change`, then `host.providersChanged()`.

Placement:
- links → general/Links and cards (every field). Labels from `link-preferences-ui.ts`.
- completion → commands/Completion (every field). `aliases` is a multiline text control,
  one `login=alias` per line; `emotePriority` is a comma-separated text control. Both
  format on read and parse on write, then go through `parseCompletionPreferences`.
- providers → integrations/Providers and badges, except `images`, `animated`, `scale`,
  `zeroWidth`, `scaleEmotesByLineHeight`, `removeSpacesBetweenEmotes`, `tooltipScale`,
  `showUnlistedSevenTV` → general/Emotes. Nested records become one toggle per leaf with ids
  like `providers.providers.7TV.channel`, `providers.badges.<category>`,
  `providers.cosmetics.<name>`, `providers.activity.<name>`, `providers.ffzRoleArtwork.<role>`.
  Labels from `provider-preferences-ui.ts`.

`builtinSections`:
- `builtin.alerts` on notifications/Desktop alerts: button "Send test alert" calling
  `host.attention.test()` and showing the returned text in a `role=status` paragraph.
- `builtin.moderation` on moderation/Moderation: text "Moderation presets live in the
  Moderation workspace, next to the actions they stage." and a button "Open moderation
  workspace" calling `host.openPanel('moderation-workspace')`.
- `builtin.providers` on integrations/Providers and badges: button "Reload provider
  metadata" calling `host.reloadProviders()` (status "Reload requested; existing server
  cache remains in effect." or "Wait 30 seconds between reload requests."), plus
  `host.providerStatus()` text.
- Every builtin and every preference def in these sources is `private: true` (the old
  panels refused to open in privacy mode).

- [ ] **Step 1: Write failing tests**:
  - `each preference source covers every key except version` (flatten nested provider records to leaf ids).
  - `link write saves, sets and announces` — spy on `document.dispatchEvent`; `linkpreferenceschange` dispatched once.
  - `completion aliases round-trip through text` — write `"alice=Al\nbob=B"`; `getLocalNickname('alice') === 'Al'`.
  - `provider nested toggle writes one leaf` — write `providers.providers.7TV.live` false; other leaves unchanged; `providersChanged` called once.
  - `builtin alert test shows the attention result`
  - `builtin provider reload reports throttling`
- [ ] **Step 2: Run** `npx --prefix web vitest run --testTimeout=60000 src/settings/sources` — expect FAIL.
- [ ] **Step 3: Implement** the four modules.
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `feat(settings): describe link, completion and provider settings`.

### Task 6: Embedded panels and redirects in LazyPanels

**Files:**
- Modify: `web/src/shell/panels.ts` (`PanelDefinition`, `register`, `open`, `restore`)
- Test: `web/src/shell/panels.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // PanelDefinition gains:
  settings?: { page: PageId; section: string; keywords: string };
  // LazyPanels gains:
  setSettingsOpener(open: (target: { page: PageId; section: string }) => void): void;
  embed(id: string, host: HTMLElement): Promise<() => void>;
  settingsSections(): CustomSection[];   // one per definition with `settings`, mount = embed
  ```

Rules:
- A definition with `settings` registers no menu command.
- `open(id)` on such a definition calls the settings opener with its page and section
  instead of loading into the workbench.
- `restore` skips such definitions, and `register` calls `workbench.releaseAll([id])` so a
  saved layout that docked it is cleaned up without opening anything. (Add
  `releaseAll(ids: readonly string[]): void` to the `PanelWorkbench` interface; the
  workbench already implements it.)
- `embed(id, host)` loads the panel through the same factory and checks as `open`, never
  calls `workbench.adopt`, appends `panel.root` to `host`, marks
  `root.dataset.embedded = 'true'`, intercepts `panel-open-request` on the root
  (`preventDefault()`, then `root.show()` for a dialog or `hidden = false` otherwise), and
  calls `panel.open()`. A `close` event on an embedded dialog re-shows it on the next
  microtask while `root.isConnected`. The disposer removes listeners and calls
  `panel.stop()`. A second `embed` of a loaded panel moves the root into the new host.
- Embedded roots hide their own close controls through CSS in `settings.css`:
  `[data-embedded='true'] :is(button[id$='-close'], [data-action='close'])`.

- [ ] **Step 1: Write failing tests** in `panels.test.ts`:
  - `settings panels register no command`
  - `open redirects settings panels to the settings opener`
  - `a saved layout docking a settings panel is released and not opened` — fake workbench `wantsPanel` true; after `register`, `releaseAll` called with the id and the factory not called.
  - `embed mounts the root inline and shows it non-modally` — `showModal` not called; root inside host; `root.open` true.
  - `embedded dialog that closes itself is shown again`
  - `embed disposer stops the panel`
- [ ] **Step 2: Run** `npx --prefix web vitest run --testTimeout=60000 src/shell/panels.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** the changes in `panels.ts`.
- [ ] **Step 4: Run** the panels and workbench tests — expect PASS.
- [ ] **Step 5: Commit** `feat(shell): embed settings panels and redirect their commands`.

### Task 7: Wire the window into the app

**Files:**
- Create: `web/src/settings/index.ts`
- Modify: `web/src/main.ts` (panel registrations, `hotkeyActions`, `paletteExtra`, host construction), `web/src/shell/index.ts` (`ShellOptions.openSettings`, Ctrl+, in `keys`, `settings:open` command), `web/src/hotkeys.ts` (label of `settings` action), `scripts/bundle-budgets.json`
- Test: `web/src/settings/index.test.ts`, extend `web/src/shell.test.ts`

**Interfaces:**
- Consumes: Tasks 1–6.
- Produces:
  ```ts
  // settings/index.ts
  export function startSettings(host: SettingsHost, embedded: readonly CustomSection[]):
    { open(target?: { page?: PageId; setting?: string; section?: string }): void;
      entries(): { id: string; label: string; run(): void }[];   // palette entries
      registry: SettingsRegistry; stop(): void };
  ```

Wiring:
- `main.ts` builds `SettingsHost` from existing locals (`display`, `presentationRuntime`,
  `scheduleRender`, the provider callback now inside the provider panel registration —
  extract it to a named `providersChanged` function — `reloadProviderMetadata`,
  `attention`, `lazyPanels.open`, `overlay`, the readonly-view
  condition `!!panePopout || ephemeralPopout || overlay`, `privacyEnabled`).
- The window module is imported lazily on first `open()`; `startSettings` is called once,
  with `lazyPanels.settingsSections()` as `embedded`. It passes `storageAvailable` from a
  try/catch `localStorage.setItem`/`removeItem` probe of `chatthing:v1:settings-probe`.
- Add `settings: { page, section, keywords }` to these registrations: `account-profiles`
  (accounts/Accounts), `user-hold-panel` (accounts/Own message feedback), `commands-panel`
  (commands/Custom commands), `rules-panel` (highlights/Message rules),
  `shortcut-settings` (hotkeys/Shortcuts), `custom-theme-panel` (general/Appearance),
  `extensions-panel`, `browser-companion-panel`, `desktop-playback-panel`,
  `device-sync-panel`, `chatterino-import-panel` (integrations, matching section),
  `privacy-settings` (privacy/Visible workspaces), `local-command-help` and
  `resource-readout` (about, matching section). Keywords: the panel title plus words from
  its lead paragraph.
- About page `about` section: a built-in custom section in `settings/index.ts` with the
  version from `document.querySelector('meta[name=version]')` when present, the source
  link `/source.tar.gz` "Source code (AGPL-3.0)", and the upstream credit link copied
  from `resources.ts`.
- `hotkeyActions.settings` → `open()`; `shortcuts` → `open({ page: 'hotkeys' })`;
  `commands` → `open({ page: 'commands' })`; `accounts` keeps dispatching
  `open-account-profiles`, whose handler now opens `{ page: 'accounts' }`. Rename the
  `settings` action label to "Open settings".
- `ShellOptions.openSettings: () => void`; `keys` handles `(metaKey || ctrlKey) &&
  code === 'Comma'` with no Alt/Shift; register command `settings:open` "Settings…" in
  group `view` with hint `Ctrl+,` (`⌘,` on macOS).
- `paletteExtra` appends `settings.entries()`: one "Settings: <page title>" per page and
  one "<label> — <page> › <section>" per visible setting.
- Readonly views (pane popout, ephemeral popout, overlay) do not register the opener; the
  command is unavailable there.
- Add budgets for the new lazy entries using measured size plus 1024 bytes.

- [ ] **Step 1: Write failing tests**:
  - `startSettings registers every source and the embedded sections` — registry page `general` contains `display.size`; page `accounts` contains the embedded account section.
  - `palette entries open the window at the setting` (`index.test.ts`).
  - `Ctrl+, opens settings` and `the Settings… command is registered` (`shell.test.ts`).
- [ ] **Step 2: Run** `npx --prefix web vitest run --testTimeout=60000 src/settings src/shell.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** the wiring.
- [ ] **Step 4: Run** the same tests, then `npm --prefix web run build` — expect PASS and budgets OK.
- [ ] **Step 5: Screenshot** desktop 1280×800 and phone 390×844 with the window open on General and with search "time" (server and capture commands as used in this branch's earlier checks).
- [ ] **Step 6: Commit** `feat(settings): open the Chatterino-style settings window`.

### Task 8: Remove the replaced panels and update docs

**Files:**
- Delete: `web/src/display-ui.ts`, `web/src/panel-templates/display-panel.html`,
  `web/src/presentation-ui.ts`, `web/src/link-preferences-ui.ts`,
  `web/src/completion-preferences-ui.ts`, `web/src/provider-preferences-ui.ts` and their
  `*.test.ts` UI tests.
- Modify: `web/src/main.ts` (remove those five registrations; keep store/runtime setup
  that lived inside them, such as `ProviderPreferenceStore().read()` at boot and the
  completion chatters reader), `web/src/style.css` and `web/src/shell/shell.css` (rules
  only for removed panel ids), `scripts/bundle-budgets.json` (drop removed entries),
  `docs/design-system.md` (Components: Settings window; remove "Display settings are
  grouped into …" sentence), `docs/chatterino-coverage.md` (settings search and targeted
  reset now delivered under #43, with this branch as evidence), `README.md` if it names a
  removed panel.
- Test: move every still-meaningful assertion from the deleted UI tests into the source
  tests from Tasks 3–5 (for example `display-ui.test.ts`'s "preserves every canonical
  preset key" becomes a preset-write test in `display.test.ts`).

Redirects: the removed ids `display-panel`, `presentation-panel`,
`link-preferences-panel`, `completion-preferences-panel`, `provider-preferences-panel`
are added to a `RETIRED_PANELS: Record<string, { page: PageId; section?: string }>` map in
`settings/index.ts`. `main.ts` calls `workbench.releaseAll(Object.keys(RETIRED_PANELS))`
at startup, and the help-tab actions (`display-open`) and `resource-url` `htab=config`
route through it to `open()`.

- [ ] **Step 1: Write failing tests**: `retired panel ids redirect to their settings page`; `startup releases retired ids from a saved layout` (`index.test.ts`).
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Delete and migrate** as listed. `grep -rn "display-panel\|presentation-panel\|link-preferences-panel\|completion-preferences-panel\|provider-preferences-panel" web/src` returns only `RETIRED_PANELS` and tests.
- [ ] **Step 4: Verify everything**: `npm --prefix web run format:check`, `npm --prefix web run build` (budgets and overlay check), `npx --prefix web vitest run --testTimeout=60000` (all files pass), `go test ./...`, and the two screenshots again.
- [ ] **Step 5: Commit** `refactor(settings): retire separate settings panels`.
