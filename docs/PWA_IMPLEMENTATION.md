# PWA Implementation Guide — Factory 23

This document covers converting the Factory 23 Next.js 16 app into a Progressive Web App with full offline support. It is specific to this codebase's file structure, routing, and stack (React 19, Zustand, React Query, App Router).

---

## Overview

A PWA requires three things to be installable and work offline:

1. A **Web App Manifest** — tells the browser the app's identity, icons, and launch behavior
2. A **Service Worker** — intercepts network requests and serves cached responses when offline
3. **HTTPS** — required in production; `next dev --experimental-https` for local testing

This guide uses **Serwist** for service worker management — the approach officially recommended by the Next.js 16 docs for offline support.

---

## Table of Contents

1. [Install Dependencies](#1-install-dependencies)
2. [Web App Manifest](#2-web-app-manifest)
3. [App Icons](#3-app-icons)
4. [PWA Metadata in Root Layout](#4-pwa-metadata-in-root-layout)
5. [Serwist Service Worker Setup](#5-serwist-service-worker-setup)
6. [Offline Fallback Page](#6-offline-fallback-page)
7. [Caching Strategy by Route](#7-caching-strategy-by-route)
8. [Install Prompt Component](#8-install-prompt-component)
9. [Security Headers in next.config.ts](#9-security-headers-in-nextconfigts)
10. [Testing Locally](#10-testing-locally)
11. [Production Checklist](#11-production-checklist)

---

## 1. Install Dependencies

```bash
npm install @serwist/next serwist
```

Serwist is a maintained fork of Workbox with first-class Next.js App Router support. It handles precaching of static assets and runtime caching strategies.

---

## 2. Web App Manifest

Create `app/manifest.ts`. Next.js 16 App Router picks this up automatically and serves it at `/manifest.webmanifest`.

```ts
// app/manifest.ts
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Factory 23',
    short_name: 'Factory 23',
    description: "Africa's Factory — CRM, Projects, Operations & AI in one place",
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0f0f0f',
    theme_color: '#9333ea',
    categories: ['business', 'productivity'],
    icons: [
      {
        src: '/icons/icon-72x72.png',
        sizes: '72x72',
        type: 'image/png',
      },
      {
        src: '/icons/icon-96x96.png',
        sizes: '96x96',
        type: 'image/png',
      },
      {
        src: '/icons/icon-128x128.png',
        sizes: '128x128',
        type: 'image/png',
      },
      {
        src: '/icons/icon-144x144.png',
        sizes: '144x144',
        type: 'image/png',
      },
      {
        src: '/icons/icon-152x152.png',
        sizes: '152x152',
        type: 'image/png',
      },
      {
        src: '/icons/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-384x384.png',
        sizes: '384x384',
        type: 'image/png',
      },
      {
        src: '/icons/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'Dashboard',
        url: '/dashboard',
        icons: [{ src: '/icons/shortcut-dashboard.png', sizes: '96x96' }],
      },
      {
        name: 'CRM',
        url: '/crm',
        icons: [{ src: '/icons/shortcut-crm.png', sizes: '96x96' }],
      },
      {
        name: 'Projects',
        url: '/projects',
        icons: [{ src: '/icons/shortcut-projects.png', sizes: '96x96' }],
      },
    ],
    screenshots: [
      {
        src: '/screenshots/dashboard.png',
        sizes: '1280x720',
        type: 'image/png',
        // @ts-expect-error — form_factor is not yet in Next.js types but is valid per spec
        form_factor: 'wide',
      },
    ],
  }
}
```

**Key field notes:**

- `start_url: '/dashboard'` — opens directly into the app, not the landing page
- `display: 'standalone'` — hides the browser UI, looks native
- `theme_color: '#9333ea'` — matches the purple brand in the FloatingAIButton and overall design system
- `background_color: '#0f0f0f'` — shown on the splash screen before the app loads
- `purpose: 'maskable'` on the 512×512 icon — required for Android adaptive icons (safe zone must have no transparent edges)

---

## 3. App Icons

Generate all icon sizes from a single high-res source image (at least 512×512px, ideally 1024×1024px) using one of:

- [Favicon.io](https://favicon.io/favicon-converter/) — free, outputs all sizes
- [RealFaviconGenerator](https://realfavicongenerator.net/) — most thorough, checks maskable safe zones
- [PWA Asset Generator](https://github.com/elegantapp/pwa-asset-generator) — CLI, can automate in CI

Place all generated icons in `public/icons/`:

```
public/
  icons/
    icon-72x72.png
    icon-96x96.png
    icon-128x128.png
    icon-144x144.png
    icon-152x152.png
    icon-192x192.png
    icon-384x384.png
    icon-512x512.png        ← must be maskable
    shortcut-dashboard.png
    shortcut-crm.png
    shortcut-projects.png
  screenshots/
    dashboard.png
```

For the maskable 512×512 icon: the brand content (logo) must fit within a centered circle of ~80% of the icon's width. Everything outside that safe zone may be cropped on some launchers. Use [Maskable.app](https://maskable.app/editor) to verify it looks correct.

---

## 4. PWA Metadata in Root Layout

Update `app/layout.tsx` to add PWA-specific meta tags:

```tsx
// app/layout.tsx
import type { Metadata, Viewport } from 'next'
import { Poppins, Montserrat } from 'next/font/google'
import './globals.css'
import QueryProvider from '@/components/providers/query-provider'
import AuthInitializer from '@/components/providers/auth-initializer'
import { Toaster } from 'sonner'

const poppins = Poppins({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-poppins',
})

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['700'],
  variable: '--font-montserrat',
})

export const viewport: Viewport = {
  themeColor: '#9333ea',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export const metadata: Metadata = {
  title: 'Factory 23',
  description: "Africa's Factory",
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Factory 23',
    startupImage: [
      {
        url: '/splash/apple-splash-2048-2732.png',
        media: '(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2)',
      },
      {
        url: '/splash/apple-splash-1668-2388.png',
        media: '(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2)',
      },
      {
        url: '/splash/apple-splash-1290-2796.png',
        media: '(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)',
      },
      {
        url: '/splash/apple-splash-1179-2556.png',
        media: '(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)',
      },
      {
        url: '/splash/apple-splash-828-1792.png',
        media: '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2)',
      },
    ],
  },
  formatDetection: {
    telephone: false,
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${poppins.variable} ${montserrat.variable} ${poppins.className} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <QueryProvider>
          <AuthInitializer>{children}</AuthInitializer>
        </QueryProvider>
        <Toaster position="top-center" richColors />
      </body>
    </html>
  )
}
```

**What changed:**

- `viewport` is now a separate export — Next.js 16 App Router requires this; it can no longer be nested inside `metadata`
- `manifest: '/manifest.webmanifest'` links the manifest
- `appleWebApp` adds the iOS-specific meta tags for full-screen mode and splash screens
- `themeColor` in `viewport` controls the browser chrome color on Android

---

## 5. Serwist Service Worker Setup

### 5a. Update `next.config.ts`

```ts
// next.config.ts
import type { NextConfig } from 'next'
import withSerwistInit from '@serwist/next'

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === 'development', // disable in dev for easier debugging
})

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'i.pravatar.cc',
      },
      {
        protocol: 'https',
        hostname: 'api.thefactory23.com',
      },
    ],
  },
  async redirects() {
    return [
      {
        source: '/dashboard/projects',
        destination: '/projects',
        permanent: false,
      },
      {
        source: '/dashboard/projects/:path*',
        destination: '/projects/:path*',
        permanent: false,
      },
    ]
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ]
  },
}

export default withSerwist(nextConfig)
```

> **Important:** Serwist currently requires webpack. If this project is using Turbopack (`next dev --turbopack`), either switch back to the default bundler for builds, or add `turbopack: false` to the config.

### 5b. Create the Service Worker Source

Create `app/sw.ts`. This is the source file that Serwist compiles into `public/sw.js` at build time.

```ts
// app/sw.ts
import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { Serwist } from 'serwist'

// This must match @serwist/next's injected injection point
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: '/offline',
        matcher({ request }) {
          return request.destination === 'document'
        },
      },
    ],
  },
})

serwist.addEventListeners()
```

**What this does:**

- **Precaching** (`self.__SW_MANIFEST`): Serwist injects the list of all Next.js static assets (JS chunks, CSS, fonts) at build time. These are cached immediately on service worker install, enabling full offline access to the app shell.
- **`skipWaiting: true`**: New service worker activates immediately without waiting for all tabs to close.
- **`clientsClaim: true`**: The new service worker takes control of all open tabs immediately.
- **`navigationPreload`**: Speeds up navigation by starting the network fetch while the service worker boots.
- **`runtimeCaching: defaultCache`**: Serwist's sensible defaults — caches Google Fonts, images, and JS chunks with appropriate strategies.
- **`fallbacks`**: When the user is offline and navigates to a page that isn't cached, serve `/offline` instead of a browser error screen.

### 5c. Add TypeScript Type for the Service Worker

Create or update `tsconfig.json` to include the service worker lib:

```json
{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext", "webworker"]
  }
}
```

Or create a separate tsconfig for the service worker:

```json
// tsconfig.sw.json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "lib": ["esnext", "webworker"],
    "target": "ES2015",
    "outDir": ".serwist"
  },
  "include": ["app/sw.ts"]
}
```

---

## 6. Offline Fallback Page

Create `app/offline/page.tsx`. This is served when the user is offline and requests a page that is not in the cache.

```tsx
// app/offline/page.tsx
export default function OfflinePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0f0f0f] text-white px-6">
      <div className="max-w-sm w-full text-center space-y-6">
        {/* Icon */}
        <div className="w-20 h-20 mx-auto rounded-full bg-purple-600/20 flex items-center justify-center">
          <svg
            className="w-10 h-10 text-purple-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M18.364 5.636a9 9 0 010 12.728M15.536 8.464a5 5 0 010 7.072M12 12h.01M8.464 15.536a5 5 0 010-7.072M5.636 18.364a9 9 0 010-12.728"
            />
          </svg>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold">You're offline</h1>
          <p className="text-white/50 text-sm leading-relaxed">
            Factory 23 needs a connection to load this page. Pages you've
            already visited are available offline.
          </p>
        </div>

        <button
          onClick={() => window.location.reload()}
          className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 active:scale-95 transition-all rounded-xl font-medium text-sm"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
```

---

## 7. Caching Strategy by Route

Serwist's `defaultCache` handles most cases, but you can add custom strategies for Factory 23's API endpoints by extending `runtimeCaching` in `app/sw.ts`:

```ts
import {
  CacheFirst,
  NetworkFirst,
  StaleWhileRevalidate,
} from 'serwist'

const serwist = new Serwist({
  // ...existing config...
  runtimeCaching: [
    // Factory 23 API — network first, fall back to cache
    {
      matcher: ({ url }) => url.hostname === 'api.thefactory23.com',
      handler: new NetworkFirst({
        cacheName: 'factory-api',
        networkTimeoutSeconds: 5,
        plugins: [
          {
            // Cache for 24 hours, max 50 entries
            cacheableResponse: { statuses: [0, 200] },
            expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
          },
        ],
      }),
    },

    // Avatar images — cache first (they rarely change)
    {
      matcher: ({ url }) => url.hostname === 'i.pravatar.cc',
      handler: new CacheFirst({
        cacheName: 'avatars',
        plugins: [
          {
            cacheableResponse: { statuses: [0, 200] },
            expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 },
          },
        ],
      }),
    },

    // Static assets — stale while revalidate
    {
      matcher: ({ request }) =>
        request.destination === 'script' ||
        request.destination === 'style' ||
        request.destination === 'font',
      handler: new StaleWhileRevalidate({
        cacheName: 'static-assets',
      }),
    },

    // Spread the Serwist defaults last so they apply to everything else
    ...defaultCache,
  ],
})
```

**Strategy guide:**

| Route type | Strategy | Why |
|---|---|---|
| `api.thefactory23.com/*` | NetworkFirst | Fresh data preferred; stale cache as fallback |
| Images / avatars | CacheFirst | Bandwidth saving; they don't change often |
| JS/CSS/fonts | StaleWhileRevalidate | Instant load from cache; update in background |
| HTML navigation | NetworkFirst + offline fallback | Always try fresh; show `/offline` if unavailable |

---

## 8. Install Prompt Component

Create `components/pwa/install-prompt.tsx`. This handles the "Add to Home Screen" prompt across Android (native prompt) and iOS (manual instruction).

```tsx
// components/pwa/install-prompt.tsx
'use client'

import { useEffect, useState } from 'react'
import { X, Download, Share } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null)
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true

    setIsStandalone(standalone)

    const ios =
      /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      !(window as any).MSStream

    setIsIOS(ios)

    const alreadyDismissed = localStorage.getItem('pwa-prompt-dismissed')
    if (alreadyDismissed) setDismissed(true)

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  function dismiss() {
    localStorage.setItem('pwa-prompt-dismissed', '1')
    setDismissed(true)
  }

  async function install() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setDeferredPrompt(null)
      setDismissed(true)
    }
  }

  // Don't show if: already installed, dismissed, or nothing to show
  if (isStandalone || dismissed) return null
  if (!deferredPrompt && !isIOS) return null

  return (
    <div className="fixed bottom-24 left-4 right-4 z-[9996] sm:left-auto sm:right-8 sm:w-80">
      <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-4 shadow-2xl shadow-black/50">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="w-10 h-10 rounded-xl bg-purple-600/20 flex items-center justify-center flex-shrink-0">
            <Download className="w-5 h-5 text-purple-400" />
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">Install Factory 23</p>
            <p className="text-xs text-white/50 mt-0.5 leading-relaxed">
              {isIOS
                ? 'Tap the share button then "Add to Home Screen"'
                : 'Add to your home screen for the best experience'}
            </p>

            {isIOS && (
              <div className="flex items-center gap-1 mt-2 text-purple-400">
                <Share className="w-3.5 h-3.5" />
                <span className="text-xs">Share → Add to Home Screen</span>
              </div>
            )}
          </div>

          {/* Close */}
          <button
            onClick={dismiss}
            className="text-white/30 hover:text-white/70 transition-colors flex-shrink-0"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!isIOS && deferredPrompt && (
          <button
            onClick={install}
            className="mt-3 w-full py-2 bg-purple-600 hover:bg-purple-700 active:scale-95 transition-all rounded-xl text-sm font-medium text-white"
          >
            Install
          </button>
        )}
      </div>
    </div>
  )
}
```

Then add it to the appropriate layout. Since the dashboard has the FloatingAIButton, add the install prompt to the dashboard layout (or root layout):

```tsx
// In your dashboard layout or root layout
import { InstallPrompt } from '@/components/pwa/install-prompt'

// Add inside the body
<InstallPrompt />
```

---

## 9. Security Headers in `next.config.ts`

The updated `next.config.ts` in [Section 5a](#5a-update-nextconfigts) already includes security headers. To review what each does:

| Header | Value | Purpose |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | Prevents MIME sniffing attacks |
| `X-Frame-Options` | `DENY` | Blocks iframe embedding (clickjacking) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limits referrer exposure to cross-origin requests |
| `Cache-Control` on `/sw.js` | `no-cache, no-store, must-revalidate` | Ensures users always get the latest service worker |
| `Content-Security-Policy` on `/sw.js` | `default-src 'self'` | Restricts what the service worker can load |

---

## 10. Testing Locally

### Enable HTTPS in development

Service workers require HTTPS (or `localhost`). The `localhost` exemption means `npm run dev` works for basic testing. For HTTPS:

```bash
next dev --experimental-https
```

This generates a self-signed cert. Your browser will warn — accept and proceed.

### Disable the `disable` flag temporarily

In `next.config.ts`, the Serwist config has `disable: process.env.NODE_ENV === 'development'`. To test the service worker in dev:

```ts
disable: false, // temporarily
```

Or run a production build:

```bash
npm run build && npm run start
```

### Chrome DevTools checklist

1. Open DevTools → **Application** tab
2. **Manifest**: Verify all fields, icons load correctly, "Installability" shows no errors
3. **Service Workers**: Confirm `sw.js` is registered, status is "activated and running"
4. **Cache Storage**: Confirm precached assets appear under `serwist-precache-*`
5. **Network** tab: Check "Offline" checkbox, navigate around — pages that were visited should load from cache
6. **Lighthouse**: Run the PWA audit — aim for all green checkmarks

### Common issues

| Issue | Fix |
|---|---|
| Service worker not updating | Hard reload (`Cmd+Shift+R`) or DevTools → Service Workers → "Update on reload" |
| Manifest icons not found | Check paths in `public/icons/` match exactly what's in `manifest.ts` |
| `Cannot use import statement` in sw.ts | Ensure `tsconfig.json` has `"lib": ["webworker"]` |
| Install prompt never shows | Only appears after ~30 seconds of use in Chrome; use DevTools → Application → Manifest → "Add to homescreen" to force it |

---

## 11. Production Checklist

Before shipping, verify:

- [ ] All icon sizes exist in `public/icons/` — especially 192×192 and 512×512 maskable
- [ ] `app/manifest.ts` `start_url` points to an authenticated route the user lands on (`/dashboard`)
- [ ] Service worker is not disabled in the production build (check the `disable` flag)
- [ ] HTTPS is configured on the production domain
- [ ] Lighthouse PWA audit passes (installable + works offline)
- [ ] The `/offline` page renders correctly with no JS
- [ ] `Cache-Control: no-cache` is set on `/sw.js` at the CDN/proxy layer as well (not just in `headers()`)
- [ ] API caching strategy respects auth — never cache responses containing another user's data
- [ ] Test on a real iOS device (Safari's PWA support differs from DevTools simulation)

---

## File Summary

After implementation, new/changed files:

```
app/
  manifest.ts          ← NEW: Web App Manifest
  layout.tsx           ← CHANGED: viewport export + PWA meta tags
  sw.ts                ← NEW: Serwist service worker source
  offline/
    page.tsx           ← NEW: Offline fallback page

components/
  pwa/
    install-prompt.tsx ← NEW: Install prompt component

public/
  icons/               ← NEW: All PWA icon sizes
    icon-72x72.png
    icon-96x96.png
    icon-128x128.png
    icon-144x144.png
    icon-152x152.png
    icon-192x192.png
    icon-384x384.png
    icon-512x512.png
    shortcut-dashboard.png
    shortcut-crm.png
    shortcut-projects.png
  screenshots/
    dashboard.png
  sw.js                ← AUTO-GENERATED by Serwist at build time (do not edit)

next.config.ts         ← CHANGED: Serwist wrapper + security headers
```

---

## References

- [Next.js PWA Guide](node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md)
- [Next.js Manifest File Convention](node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/manifest.md)
- [Serwist Documentation](https://serwist.pages.dev/)
- [Serwist Next.js Example](https://github.com/serwist/serwist/tree/main/examples/next-basic)
- [MDN Web App Manifest](https://developer.mozilla.org/en-US/docs/Web/Manifest)
- [Maskable.app — Test maskable icons](https://maskable.app/)
