# Milestone 1 delivery

Started 2026-10-12 from main `6c34eb5`. Track acceptance and dependencies in the Gitea milestone/project; the Chatterino coverage audit is complete.

## Named workspaces (#6)

Implemented; preparing review. Includes bounded public workspace snapshots, previewed create/rename/duplicate/switch/delete, import/export and keyboard access. Reuse existing settings/panel capture. Retain per-channel drafts in session storage and paused reader anchors by stable message key; workspace files exclude drafts, account credentials and whispers. Verify model failure cases, integrated startup/switch behavior and a local browser demo before requesting review.

Implementation checkpoint: named workspace actions and public settings import/export are implemented, with a 20-workspace / 256 KB bound, stale-tab write protection and visible storage failures. Switching reloads the view to rebuild channel-specific controllers. Active settings capture runs before disposal; per-channel drafts remain in session storage and never enter workspace files. Paused rows restore by stable key plus pixel offset, with a notice when history retention removed the key.

Browser demo on anonymous localhost: created Community from Watching, duplicated/renamed/deleted an inactive copy, switched between 18px and 20px views, retained a synthetic public draft and paused reader state, then imported Moderating with two channels, target subcult_tv and 14px settings. Import preview preceded application and injected private fields were discarded. No Twitch send or moderation action occurred. Model/navigation fixtures cover quota errors, malformed/versioned/excessive imports, exact reader offset restoration and stale-tab rejection.

The full frontend tests and production build passed after final pane-state changes. Provider/account tests are unnecessary for these local workspace controls.

## Streamer privacy (#13)

Implemented manual privacy mode with a workspace allowlist and Alt+Shift+P panic hide. The setting propagates to same-origin tabs/popouts through browser storage. Allowed views still hide account status, composer, whispers, cards, emotes/video panels and settings dialogs; unlisted workspaces hide the whole app except privacy controls. Notification/sound handling is suppressed, including a notification awaiting the service-worker lookup when the mode changes; existing app notifications are closed. Workspace/history exports and settings sharing are blocked while active. Private user notes do not exist yet; their future UI/export path must honor the same policy. Process detection remains absent and companion-only.

Full check after integration: 67 frontend files / 327 tests passed, strict TypeScript/service-worker checks and production build passed. Vite retains its existing >500 KB bundle warning. No deployment or provider write was performed.

Privacy browser demo: allowlisted Watching stayed visible with account/composer hidden; history export reported disabled. Alt+Shift+P hid the app header and content while the privacy toolbar stayed usable. A same-session window.open popout inherited panic mode and responded to privacy off/on storage changes; separately created T3 incognito tabs have isolated storage and were not used as propagation evidence; no account/provider write was used.
