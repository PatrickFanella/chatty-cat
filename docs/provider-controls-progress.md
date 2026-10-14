# M4 provider controls progress

The provider/scope and Twitch badge-category step for #31 is implemented. Scoped emote sets preserve losing entries so a disabled winner can expose another source. The reviewed local preferences panel controls global/channel sets, bounded-poll refresh, static rendering, scale, and native badge categories. Existing native tag ranges and overlay composition remain intact.

Validation and the reproducible fixture are in [provider-controls-demo.md](provider-controls-demo.md). FFZ/Chatterino cosmetic integration is described in [cosmetic-badges-demo.md](cosmetic-badges-demo.md), with Chatterino live acceptance blocked by HTTP 403 from Soyuz. Other exact inventory preferences are still open; this step does not close #31 or M4. Cross-device sync (#29) and shared/private metadata (#32) remain open too.

FFZ moderator/VIP artwork controls now use the existing public room response, require native role tags and retain native-image fallback. See [behavior and demo](ffz-role-artwork-demo.md). Positive live configured-channel acceptance and other exact inventory preferences remain open.

Unlisted 7TV visibility, visual emote spacing, line-height scaling and emote-card scale now have reviewed local controls and bounded rendering. See [behavior and native-browser measurements](emote-presentation-demo.md). Cheer stacking and the configurable F5 reload adaptation are described in [their demo](emote-reload-cheers-demo.md). Activity opt-ins, remaining cosmetic services and positive live acceptance are still open.

Independent chat emote image, animation and zero-width layering controls are verified in [the image/account action demo](emote-image-account-controls-demo.md), including an explicit static native-tag CDN fallback. The account selector also has a guarded configurable action.

The optional BTTV/7TV capability and bounded provider-cache refresh foundation is tracked in [provider-services-progress.md](provider-services-progress.md). It does not yet provide browser event subscriptions, additional badges or activity announcements.
