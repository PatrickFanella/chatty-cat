# Custom color theme demo

Issue [#34](https://git.subcult.tv/subculture-collective/chatty-cat/issues/34) adds
account-scoped, color-only themes. Open **Custom themes** beside Settings.

Use this Chatty Cat version 1 JSON:

```json
{"version":1,"name":"Ocean","colors":{"background":"#102838","panel":"#183d52","foreground":"#ffffff","muted":"#bdd4e2","border":"#7292a8","accent":"#77dcff"}}
```

1. Leave an unsent composer draft and a paused reader position in the workspace.
2. Paste the JSON and choose **Review theme**. Review the six contrast pairs.
3. Choose **Preview across workspace**. Four surface samples and the underlying
   workspace use the colors. Preview does not write storage.
4. Enable the CSS reduced-motion preview. It stops CSS animation/transition and
   smooth scrolling; it does not freeze animated image content or embedded video.
5. Choose **Revert preview** or close the dialog. Saved colors return. The workspace
   does not reload and the draft is retained.
6. Review again, apply/save, and reload. The same account restores the theme.
   Open the picker, resources and moderation workspace to inspect the saved colors.
7. Export the reviewed theme. The downloaded JSON contains only version, name and
   six validated colors. **Use built-in palette** removes the custom override while
   retaining workspace state. Existing palette controls remain underneath it.

## Supported import boundary

Native schema version 1 requires all six colors as opaque `#RGB` or `#RRGGBB`.
Unknown native keys, invalid colors and executable CSS are rejected. Input is
bounded to 64 KiB; Chatterino traversal is limited to 512 nodes and eight levels.

Choose the explicit **Chatterino 2.5.6 color subset** format for upstream JSON.
The importer maps these paths:

| Upstream path | Chatty Cat field |
| --- | --- |
| `colors.messages.backgrounds.regular` | background |
| `colors.splits.header.background` | panel |
| `colors.messages.textColors.regular` | foreground |
| `colors.messages.textColors.system` | muted |
| `colors.splits.header.border` | border |
| `colors.accent` | accent |

Other leaf paths appear in the unsupported list and are excluded from export.
The `$schema` value is metadata only and is never fetched. Mapped colors require
opaque hex; Qt named/alpha colors, native multipliers, selection/tab variants,
filesystem watching and automatic reload are unavailable. The pinned
[upstream Dark theme](https://github.com/Chatterino/chatterino2/blob/v2.5.6/resources/themes/Dark.json)
and [schema](https://github.com/Chatterino/chatterino2/blob/v2.5.6/docs/ChatterinoTheme.schema.json)
are the mapping references. Chatterino's alpha ordering differs from CSS; the
importer does not reinterpret unsupported alpha values as browser colors.

Contrast reports foreground, muted and accent against background and panel.
A low ratio is disclosed rather than silently corrected. These measurements do
not establish contrast for user names, emotes, every message highlight or all
native controls. Color changes use the existing reader anchor before-change event.
Privacy hides and clears the import/review text. Storage failures, malformed saved
records, stale writes and account changes block replacement of saved themes.

## October 13 verification

Native Chromium verified temporary preview, reduced CSS motion, revert, saved
restoration after reload and a 219-byte downloaded validated export. The pinned
upstream Dark theme produced its unsupported list and correctly disclosed muted
text on the panel at 3.53:1. In a synthetic signed-in account, moderation and
resources used the selected panel RGB(24,61,82) and foreground RGB(255,255,255);
the picker used the same panel and muted RGB(189,212,226). No moderation or chat
write was submitted. The minimal fixture's public chat endpoints are unavailable;
this check does not assert live reader transport acceptance.

Focused tests cover schema/injection/bounds, mapping, contrast, preview/revert,
drafts, failed/stale storage, account isolation/restoration, malformed saved data,
privacy clearing and teardown without scheduling another reader render.

All 592 frontend tests, strict TypeScript and the production build pass after
rebasing onto merged journal safeguards #83. The 515-row source inventory check
passes (158 implemented, 264 planned, 39 partial, 38 platform-limited, 16 companion-only).
Backend code is unchanged; no new Go race run was required for these preferences.
