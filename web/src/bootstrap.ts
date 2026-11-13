import './storage-rename';
import { startMain } from './main';
import { loadAuth } from './auth';
import { setProfileScope, validAccount } from './account-profiles';
// Resolve the identity before constructing preference editors. Tokens remain on the server.
async function start(): Promise<void> {
  try {
    const auth = await loadAuth(AbortSignal.timeout(5000));
    const account = auth.authenticated ? auth.userID! : 'anonymous';
    setProfileScope(account);
    try {
      sessionStorage.setItem('chatty-cat:v1:last-profile', account);
    } catch {
      /* Optional storage. */
    }
  } catch {
    try {
      const previous = sessionStorage.getItem('chatty-cat:v1:last-profile');
      if (previous && validAccount(previous)) setProfileScope(previous);
    } catch {
      /* Optional storage; public chat still starts. */
    }
  }
  await startMain();
}
void start();
