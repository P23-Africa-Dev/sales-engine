/**
 * Bump these whenever `npm run apk:release` publishes a new factory23-agent.apk.
 * `AGENT_APK_VERSION_CODE` is appended as `?v=` on QR / download URLs so phones
 * and CDNs do not keep an old package. Keep in sync with android versionCode.
 */
export const AGENT_APK_VERSION_CODE = '2';
export const AGENT_APK_VERSION_NAME = '1.0.1';

/** Canonical public download — always what homepage QR codes should encode. */
export const CANONICAL_AGENT_APK_URL =
  'https://thefactory23.com/downloads/factory23-agent.apk';

export function withAgentApkCacheBust(url: string): string {
  const version =
    process.env.NEXT_PUBLIC_AGENT_APK_VERSION?.trim() ||
    `${AGENT_APK_VERSION_NAME}-${AGENT_APK_VERSION_CODE}`;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('v', version);
    return parsed.toString();
  } catch {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}v=${encodeURIComponent(version)}`;
  }
}
