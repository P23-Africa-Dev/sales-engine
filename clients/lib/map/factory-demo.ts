export const DEMO_MARKETS = {
  ghana: { name: 'Ghana', city: 'Accra', center: [-0.195, 5.623], agents: ['Ama Mensah', 'Kwame Owusu'] },
  kenya: { name: 'Kenya', city: 'Nairobi', center: [36.818, -1.282], agents: ['Amina Otieno', 'Brian Kamau'] },
} as const;

export type DemoMarket = keyof typeof DEMO_MARKETS;
export type Coordinate = [number, number];
export const DEMO_COLORS = ['#087e81', '#7356c1'];
export const DEMO_WEEKS = ['2026-11-16', '2026-11-09', '2026-11-02', '2026-10-26', '2026-10-19', '2026-10-12'];
export const RETENTION_WEEKS = 4;

export function isDemoMarket(value: string | null): value is DemoMarket {
  return value === 'ghana' || value === 'kenya';
}

export function getDemoCompanies(market: DemoMarket) {
  const { center, city } = DEMO_MARKETS[market];
  const sectors = ['Logistics', 'Foods', 'Retail', 'Manufacturing', 'Energy', 'Packaging'];
  const names = ['Atlas', 'Cedar', 'Summit', 'Harbor', 'Meridian', 'Beacon', 'Cobalt', 'Delta', 'Acacia', 'Terrace'];
  let seed = 23;
  function offset() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296 - 0.5;
  }
  return Array.from({ length: 300 }, (_, id) => {
    const sector = sectors[id % sectors.length];
    const longitude = offset();
    const latitude = offset();
    return {
      id,
      name: `${city} ${names[Math.floor(id / 6) % names.length]} ${sector} ${1 + Math.floor(id / 60)}`,
      coordinates: [center[0] + longitude * 0.16, center[1] + latitude * 0.12] as Coordinate,
      signal: id % 7 === 0 ? 'Expansion announced' : id % 11 === 0 ? 'Hiring sales staff' : '',
    };
  });
}

export function getDemoVisits(market: DemoMarket) {
  const companies = getDemoCompanies(market);
  return DEMO_WEEKS.flatMap((week, weekIndex) =>
    Array.from({ length: 24 - weekIndex * 2 }, (_, index) => {
      const agent = index % 2;
      const company = companies[(weekIndex * 43 + index * 13) % companies.length];
      const date = new Date(`${week}T09:00:00Z`);
      date.setUTCDate(date.getUTCDate() + index % 5);
      date.setUTCHours(9 + index % 7);
      // Keep the current demo week aligned with the demonstration date.
      if (weekIndex === 0 && date.toISOString().slice(0, 10) > '2026-11-17') {
        date.setUTCDate(17);
      }
      return {
        id: `${week}-${index}`, week, date: date.toISOString(), agent, company,
        duration: 15 + (index * 7) % 42,
        outcome: index % 5 === 0 ? 'Rescheduled' : index % 3 === 0 ? 'Follow-up' : 'Completed',
      };
    }).sort((a, b) => a.date.localeCompare(b.date))
  );
}

export type DemoTerritory = {
  id: number; name: string; agent: number; bounds: [number, number, number, number];
};

export function getDemoTerritories(market: DemoMarket): DemoTerritory[] {
  const [x, y] = DEMO_MARKETS[market].center;
  return [
    { id: 0, name: 'North', agent: 0, bounds: [x - 0.08, y + 0.025, x + 0.08, y + 0.061] },
    { id: 1, name: 'South', agent: 1, bounds: [x - 0.08, y - 0.061, x + 0.08, y - 0.025] },
    { id: 2, name: 'East', agent: 0, bounds: [x, y - 0.025, x + 0.08, y + 0.025] },
    { id: 3, name: 'West', agent: 1, bounds: [x - 0.08, y - 0.025, x, y + 0.025] },
  ];
}

export function territoryContains(territory: DemoTerritory, [x, y]: Coordinate) {
  const [west, south, east, north] = territory.bounds;
  return west <= x && x <= east && south <= y && y <= north;
}

export function getDemoCoverage(territory: DemoTerritory, market: DemoMarket) {
  const assignedCompanies = getDemoCompanies(market).filter((company) => territoryContains(territory, company.coordinates));
  const visited = new Set(getDemoVisits(market)
    .filter((visit) => visit.agent === territory.agent && visit.outcome !== 'Rescheduled' && territoryContains(territory, visit.company.coordinates))
    .map((visit) => visit.company.id));
  return assignedCompanies.length ? Math.round(100 * visited.size / assignedCompanies.length) : 0;
}
