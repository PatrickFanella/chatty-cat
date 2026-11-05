# Desktop UI review

Owner feedback from the macOS desktop app, November 4, 2026. Implemented and checked locally as described below. macOS interaction and a completed Twitch account sign-in still need device validation.

- [x] Resize without reloading, pausing or muting the video.
- [x] Full-width section headers anchored at the top, with controls aligned right.
- [x] Header options remain reachable when the pointer moves into their menu.
- [x] Clear, separate Twitch player sign-in in the desktop session.
- [x] Stream uptime formatted as `3:35:44`.
- [x] Dragging always releases the grabbing cursor.
- [x] Drag-to-edge docking works and releases capture.
- [x] Thread, reply, link and bookmark actions sit below the message.
- [x] Choose icons or text for message actions.
- [x] Allow chat narrower than half of the window.
- [x] Give chat a draggable header and panel placement controls.
- [x] Settings interaction does not leave chat hover-paused or disturb the reader.
- [x] Option to hide the leading recipient username in displayed replies.
- [x] Reduce text clutter and group related controls.
- [x] Responsive, better-organized usercard.
- [x] Settings subsections with navigation.
- [x] Settings explanations and tooltips.
- [x] Contain chat video previews within the window.
- [x] Responsive wheel/trackpad scrolling.
- [x] Settings button in the main header.
- [x] Account identity shows the username without “Signed in as”.
- [x] Faster tooltips for common controls.
- [x] Usercards default to explicit opening, with a username context-menu option.

## Implementation direction

Keep the current minimal shell. Fix DOM/pointer lifecycle defects before styling. Reuse the workbench for chat placement. Preserve saved settings and add only the options needed by the feedback. Chat OAuth and Twitch website/player cookies are separate: provide an official sign-in window sharing the desktop browser session, without forwarding OAuth tokens into the player.

## Verification

- Regression: the workbench resize check failed on the original implementation because a connected iframe wrapper was removed, and passes after the DOM reconciliation change.
- Chromium conformance: an iframe sentinel kept the same window token and one load across repeated desktop resizes, changing dock sides, and dragging from left to right. Pointer release and window blur cleared the grabbing state. Dragging a modal usercard to the left edge also docked it.
- Chat reached 240px wide at a 1200px window. Its placement menu floated it and returned it to the centre.
- The message footer showed all four actions, with selectable icon or text presentation. Reply-mention regression coverage checks that hiding the recipient does not shift Twitch emote positions or modify the stored text.
- Settings subsection links opened their targets, and keyboard focus showed the help tooltip inside the modal dialog. Opening settings cleared a held hover pause in the log regression check. Custom themes now have their own subsection. A startup regression checks that this embedded editor is registered and can open.
- A 240px wheel gesture moved 240px at normal speed and 480px at 2× speed. Preview media stayed inside the viewport with a 16:9 frame. The usercard and its title bar fit a 390px viewport in both sheet and dialog presentation.
- Linux Electron conformance: the bundled UI opened, the header Settings button opened Settings, and Player sign-in opened Twitch’s official login form. The login window and app used the identical Electron session. No account credentials were entered.
- Frontend suite: 1,056 tests passed across 197 files (`npm --prefix web test -- --maxWorkers=2 --testTimeout=15000`). The timeout override accommodates the existing slow whisper-rendering case on Dozor; the PR keeps the normal CI test timeout. Type checking, production build, formatting, the overlay guard, bundle limits, and script tests pass locally.

## macOS follow-up

The iframe sentinel proves that our layout no longer discards the browsing context; it does not verify Twitch playback or sound with a signed-in account. On the Mac, use **Video → Player sign-in**, complete Twitch’s login, close that window, and select **Refresh video player**. Chat OAuth and the Twitch website session are separate. Sign-in completion, subscription access, playback and audio still require that account/device check. The pull request’s desktop workflow also builds and smoke-tests the macOS app.
