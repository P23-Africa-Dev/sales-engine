'use client';

import { QRCodeSVG } from 'qrcode.react';
import {
  AGENT_APK_VERSION_NAME,
  AGENT_APK_VERSION_CODE,
} from '@/lib/agent-apk-version';
import { getAgentApkUrl, getAgentInstallUrl } from '@/lib/agent-pwa-url';

type AgentInstallQrCodeProps = {
  size?: number;
  /** Override the encoded URL (defaults to PWA install URL). */
  value?: string;
  /** Accessible label for the QR image. */
  label?: string;
  /** When true, show the encoded URL under the QR (useful for APK downloads). */
  showUrl?: boolean;
  /** Optional caption under the QR (e.g. version). */
  caption?: string;
};

export function AgentInstallQrCode({
  size = 200,
  value,
  label = 'Scan to install Factory 23 Agent',
  showUrl = false,
  caption,
}: AgentInstallQrCodeProps) {
  const encoded = value ?? getAgentInstallUrl();

  return (
    <div className="inline-flex flex-col items-center gap-2 max-w-full">
      <div className="rounded-2xl bg-white p-4 shadow-lg inline-flex" role="img" aria-label={label}>
        <QRCodeSVG value={encoded} size={size} level="M" includeMargin />
      </div>
      {caption ? (
        <p className="text-[10px] font-bold uppercase tracking-wider text-[#75ADAF]">{caption}</p>
      ) : null}
      {showUrl ? (
        <p className="text-[10px] text-white/45 text-center break-all leading-relaxed max-w-[280px]">
          {encoded}
        </p>
      ) : null}
    </div>
  );
}

export function AgentApkQrCode({ size = 200 }: { size?: number }) {
  const apkUrl = getAgentApkUrl();

  return (
    <AgentInstallQrCode
      size={size}
      value={apkUrl}
      label="Scan to download the Factory 23 Agent Android APK"
      showUrl
      caption={`Android APK v${AGENT_APK_VERSION_NAME} (${AGENT_APK_VERSION_CODE})`}
    />
  );
}
