export const FIREFOX_COMPANION_ID = 'chatty-cat-companion@subcult.tv';
export function validBrowserCompanionID(id: string): boolean {
  return /^[a-p]{32}$/.test(id) || id === FIREFOX_COMPANION_ID;
}
