'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { FactoryDemoTabs } from './factory-demo-tabs';
import {
  DEMO_COLORS, DEMO_MARKETS, DEMO_WEEKS, RETENTION_WEEKS, getDemoCompanies, getDemoTerritories, getDemoVisits,
  territoryContains, type DemoMarket,
} from '@/lib/map/factory-demo';

const tabs = [['overview', 'Overview'], ['visits', 'Visit history'], ['weekly', 'Weekly activity'], ['monthly', 'Monthly summary'], ['archive', 'Archive']] as const;
type Tab = typeof tabs[number][0];
const outcomes = ['Completed', 'Follow-up', 'Rescheduled'];
const outcomeColors = ['#087e81', '#7356c1', '#c56a21'];
const card = 'min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';
const control = 'text-dash-dark rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium';
const shortDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const visitDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });

function labelWeek(week: string) {
  return `Week of ${shortDate.format(new Date(week))}`;
}

export function FactoryAnalytics({ market, companyId, initialTab }: { market: DemoMarket; companyId?: number; initialTab?: string }) {
  const { agents, name } = DEMO_MARKETS[market];
  const [tab, setTab] = useState<Tab>(tabs.find(([id]) => id === initialTab)?.[0] ?? (companyId !== undefined ? 'visits' : 'overview'));
  const [week, setWeek] = useState(DEMO_WEEKS[0]);
  const [month, setMonth] = useState('2026-11');
  const [agent, setAgent] = useState('all');
  const [companyFilter, setCompanyFilter] = useState(companyId);
  const [archive, setArchive] = useState<Record<string, string>>({});
  const [archiveError, setArchiveError] = useState('');
  const archiveKey = `factory-map-archive-${market}`;
  const visits = useMemo(() => getDemoVisits(market), [market]);
  const companies = useMemo(() => getDemoCompanies(market), [market]);
  const [territories, setTerritories] = useState(() => getDemoTerritories(market));
  const [showArchivedWeek, setShowArchivedWeek] = useState(false);

  useEffect(() => {
    try {
      const storedArchive = localStorage.getItem(archiveKey);
      if (storedArchive) setArchive(JSON.parse(storedArchive));
      const storedTerritories = localStorage.getItem(`factory-map-territories-${market}`);
      if (storedTerritories) setTerritories(JSON.parse(storedTerritories));
    } catch {
      setArchiveError('Saved activity data could not be loaded in this browser.');
    }
  }, [archiveKey, market]);

  const activeWeeks = DEMO_WEEKS.filter((item) => !archive[item]);
  const agentVisits = visits.filter((visit) => agent === 'all' || visit.agent === Number(agent));
  const period = agentVisits.filter((visit) => {
    if (tab === 'weekly') return visit.week === week;
    if (tab === 'monthly') return visit.date.startsWith(month);
    if (tab === 'visits') {
      return companyFilter === undefined
        ? visit.week === week && (showArchivedWeek || !archive[visit.week])
        : companyFilter === visit.company.id;
    }
    return !archive[visit.week];
  });
  const recorded = period.filter((visit) => visit.outcome !== 'Rescheduled');
  const totalMinutes = recorded.reduce((total, visit) => total + visit.duration, 0);
  const weekly = (tab === 'overview' ? activeWeeks : [...new Set(period.map((visit) => visit.week))]).slice().reverse()
    .map((item) => ({ week: shortDate.format(new Date(item)), visits: period.filter((visit) => visit.week === item).length }));
  const byAgent = agents.map((person, index) => ({
    name: person, visits: recorded.filter((visit) => visit.agent === index).length, color: DEMO_COLORS[index],
  }));
  const byOutcome = outcomes.map((outcome, index) => ({
    name: outcome, value: period.filter((visit) => visit.outcome === outcome).length, color: outcomeColors[index],
  }));
  const byTerritory = territories.map((territory) => {
    const covered = new Set(recorded.filter((visit) => visit.agent === territory.agent && territoryContains(territory, visit.company.coordinates)).map((visit) => visit.company.id));
    const total = companies.filter((company) => territoryContains(territory, company.coordinates)).length;
    return { name: territory.name, coverage: total ? Math.round(covered.size / total * 100) : 0 };
  });

  function updateArchive(item: string, restore: boolean) {
    if (!restore && DEMO_WEEKS.indexOf(item) < RETENTION_WEEKS) return;
    const next = { ...archive };
    if (restore) delete next[item];
    else next[item] = new Date().toISOString();
    try {
      localStorage.setItem(archiveKey, JSON.stringify(next));
      setArchive(next);
      setArchiveError('');
    } catch {
      setArchiveError('The archive change could not be saved in this browser.');
    }
  }

  return (
    <main className="min-h-[75vh] bg-[#f5f8f7] px-4 py-6 text-dash-dark md:px-8">
      <div className="mx-auto max-w-7xl">
        <Link href={`/admin/map?market=${market}`} className="inline-flex items-center gap-2 text-sm font-semibold text-teal-800"><ArrowLeft size={16} /> Operational map</Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-semibold text-teal-800">{name}</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Field activity analytics</h1></div>
          <FactoryDemoTabs market={market} analytics />
        </div>
        <nav aria-label="Analytics views" className="mt-6 flex flex-wrap gap-1 border-b border-slate-200">
          {tabs.map(([id, label]) => <button type="button" key={id} aria-current={tab === id ? 'page' : undefined}
            className={`border-b-2 px-3 py-3 text-sm font-semibold ${tab === id ? 'border-teal-700 text-teal-800' : 'border-transparent text-slate-600 hover:text-teal-800'}`}
            onClick={() => { setTab(id); setShowArchivedWeek(false); if (archive[week]) setWeek(activeWeeks[0]); }}>
            {label}
          </button>)}
        </nav>
        {tab === 'archive' ? (
          <section className={`${card} mt-5`}>
            <h2 className="font-bold">Weekly archive</h2>
            <p className="mb-4 mt-1 text-sm text-slate-600">The latest {RETENTION_WEEKS} weeks stay active. Older weeks can be archived and restored in this browser.</p>
            {archiveError && <p role="alert" className="text-sm text-red-700">{archiveError}</p>}
            {DEMO_WEEKS.map((item, index) => (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 py-3" key={item}>
                <div><p className="text-sm font-semibold">{labelWeek(item)}</p><p className="text-xs text-slate-600">{archive[item] ? `Archived ${shortDate.format(new Date(archive[item]))}` : index >= RETENTION_WEEKS ? 'Eligible for archive' : 'Active'}</p></div>
                <div className="flex gap-2">
                  {archive[item] && <button type="button" className={control} onClick={() => { setCompanyFilter(undefined); setAgent('all'); setWeek(item); setShowArchivedWeek(true); setTab('visits'); }}>View visits</button>}
                  {index >= RETENTION_WEEKS && <button type="button" className={control} onClick={() => updateArchive(item, Boolean(archive[item]))}>{archive[item] ? 'Restore' : 'Archive'}</button>}
                </div>
              </div>
            ))}
          </section>
        ) : <>
          <div className="my-4 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm font-semibold">Agent<select className={control} value={agent} onChange={(event) => setAgent(event.target.value)}>
              <option value="all">All agents</option>{agents.map((person, index) => <option value={index} key={person}>{person}</option>)}
            </select></label>
            {(tab === 'weekly' || (tab === 'visits' && companyFilter === undefined)) && <label className="flex items-center gap-2 text-sm font-semibold">Week
              <select className={control} value={week} onChange={(event) => { setWeek(event.target.value); setShowArchivedWeek(Boolean(archive[event.target.value])); }}>
                {(showArchivedWeek ? DEMO_WEEKS : activeWeeks).map((item) => <option key={item} value={item}>{labelWeek(item)}{archive[item] ? ' (archived)' : ''}</option>)}
              </select>
            </label>}
            {tab === 'monthly' && <label className="flex items-center gap-2 text-sm font-semibold">Month<select className={control} value={month} onChange={(event) => setMonth(event.target.value)}>
              <option value="2026-11">November 2026</option><option value="2026-10">October 2026</option>
            </select></label>}
            {tab === 'visits' && companyFilter !== undefined && <button type="button" className={control} onClick={() => setCompanyFilter(undefined)}>{companies[companyFilter]?.name ?? 'Company filter'} · Clear</button>}
          </div>
          <section aria-label="Activity totals" className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ['Recorded visits', recorded.length], ['Companies visited', new Set(recorded.map((visit) => visit.company.id)).size],
              ['Time on site', `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`],
              ['Completed', period.length ? `${Math.round(byOutcome[0].value / period.length * 100)}%` : '0%'],
            ].map(([label, value]) => <div key={label} className={card}><p className="text-sm text-slate-600">{label}</p><p className="mt-1 text-2xl font-bold tabular-nums">{value}</p></div>)}
          </section>
          {tab !== 'visits' && <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <section className={card}><h2 className="mb-3 font-bold">Visits by agent</h2><div className="h-56">
              <ResponsiveContainer width="100%" height="100%"><BarChart data={byAgent} accessibilityLayer>
                <CartesianGrid vertical={false} stroke="#e2e8f0" /><XAxis dataKey="name" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="visits" name="Recorded visits" radius={[5, 5, 0, 0]}>{byAgent.map((item) => <Cell key={item.name} fill={item.color} />)}</Bar>
              </BarChart></ResponsiveContainer>
            </div></section>
            <section className={card}><h2 className="font-bold">Visit outcomes</h2><div className="h-44">
              {period.length > 0 ? <ResponsiveContainer width="100%" height="100%"><PieChart accessibilityLayer><Tooltip /><Pie data={byOutcome} dataKey="value" nameKey="name" innerRadius={42} outerRadius={68}>{byOutcome.map((item) => <Cell key={item.name} fill={item.color} />)}</Pie></PieChart></ResponsiveContainer> : <p className="py-8 text-sm text-slate-600">No visits in this period.</p>}
            </div><ul className="flex flex-wrap gap-4 text-xs text-slate-700">{byOutcome.map((item) => <li key={item.name} className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: item.color }} />{item.name} ({item.value})</li>)}</ul></section>
            <section className={card}><h2 className="mb-3 font-bold">{tab === 'weekly' ? 'Visits by day' : 'Visits by week'}</h2><div className="h-56">
              <ResponsiveContainer width="100%" height="100%"><LineChart data={tab === 'weekly' ? Array.from({ length: 7 }, (_, offset) => {
                const day = new Date(week);
                day.setUTCDate(day.getUTCDate() + offset);
                return { week: shortDate.format(day), visits: period.filter((visit) => visit.date.startsWith(day.toISOString().slice(0, 10))).length };
              }) : weekly} accessibilityLayer><CartesianGrid vertical={false} stroke="#e2e8f0" /><XAxis dataKey="week" /><YAxis allowDecimals={false} /><Tooltip /><Line type="monotone" dataKey="visits" name="Visits including rescheduled" stroke="#087e81" strokeWidth={3} /></LineChart></ResponsiveContainer>
            </div></section>
            <section className={card}><h2 className="mb-2 font-bold">Assigned territory coverage</h2><p className="mb-4 text-sm text-slate-600">Share of companies visited by the assigned agent in this period.</p><div className="space-y-3">
              {byTerritory.map((item, index) => <div key={territories[index].id}><div className="mb-1 flex justify-between gap-2 text-sm"><span>{item.name} · {agents[territories[index].agent]}</span><span>{item.coverage}%</span></div><div className="h-2 rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${item.coverage}%`, background: DEMO_COLORS[territories[index].agent] }} /></div></div>)}
            </div></section>
          </div>}
          {(tab === 'visits' || tab === 'weekly') && <section className={`${card} mt-4 overflow-x-auto`}>
            <h2 className="mb-3 font-bold">Visit log <span className="text-sm font-normal text-slate-600">· Times in UTC</span></h2>
            {period.length ? <table className="w-full min-w-[35rem] text-left text-sm">
              <thead className="border-b border-slate-200 text-slate-600"><tr>{['Company', 'Agent', 'Time', 'Outcome', 'On site'].map((title) => <th scope="col" className="px-2 py-2 font-semibold" key={title}>{title}</th>)}</tr></thead>
              <tbody>{period.slice().reverse().map((visit) => <tr key={visit.id} className="border-b border-slate-100"><td className="px-2 py-2">
                <Link className="inline-flex items-center gap-1 font-semibold text-teal-800 hover:underline" href={`/admin/map?market=${market}&company=${visit.company.id}`}>{visit.company.name}<ArrowUpRight size={13} /></Link>
              </td><td className="px-2">{agents[visit.agent]}</td><td className="px-2">{visitDate.format(new Date(visit.date))}</td><td className="px-2">{visit.outcome}</td><td className="px-2">{visit.outcome === 'Rescheduled' ? '—' : `${visit.duration} min`}</td></tr>)}</tbody>
            </table> : <p className="text-sm text-slate-600">No visits match these filters.</p>}
          </section>}
        </>}
      </div>
    </main>
  );
}
