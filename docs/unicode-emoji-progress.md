# Unicode emoji (#45)

Unicode Emoji 17.0 is pinned to the official emoji-test.txt SHA256, with the source
and Unicode License v3 retained. All 3,944 fully qualified entries have names,
categories, subgroups, versions, skin-tone sequences and validated local Twemoji
17.0.3 SVGs. The original curated search synonyms remain available.

Implemented native, local-image and text-label styles; category/tone navigation;
text fallback; canonical insertion; adjacent emoji usage detection; 600-row picker
cap; and a separate 128-entry emoji image cache. Native Twitch code-point ranges
are unchanged. Assets are unmodified, licensed CC BY 4.0 and attributed in NOTICE
and the picker. No third-party image request is needed for these emoji styles.

646 frontend tests pass on the initial stack. A shared-link parser type error was
corrected; production build and built-app acceptance are still being verified.
The upload cache bypass and safe-link fixture follow-ups must be rebased in before
opening this PR. Production deployment and font/provider acceptance remain separate.
