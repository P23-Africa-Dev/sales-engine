import roadRoutes from '@/data/demo-road-routes.json';

export const DEMO_MARKETS = {
  ghana: { name: 'Ghana', city: 'Accra', center: [-0.195, 5.623], agents: ['Ama Mensah', 'Kwame Owusu', 'Akosua Boateng', 'Kofi Asante', 'Abena Osei', 'Yaw Adjei', 'Efua Agyeman', 'Kojo Appiah', 'Adwoa Danso', 'Kwesi Aidoo', 'Esi Nyarko', 'Nana Darko', 'Afia Opoku', 'Fiifi Quaye', 'Akua Addo', 'Kwaku Sarpong', 'Araba Arthur', 'Selorm Agbo', 'Dzifa Dede', 'Elorm Tetteh'] },
  kenya: { name: 'Kenya', city: 'Nairobi', center: [36.818, -1.282], agents: ['Amina Otieno', 'Brian Kamau', 'Grace Wanjiku', 'David Mwangi', 'Faith Achieng', 'Peter Kiptoo', 'Mercy Njeri', 'James Ochieng', 'Sharon Muthoni', 'Daniel Odhiambo', 'Esther Wambui', 'Kevin Mutua', 'Lucy Chebet', 'Samuel Kariuki', 'Ruth Atieno', 'Joseph Njoroge', 'Mary Wairimu', 'Victor Omondi', 'Diana Moraa', 'Eric Maina'] },
} as const;

export type DemoMarket = keyof typeof DEMO_MARKETS;
export type Coordinate = [number, number];
export const DEMO_COLORS = Array.from({ length: 20 }, (_, index) => `hsl(${(index * 137.5) % 360}, 60%, 38%)`);
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
    Array.from({ length: 60 - weekIndex * 4 }, (_, index) => {
      const agent = index % DEMO_MARKETS[market].agents.length;
      const assigned = companies.filter((company) => territoryContains(getDemoTerritories(market)[agent], company.coordinates));
      const company = assigned[(weekIndex + Math.floor(index / 20)) % assigned.length];
      const date = new Date(`${week}T09:00:00Z`);
      date.setUTCDate(date.getUTCDate() + index % 5);
      date.setUTCHours(9 + index % 7);
      // Keep the current demo week aligned with the demonstration date.
      if (weekIndex === 0 && date.toISOString().slice(0, 10) > '2026-11-20') {
        date.setUTCDate(20);
      }
      return {
        id: `${week}-${index}`, week, date: date.toISOString(), agent, company,
        duration: 15 + (index * 7) % 42,
        outcome: (agent + Math.floor(index / 20)) % 5 === 0 ? 'Rescheduled' : index % 3 === 0 ? 'Follow-up' : 'Completed',
      };
    }).sort((a, b) => a.date.localeCompare(b.date))
  );
}

export type DemoTerritory = {
  id: number; name: string; agent: number; bounds: [number, number, number, number];
};

export function getDemoTerritories(market: DemoMarket): DemoTerritory[] {
  const [x, y] = DEMO_MARKETS[market].center;
  return DEMO_MARKETS[market].agents.map((_, agent) => {
    const col = agent % 5;
    const row = Math.floor(agent / 5);
    return { id: agent, name: `${DEMO_MARKETS[market].city} · Zone ${agent + 1}`, agent,
      bounds: [x - 0.08 + col * 0.032, y - 0.06 + row * 0.03,
        x - 0.08 + (col + 1) * 0.032, y - 0.06 + (row + 1) * 0.03] as DemoTerritory['bounds'] };
  });
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

export type DemoAgentStatus = 'Active' | 'Moving' | 'Idle' | 'Offline';

/** Bundled OSRM driving geometry based on OpenStreetMap; no runtime routing requests. */
export function getDemoAgents(market: DemoMarket) {
  const territories = getDemoTerritories(market);
  const companies = getDemoCompanies(market);
  return DEMO_MARKETS[market].agents.map((name, id) => {
    const territory = territories[id];
    const status: DemoAgentStatus = id % 10 === 9 ? 'Offline' : id % 5 === 3 ? 'Idle' : id % 4 === 0 ? 'Active' : 'Moving';
    const road = roadRoutes[market][id];
    const customer = companies[road.endCompanyId];
    const origin = companies[road.startCompanyId];
    const route = road.coordinates as Coordinate[];
    const lengths = route.slice(1).map((to, index) => distanceMeters(route[index], to));
    const cumulative = [0];
    lengths.forEach((length) => cumulative.push(cumulative[cumulative.length - 1] + length));
    const returnRoute = road.returnCoordinates as Coordinate[];
    const returnCumulative = [0];
    returnRoute.slice(1).forEach((to, index) => returnCumulative.push(returnCumulative[returnCumulative.length - 1] + distanceMeters(returnRoute[index], to)));
    return { id, name, territory, status, route, returnRoute, customer, origin, cumulative, returnCumulative,
      returnDistance: returnCumulative[returnCumulative.length - 1],
      distance: cumulative[cumulative.length - 1], speed: 9 + id % 4,
      phaseOffset: cumulative[cumulative.length - 1] / (9 + id % 4) * (id % 7) * 0.09,
      activity: status === 'Moving' || status === 'Active' ? 'Travelling to customer visit' : status === 'Idle' ? 'Taking a scheduled break' : 'Shift ended',
      initials: name.split(' ').map((part) => part[0]).join('') };

  });
}

function distanceMeters(from: Coordinate, to: Coordinate) {
  return Math.hypot((to[0] - from[0]) * Math.cos((from[1] + to[1]) / 2 * Math.PI / 180), to[1] - from[1]) * 111320;
}

export type DemoAgent = ReturnType<typeof getDemoAgents>[number];
export const isWorkingDemoAgent = (agent: DemoAgent) => agent.status === 'Moving' || agent.status === 'Active';
export const DEMO_VISIT_SECONDS = 8;

/** One clock drives markers, camera, ETA, task changes and arrival records. */
export function getDemoAgentTelemetry(agent: DemoAgent, elapsedSeconds: number) {
  const travelling = isWorkingDemoAgent(agent);
  const outboundSeconds = agent.distance / agent.speed;
  const returnSeconds = agent.returnDistance / agent.speed;
  const cycleSeconds = outboundSeconds + returnSeconds + 2 * DEMO_VISIT_SECONDS;
  const time = Math.max(0, elapsedSeconds) + agent.phaseOffset;
  const cycle = Math.floor(time / cycleSeconds);
  const phase = time % cycleSeconds;
  const returning = travelling && phase >= outboundSeconds + DEMO_VISIT_SECONDS;
  const leg = cycle * 2 + (returning ? 1 : 0);
  const localTime = returning ? phase - outboundSeconds - DEMO_VISIT_SECONDS : phase;
  const travelSeconds = returning ? returnSeconds : outboundSeconds;
  const route = returning ? agent.returnRoute : agent.route;
  const cumulative = returning ? agent.returnCumulative : agent.cumulative;
  const total = returning ? agent.returnDistance : agent.distance;
  const arrived = localTime >= travelSeconds;
  const progress = Math.min(1, localTime / travelSeconds);
  const distance = travelling ? total * progress : 0;
  let lo = 0, hi = route.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >>> 1;
    if (cumulative[mid] <= distance) lo = mid; else hi = mid;
  }
  const from = route[lo], to = route[hi];
  const segmentLength = cumulative[hi] - cumulative[lo];
  const fraction = segmentLength ? (distance - cumulative[lo]) / segmentLength : 0;
  const coordinates: Coordinate = [from[0] + (to[0] - from[0]) * fraction, from[1] + (to[1] - from[1]) * fraction];
  const heading = (Math.atan2((to[0] - from[0]) * Math.cos(coordinates[1] * Math.PI / 180), to[1] - from[1]) * 180 / Math.PI + 360) % 360;
  const destination = returning ? agent.origin : agent.customer;
  return { coordinates, heading, leg, arrived: travelling && arrived,
    visitSecondsRemaining: travelling && arrived ? Math.ceil(travelSeconds + DEMO_VISIT_SECONDS - localTime) : 0,
    status: travelling ? arrived ? 'Active' : 'Moving' : agent.status,
    destination, destinationCoordinates: route[route.length - 1],
    task: `Customer visit — ${destination.name}`,
    etaSeconds: travelling ? Math.max(0, Math.ceil(travelSeconds - localTime)) : null,
    route,
    remainingRoute: travelling ? [coordinates, ...route.slice(hi)] : [],
    activity: travelling ? arrived ? 'Arrived · Customer check-in' : 'Travelling to customer visit' : agent.activity,
  };
}

export function getDemoAgentPosition(agent: DemoAgent, elapsedSeconds: number): Coordinate {
  return getDemoAgentTelemetry(agent, elapsedSeconds).coordinates;
}

export function getDemoActivities(market: DemoMarket) {
  const types = ['Field visit', 'Customer interaction', 'Check-in', 'Completed task', 'Territory coverage', 'Agent movement'];
  const agents = getDemoAgents(market);
  return getDemoVisits(market).filter((visit) => visit.week === DEMO_WEEKS[0]).map((visit, index) => ({
    id: visit.id, agent: visit.agent, agentName: agents[visit.agent].name,
    type: types[(Math.floor(index / 20) + visit.agent) % types.length],
    location: visit.company.name, coordinates: visit.company.coordinates,
    date: visit.date, status: visit.outcome, territory: agents[visit.agent].territory.name,
    companyId: visit.company.id,
  })).sort((a, b) => b.date.localeCompare(a.date));
}
