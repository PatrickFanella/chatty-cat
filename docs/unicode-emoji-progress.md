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

649 frontend tests and the production build passed after integrating the upload
cache bypass and safe-link follow-ups. The additional portable-workspace regression
now passes with the emoji fields included in its public allowlist. Cache tests
cover hosted-upload bypass/purge and a separate 128-entry emoji bucket.

The built Chrome fixture verified Unicode 17 images, category/tone filtering,
click and focused Enter insertion, preserved Twitch emote identity, label style
and preference/draft reload with a legacy workspace. It recorded zero provider
writes. Production deployment and provider/font acceptance remain separate.
