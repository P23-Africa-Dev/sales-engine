import { describe, expect, it } from 'vitest';
import { DEMO_MARKETS, getDemoActivities, getDemoAgents, getDemoAgentPosition, getDemoAgentTelemetry, isWorkingDemoAgent, DEMO_VISIT_SECONDS, getDemoTerritories, getDemoVisits, territoryContains } from './factory-demo';

for (const market of ['ghana', 'kenya'] as const) {
  describe(`${market} interconnected demo`, () => {
    it('populates every agent with a territory, activity history and supported status', () => {
      const agents = getDemoAgents(market);
      const activities = getDemoActivities(market);
      expect(agents).toHaveLength(20);
      expect(new Set(agents.map((agent) => agent.status))).toEqual(new Set(['Active', 'Moving', 'Idle', 'Offline']));
      expect(activities.length).toBeGreaterThanOrEqual(50);
      expect(new Set(activities.map((activity) => activity.date.slice(0, 10))).size).toBeGreaterThan(2);
      expect(new Set(activities.map((activity) => activity.type)).size).toBe(6);
      agents.forEach((agent) => {
        expect(activities.some((activity) => activity.agent === agent.id)).toBe(true);
        expect(agent.name).toBe(DEMO_MARKETS[market].agents[agent.id]);
        expect(territoryContains(agent.territory, agent.customer.coordinates)).toBe(true);
        expect(agent.route.length).toBeGreaterThan(5);
        expect(agent.returnRoute[0]).toEqual(agent.route.at(-1));
        expect(agent.returnRoute.at(-1)).toEqual(agent.route[0]);
      });
      const territories = getDemoTerritories(market);
      getDemoVisits(market).forEach((visit) => expect(territoryContains(territories[visit.agent], visit.company.coordinates)).toBe(true));
    });
    it('runs exactly fourteen on-duty agents, including the formerly stationary Active agents', () => {
      const working = getDemoAgents(market).filter(isWorkingDemoAgent);
      expect(working).toHaveLength(14);
      expect(working.every((agent) => getDemoAgentTelemetry(agent, 0).status === 'Moving')).toBe(true);
      working.forEach((agent) => {
        const changed = Array.from({ length: 20 }, (_, time) => getDemoAgentPosition(agent, time * 2));
        expect(new Set(changed.map((position) => position.join(','))).size).toBeGreaterThan(1);
        const arrivalTime = agent.distance / agent.speed - agent.phaseOffset;
        // Use an outbound arrival in a later cycle so all phase offsets are positive.
        const cycle = (agent.distance + agent.returnDistance) / agent.speed + DEMO_VISIT_SECONDS * 2;
        const arrival = getDemoAgentTelemetry(agent, arrivalTime + cycle + 1);
        expect(arrival.arrived).toBe(true);
        expect(arrival.status).toBe('Active');
        expect(arrival.etaSeconds).toBe(0);
        expect(arrival.coordinates).toEqual(agent.route.at(-1));
        const next = getDemoAgentTelemetry(agent, arrivalTime + cycle + DEMO_VISIT_SECONDS + 1);
        expect(next.status).toBe('Moving');
        expect(next.destination.id).toBe(agent.origin.id);
      });
    });
    it('keeps stationary agents still and moving agents continuous through reversals', () => {
      getDemoAgents(market).forEach((agent) => {
        let previous = getDemoAgentPosition(agent, 0);
        for (let time = 0.1; time < 1800; time += 0.5) {
          const position = getDemoAgentPosition(agent, time);
          if (!isWorkingDemoAgent(agent)) expect(position).toEqual(previous);
          else expect(Math.hypot(position[0] - previous[0], position[1] - previous[1])).toBeLessThan(0.00008);
          previous = position;
        }
      });
    });
  });
}
