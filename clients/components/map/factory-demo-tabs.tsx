import Link from 'next/link';
import { DEMO_MARKETS, type DemoMarket } from '@/lib/map/factory-demo';

export function FactoryDemoTabs({ market, analytics = false }: { market?: DemoMarket; analytics?: boolean }) {
  const base = analytics ? '/admin/map/analytics' : '/admin/map';
  return (
    <nav aria-label="Demo markets" className="flex gap-0.5 sm:gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
      <Link href={analytics ? base : `${base}?market=lagos`} aria-current={!market ? 'page' : undefined} className={tabClass(!market)}>Lagos</Link>
      {(['ghana', 'kenya'] as const).map((key) => (
        <Link key={key} href={`${base}?market=${key}`} aria-current={market === key ? 'page' : undefined}
          className={tabClass(market === key)}>{DEMO_MARKETS[key].name}</Link>
      ))}
    </nav>
  );
}

function tabClass(active: boolean) {
  return `rounded-xl px-2 py-2 text-xs sm:px-3 font-semibold ${active ? 'bg-[#103644] text-white' : 'text-slate-600 hover:bg-slate-100'}`;
}
