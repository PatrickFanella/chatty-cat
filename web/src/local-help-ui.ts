import { showPanel } from './shell/open-panel';
import { LOCAL_COMMANDS } from './local-commands';
import { panelAdapter } from './shell/static-panel';
export function localHelpPanel() {
  const localHelp = document.createElement('dialog');
  localHelp.id = 'local-command-help';
  localHelp.setAttribute('aria-label', 'Local command help');
  const heading = document.createElement('h2');
  heading.textContent = 'Local commands';
  const helpText = document.createElement('p');
  helpText.textContent = LOCAL_COMMANDS.join(' · ');
  const details = document.createElement('p');
  details.textContent =
    'Context is the selected send channel. /reply stages the selected public thread. /r stages a private whisper to the last selected or observed whisper recipient; it never means a public reply. /whisper, /msg and .w are aliases that stage /w. Review staged messages and press Send separately. /requests opens the channel-points queue. /ignore only hides a user locally; /block changes Twitch blocking. Follow actions open Twitch. /clearmessages hides retained rows locally while preserving the archive. /disconnect pauses public, personal and whisper streams until /reconnect. /streamlink [joined channel] opens desktop playback setup; pairing, tool/quality review and launch confirmation are separate. Raw, debug and automatic native commands are unavailable.';
  const closeHelp = document.createElement('button');
  closeHelp.type = 'button';
  closeHelp.textContent = 'Close';
  closeHelp.addEventListener('click', () => localHelp.close());
  localHelp.append(heading, helpText, details, closeHelp);
  document.body.append(localHelp);
  return panelAdapter(
    'local-command-help',
    'Local command help',
    'help',
    localHelp,
    () => showPanel(localHelp),
    () => localHelp.close(),
    () => localHelp.remove(),
  );
}
