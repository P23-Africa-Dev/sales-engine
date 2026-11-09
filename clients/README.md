This repository contains the Sales Engine client frontend at the root, the Laravel API in `backend/`, and the platform admin dashboard in `admin/`.

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

---

## Sales Engine Client App (demo build)

This copy runs **without any backend**. Every API call is answered by `lib/mock/mock-api.ts`
from **`data/data.json`** — edit that file to change what the pages show.
Changes you make in the UI (new leads, stage moves, notes) reset on refresh.

- `npm run dev` → http://localhost:3000 → click **Login** (demo credentials are prefilled).
- **Client ⇄ Admin toggle:** open the profile menu (top-right avatar) → *Admin view*.
  - Client view: `/sales-engine`, `/smart-leads`, `/social-listening`, `/crm`
  - Admin view (moved from `sales-engine/admin`): `/admin`, `/admin/smart-leads`, `/admin/social-listening`, `/admin/crm`, `/admin/account-management`
  - Admin code lives in `app/admin`, `components/admin`, `lib/admin`, `data/admin`.
- To go live later: remove `installMockApi()` from `components/providers/query-provider.tsx`.
