import { isDemoMarket } from '@/lib/map/factory-demo';
import { LagosMapAnalytics } from '@/components/map/lagos-map-analytics';
import { FactoryAnalytics } from '@/components/map/factory-analytics';

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ market?: string; company?: string; tab?: string; agent?: string }> }) {
  const { market, company, tab, agent } = await searchParams;
  if (!market || !isDemoMarket(market)) {
    return <LagosMapAnalytics agentId={agent && /^\d+$/.test(agent) ? Number(agent) : undefined} initialTab={tab} />;
  }
  const selectedMarket = market;
  const companyId = company && /^\d+$/.test(company) ? Number(company) : undefined;
  return <FactoryAnalytics key={`${selectedMarket}-${companyId ?? ''}-${tab ?? ''}`} market={selectedMarket} companyId={companyId} initialTab={tab} />;
}
