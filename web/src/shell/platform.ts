// Shortcut labels: Apple platforms show ⌘, everything else Ctrl. Avoids the deprecated navigator.platform.
export function applePlatform(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform;
  if (platform) return /mac|ios/i.test(platform);
  return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
}
