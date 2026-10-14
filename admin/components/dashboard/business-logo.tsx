"use client";

import React from "react";

interface BusinessLogoProps {
  id?: string | null;
  name: string;
  color?: string;
  size?: number;
  className?: string;
}

// Crisp, corporate vector glyphs for modern B2B SaaS and enterprise brands
function renderCompanyGlyph(key: string | null | undefined, name: string) {
  const normalized = (key || name).toLowerCase();

  if (normalized.includes("alpine") || normalized.includes("robotics")) {
    // Precision Alpine Apex / Robotics chevron
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 2 19 22 19" fill="rgba(255,255,255,0.15)" stroke="currentColor" />
        <path d="M12 9v10" />
        <path d="M8 19l4-6 4 6" />
      </svg>
    );
  }

  if (normalized.includes("nord") || normalized.includes("tech")) {
    // Hexagonal Industrial Automation / Tech grid
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l8.5 5v10L12 22 3.5 17V7L12 2z" fill="rgba(255,255,255,0.18)" stroke="currentColor" />
        <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  if (normalized.includes("meridian") || normalized.includes("health") || normalized.includes("biotech")) {
    // Pulse BioTech / Helix node
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="8" fill="rgba(255,255,255,0.15)" stroke="currentColor" />
        <path d="M7 12h2.5l2-4 2 8 1.5-4H17" stroke="currentColor" />
      </svg>
    );
  }

  if (normalized.includes("atlas") || normalized.includes("logistics")) {
    // Global Supply Chain Isometric Cube
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l8 4.5v9L12 20 4 15.5v-9L12 2z" fill="rgba(255,255,255,0.15)" stroke="currentColor" />
        <path d="M12 2v18" stroke="currentColor" />
        <path d="M20 6.5l-8 4.5-8-4.5" stroke="currentColor" />
      </svg>
    );
  }

  if (normalized.includes("novus") || normalized.includes("medical")) {
    // Medical shield & cross
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="rgba(255,255,255,0.15)" stroke="currentColor" />
        <path d="M12 8v8M8 12h8" stroke="currentColor" />
      </svg>
    );
  }

  if (normalized.includes("aether") || normalized.includes("nano")) {
    // Atomic nano orbits
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
        <ellipse cx="12" cy="12" rx="9" ry="4" stroke="currentColor" transform="rotate(30 12 12)" />
        <ellipse cx="12" cy="12" rx="9" ry="4" stroke="currentColor" transform="rotate(-30 12 12)" />
      </svg>
    );
  }

  if (normalized.includes("aero") || normalized.includes("dynamics")) {
    // Aerodynamic swept delta wing
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l9 16-9-4-9 4 9-16z" fill="rgba(255,255,255,0.2)" stroke="currentColor" />
        <circle cx="12" cy="10" r="1.5" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  if (normalized.includes("helios") || normalized.includes("energy")) {
    // Solar burst / Energy core
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="4.5" fill="rgba(255,255,255,0.25)" stroke="currentColor" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12" stroke="currentColor" />
      </svg>
    );
  }

  if (normalized.includes("synapse") || normalized.includes("software")) {
    // Neural synaptic graph
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="6" r="3" fill="rgba(255,255,255,0.2)" stroke="currentColor" />
        <circle cx="18" cy="8" r="3" fill="rgba(255,255,255,0.2)" stroke="currentColor" />
        <circle cx="12" cy="18" r="3" fill="rgba(255,255,255,0.2)" stroke="currentColor" />
        <path d="M8.5 7.5l7 1.5M7.5 8.5l3.5 7M16.5 10.5l-3.5 5" stroke="currentColor" />
      </svg>
    );
  }

  if (normalized.includes("quantex") || normalized.includes("cyber")) {
    // Quantum diamond processor
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="5" width="14" height="14" rx="2" transform="rotate(45 12 12)" fill="rgba(255,255,255,0.18)" stroke="currentColor" />
        <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  if (normalized.includes("kronos") || normalized.includes("materials")) {
    // Faceted prism crystal
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="6 3 18 3 22 9 12 22 2 9" fill="rgba(255,255,255,0.18)" stroke="currentColor" />
        <path d="M2 9h20M12 22L7 9M12 22l5-13" stroke="currentColor" />
      </svg>
    );
  }

  if (normalized.includes("solaris") || normalized.includes("clean")) {
    // Clean solar leaf / flare
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2C6.5 2 2 6.5 2 12c0 5.5 4.5 10 10 10 5.5 0 10-4.5 10-10C22 6.5 17.5 2 12 2z" fill="rgba(255,255,255,0.12)" stroke="currentColor" />
        <path d="M2 12c5.5 0 10-4.5 10-10 0 5.5 4.5 10 10 10-5.5 0-10 4.5-10 10 0-5.5-4.5-10-10-10z" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  // Elegant fallback: stylized monogram badge
  const initial = (name || "B").trim().charAt(0).toUpperCase();
  return (
    <span className="business-logo-letter" aria-hidden="true">
      {initial}
    </span>
  );
}

export function BusinessLogo({
  id = "",
  name,
  color = "#0284c7",
  size,
  className = "",
}: BusinessLogoProps) {
  const style: React.CSSProperties = {
    backgroundColor: color,
    ...(size ? { width: size, height: size } : {}),
  };

  return (
    <span
      className={`business-logo ${className}`.trim()}
      style={style}
      aria-label={`${name} logo`}
      role="img"
    >
      {renderCompanyGlyph(id, name)}
    </span>
  );
}
