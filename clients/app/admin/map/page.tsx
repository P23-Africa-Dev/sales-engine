import { isDemoMarket } from '@/lib/map/factory-demo';
import { MapScreens } from './map-screens';

export default async function MapPage({ searchParams }: { searchParams: Promise<{ market?: string; company?: string }> }) {
  const { market, company } = await searchParams;
  const selectedMarket = market === 'lagos' ? undefined : market && isDemoMarket(market) ? market : 'ghana';
  const companyId = company && /^\d+$/.test(company) ? Number(company) : undefined;
  return <MapScreens key={selectedMarket ?? 'lagos'} market={selectedMarket} companyId={companyId} />;
}
