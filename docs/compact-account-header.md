# Compact account-button width

The public deployment check at 390×844 found the account button ending at
396.4 pixels. Its account group could shrink to 122.8 pixels, but the button's
automatic minimum width retained its 137.2-pixel content width. This extended
the document horizontally even though the open resource panel fitted.

The existing compact-header rule now gives the account button `min-width: 0`,
a maximum width of its account group, hidden overflow and an ellipsis. The
account name yields before the shorter Sign out action, while the longer login
label can be truncated to the group width. This retains the full text and native
button semantics. The existing 700-pixel breakpoint
keeps the desktop rule unchanged.

A local production build fitted signed-out and long-account-label visual states
at 320×700, 390×844, 600×800 and 1280×800: document width equaled viewport width,
and every button stayed inside the viewport with at least a 24-pixel width.
The full `Log in with Twitch` and `Sign out` labels remained in the DOM;
Sign out was not clipped in any tested visual state.
Keyboard Tab moved from search to the account button at 320 pixels. No runtime
errors were captured.

These visual states set the button and account text in an isolated local fixture
whose provider authentication is disabled. They verify layout and focus, not a
real signed-in session or login/logout request. No provider action was submitted.
The original production finding and deployed release remain in the
[deployment receipt](deployment-2026-10-19-empty-rules.md).

Seven existing auth/shell/workbench tests passed across three files, as did
strict TypeScript and formatting. The production bundle passed the overlay guard
and all 56 entry budgets: loaded main JavaScript is 150,741 gzip bytes and its
styles are 14,876 gzip bytes. Hosted CI and deployment remain separate.

See the [raw measurements](compact-account-header-evidence-2026-10-19.json).
