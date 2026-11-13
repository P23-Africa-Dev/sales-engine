import { ONBOARDED_BUSINESSES_DATA } from "./smart-leads";

export const CRM_SNAPSHOT = "2026-10-13";
export const CRM_STAGES = [
  "New",
  "Qualified",
  "Proposal",
  "Negotiation",
  "Won",
  "Lost",
] as const;
export type CrmStage = (typeof CRM_STAGES)[number];
export const CRM_SOURCES = [
  "Smart Leads",
  "Social Listening",
  "Manual / import",
] as const;
export type CrmSource = (typeof CRM_SOURCES)[number];
export type CrmIssue = "Unassigned" | "Missing email" | "Possible duplicate";

export const CRM_INDUSTRIES = [
  "Industrial Automation",
  "Precision Manufacturing",
  "Renewable Energy",
  "Enterprise Cybersecurity",
  "Logistics & Transport",
  "Robotics & AI",
  "Industrial Equipment",
  "Manufacturing",
  "MedTech & Diagnostics",
  "Life Sciences",
  "Enterprise Software",
  "Medical Devices",
  "Banking & FinTech",
  "Cloud & Datacenter",
  "Telecommunications",
  "FMCG & Retail",
  "AgriTech & Commodities",
  "Construction & Real Estate",
] as const;
export type CrmIndustry = (typeof CRM_INDUSTRIES)[number];

export const CRM_BUSINESS_CATEGORIES = [
  "Enterprise Corporate",
  "Mid-Market Growth",
  "OEM & Original Equipment",
  "Wholesale & Distribution",
  "B2B SaaS & Cloud Platform",
  "Systems Integrator & Consultancy",
  "Financial & Regulated Institution",
  "Clinical & Diagnostic Network",
  "Critical Infrastructure Operator",
  "Commercial Fleet & Supply Chain",
] as const;
export type CrmBusinessCategory = (typeof CRM_BUSINESS_CATEGORIES)[number];

export const CRM_CITIES_BY_COUNTRY: Record<string, readonly string[]> = {
  Germany: [
    "Frankfurt",
    "Munich",
    "Berlin",
    "Stuttgart",
    "Cologne",
    "Nuremberg",
    "Hamburg",
  ],
  Switzerland: ["Zurich", "Basel", "Geneva", "Bern"],
  Austria: ["Vienna", "Innsbruck", "Salzburg", "Bregenz"],
  Netherlands: ["Amsterdam", "Rotterdam", "Eindhoven", "Utrecht"],
  Sweden: ["Stockholm", "Gothenburg", "Malmö"],
  Denmark: ["Copenhagen", "Aarhus", "Odense"],
  Norway: ["Oslo", "Bergen", "Stavanger"],
  Poland: ["Warsaw", "Kraków", "Wrocław"],
  "United Kingdom": ["London", "Manchester", "Edinburgh"],
  Nigeria: ["Lagos", "Abuja", "Port Harcourt"],
  Kenya: ["Nairobi", "Mombasa"],
  Ghana: ["Accra", "Kumasi"],
  "South Africa": ["Johannesburg", "Cape Town", "Durban"],
  "United Arab Emirates": ["Dubai", "Abu Dhabi"],
  Latvia: ["Riga", "Liepāja"],
  Lithuania: ["Vilnius", "Kaunas"],
};

export const CRM_COUNTRIES = Object.keys(CRM_CITIES_BY_COUNTRY);
export const CRM_CITIES = Object.values(CRM_CITIES_BY_COUNTRY).flat();

export interface CrmBusiness {
  id: string;
  name: string;
  industry: string;
  owner: string;
  team: string[];
  pipeline: string;
  staleDays: number;
}
export interface CrmRecord {
  id: string;
  businessId: string;
  company: string;
  contact: string;
  role: string;
  email: string;
  owner: string;
  industry: string;
  category: string;
  country: string;
  city: string;
  stage: CrmStage;
  source: CrmSource;
  value: number;
  created: string;
  updated: string;
  due: string | null;
  nextAction: string;
  archived: boolean;
  duplicateOf: string | null;
  duplicateReviewed: boolean;
  notes: { text: string; date: string; actor: string }[];
}
export interface CrmAudit {
  id: string;
  businessId: string;
  recordId?: string;
  action: string;
  detail: string;
  actor: string;
  date: string;
}
export function daysBefore(days: number) {
  const date = new Date(`${CRM_SNAPSHOT}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}
export const CRM_BUSINESSES: CrmBusiness[] = ONBOARDED_BUSINESSES_DATA.map(
  (b) => ({
    id: b.id,
    name: b.company,
    industry: b.industry,
    owner: b.owner,
    team: [b.owner, "Ama Mensah", "Daniel Okafor"],
    pipeline: "Client sales pipeline",
    staleDays: 7,
  }),
);

const INDUSTRY_DEFAULT_CATEGORY: Record<string, CrmBusinessCategory> = {
  "Industrial Automation": "OEM & Original Equipment",
  "Precision Manufacturing": "OEM & Original Equipment",
  "Renewable Energy": "Critical Infrastructure Operator",
  "Enterprise Cybersecurity": "B2B SaaS & Cloud Platform",
  "Logistics & Transport": "Commercial Fleet & Supply Chain",
  "Robotics & AI": "Mid-Market Growth",
  "Industrial Equipment": "Wholesale & Distribution",
  Manufacturing: "Enterprise Corporate",
  "MedTech & Diagnostics": "Clinical & Diagnostic Network",
  "Life Sciences": "Clinical & Diagnostic Network",
  "Enterprise Software": "B2B SaaS & Cloud Platform",
  "Medical Devices": "OEM & Original Equipment",
  "Banking & FinTech": "Financial & Regulated Institution",
  "Cloud & Datacenter": "Critical Infrastructure Operator",
  Telecommunications: "Critical Infrastructure Operator",
  "FMCG & Retail": "Wholesale & Distribution",
  "AgriTech & Commodities": "Commercial Fleet & Supply Chain",
  "Construction & Real Estate": "Systems Integrator & Consultancy",
};

const SEED_COMPANIES_BY_INDUSTRY: Record<CrmIndustry, readonly string[]> = {
  "Industrial Automation": [
    "RheinMechatronics Automation GmbH",
    "Valence PLC Control Systems",
    "KronoMotion Assembly Tech",
    "Aethelgard Factory Robotics",
    "Vektor Line Telemetry AG",
    "Nordic Servo Drive Systems",
    "Apex Actuator Controls Ltd",
    "Stratos Smart Factory SE",
    "DeltaKinematics Engineering",
    " EuroDrive Process Control",
    "Synthetix Industrial Motion",
    "Bergmann Automated Systems",
  ],
  "Precision Manufacturing": [
    "Schiller Micro-Optics GmbH",
    "Geneve Horology Tooling SA",
    "Vanguard Laser Metrology",
    "Alpen CNC Component Works",
    "Edelweiss Micron Stamping",
    "Titan Aerospace Alloys Ltd",
    "Krakow Precision Spindles",
    "Danube Fine Casting AG",
    "Orbis Sapphire Substrates",
    "Nordic Carbide Tooling AB",
    "Veritas Cleanroom Machining",
    "Helvetia Die & Mold Works",
  ],
  "Renewable Energy": [
    "Solis Grid Storage Systems",
    "NordWind Offshore Turbines",
    "Aether Hydrogen Electrolyzers",
    "SunCrest Utility Microgrids",
    "EcoVolt Battery Materials",
    "Baltic Tidal Power Group",
    "Sahara Solar Infrastructure",
    "AlpenHydro Pumped Storage",
    "Vireo Biomass Cogeneration",
    "Meridian Smart Grid Metering",
    "Helios Thermal Collectors",
    "GreenPeak Megawatt Inverters",
  ],
  "Enterprise Cybersecurity": [
    "Aegis Zero-Trust Networks",
    "CipherGuard Cloud Defense",
    "Valkyrie Threat Intelligence",
    "Bastion IAM Security AB",
    "IronClad SOC Automation",
    "Sentinel Endpoint Systems",
    "QuantumVault Cryptography",
    "Kestrel Perimeter Defense",
    "Nexus SIEM Analytics Ltd",
    "Phalanx Sovereign Cyber",
    "Veridian SecOps Platform",
    "Obsidian Attack Surface AI",
  ],
  "Logistics & Transport": [
    "TransEuropa Intermodal SE",
    "Hanseatic Maritime Freight",
    "RheinPort Cold Chain GmbH",
    "Nordic Express Fleet AB",
    "Lagos Atlantic Cargo Hub",
    "Danube Corridor Rail Cargo",
    "Savannah Corridor Logistics",
    "Vistula Warehousing Group",
    "Thames Valley Distribution",
    "AlpenPass Heavy Haulage",
    "GulfStream Air Cargo MENA",
    "Benelux Automated Fulfillment",
  ],
  "Robotics & AI": [
    "Kinetix Autonomous Cobots",
    "Synapse Vision Guided AMR",
    "Automata Warehouse Swarm",
    "Cortex Industrial Vision AI",
    "MechaLink Surgical Robotics",
    "Hyperion Drone Inspection",
    "NeuraPick Sortation Systems",
    "OmniGrip Robotic End-Effectors",
    "VectorPath Fleet Autonomy",
    "PulseRobotics Assembly Labs",
    "AetherMind Predictive AI",
    "TerraBot Field Automation",
  ],
  "Industrial Equipment": [
    "Vulkan Heavy Compressors",
    "Stahlwerk Hydraulic Presses",
    "Atlas Material Handling SE",
    "KruppFlow Industrial Pumps",
    "Borealis Heat Exchangers",
    "Goliath Overhead Cranes",
    "Taurus Pneumatic Systems",
    "ferroTech Smelting Furnaces",
    "MagnaTorque Gearboxes",
    "Orion Industrial Boilers",
    "TitanValve Process Fittings",
    "Prime Air Filtration Rigs",
  ],
  Manufacturing: [
    "Westphalia Steel Fabricators",
    "Skandia Polymer Extrusions",
    "Bohemia Glass & Ceramics",
    "Lombardy Composite Panels",
    "Midlands Sheet Metal Works",
    " Silesia Industrial Coatings",
    "Nile Delta Packaging Mills",
    "Iberia Forged Components",
    "Highland Specialty Textiles",
    "Baltic Timber & Millwork",
    "Rhine Valley Chemical Blending",
    "Cape Peninsula Foundry",
  ],
  "MedTech & Diagnostics": [
    "BioVantage Point-of-Care AB",
    "Luminex Molecular Assays",
    "HelixPath Genomic Screening",
    "CardioSense Telemetry AG",
    "OptiScan Retinal Imaging",
    "ViraCheck Rapid Diagnostics",
    "NeuroPulse EEG Analytics",
    "ImmunoTech Lab Automation",
    "SpectraMed Blood Analyzers",
    "CytoVision Digital Pathology",
    "theraMetrics Companion Dx",
    "novamedic Microfluidics",
  ],
  "Life Sciences": [
    "Cellecta Bioprocess Systems",
    "NordicPeptide Synthesis AB",
    "GeneSphere Viral Vectors",
    "Basel CryoPreservation SA",
    "BioHarbor Fermentation Labs",
    "Avicenna Clinical Trial CRO",
    "ProteoMax Mass Spectrometry",
    "VaxCore Cold Biologics",
    "CellMatrix Organoid Platforms",
    "Alba Bioreactor Engineering",
    "SynBio Metabolic Enzymes",
    "Zenith Genomic Sequencing",
  ],
  "Enterprise Software": [
    "Cloud Ledger ERP Systems",
    "FlowState Supply Chain SaaS",
    "Vertex Procurement Cloud",
    "OmniDesk Enterprise Service",
    "DataWeave Governance Suite",
    "ScaleOps Workforce Platform",
    "Prism BI & Revenue Analytics",
    "MetricStream Compliance HQ",
    "CoreStack Treasury Ops",
    "AgilePulse Project Cloud",
    "SyncroHR Global Payroll",
    "DocuFlow Contract Lifecycle",
  ],
  "Medical Devices": [
    "Ortho Precision Implants",
    "SterilGuard Autoclave Tech",
    "AeroMed Respiratory Care",
    "SurgiLight Operating Systems",
    "VascuTech Catheter Labs",
    "MediPump Infusion Devices",
    "SonosWave Ultrasound Corp",
    "EndoVision Scope Systems",
    "DialyPure Renal Equipment",
    "ProsthetiX Bionics GmbH",
    "CryoMed Surgical Probes",
    "VitalSign Patient Monitors",
  ],
  "Banking & FinTech": [
    "PayBridge Cross-Border FX",
    "NordicClear Settlement Bank",
    "AfriLedger Merchant Acquiring",
    "KronoPay Embedded Finance",
    "Zurich Wealth Custody AG",
    "Veritas RegTech & KYC Cloud",
    "Thames OpenBanking API",
    "NairaFlow Corporate Treasury",
    "Baltic Digital Lending SE",
    "Savannah Microfinance Core",
    "EuroTrade Factoring Network",
    "Apex Algorithmic Risk Lab",
  ],
  "Cloud & Datacenter": [
    "NordicCool Hyperscale DC",
    "RheinCloud Sovereign Hosting",
    "BalticFiber Colocation SIA",
    "AlpenVault Tier-IV Facilities",
    "LagoonEdge West Africa DC",
    "HyperGrid GPU Cloud Cluster",
    "fjordCompute Zero-Carbon DC",
    "StratusBareMetal Servers",
    "Equinox Interconnect Hubs",
    "Oasis Gulf Cloud Campus",
    "Vistula Disaster Recovery DC",
    "CelticWave Subsea Landing",
  ],
  Telecommunications: [
    "EuroLink 5G Private Networks",
    "NordicTower Infrastructure",
    "AfriComms Metro Fiber Grid",
    "AlpenSat Backhaul Systems",
    "BalticWave Carrier Ethernet",
    "Thames Optical Switching",
    "Savannah Rural Broadband",
    "Danube Core Routing SA",
    "GulfConnect Enterprise MPLS",
    "Polaris IoT Cellular Mesh",
    "Vistula Spectrum Solutions",
    "helvetic Telecom Core AG",
  ],
  "FMCG & Retail": [
    "Continental Beverage Group",
    "NordicFresh Grocery Chain",
    "Lagos MegaMart Retail PLC",
    "Rheinland Consumer Goods",
    "Highland Artisan Foods Ltd",
    "EastAfrica FastMoving Brands",
    "Benelux OmniChannel Retail",
    "AlpenDairy Cooperative AG",
    "GoldCoast Household Products",
    "Warsaw Urban Supermarkets",
    "Oasis DutyFree Distribution",
    "CapeWinery & Beverage Co",
  ],
  "AgriTech & Commodities": [
    "GreenYield Precision Agronomy",
    "NileBasin Grain Terminals",
    "GoldCoast Cocoa Processing",
    "RiftValley Cold Storage Co",
    "PolderSense Hydroponics BV",
    "Danube Seed & Fertilizer",
    "AgroPulse Satellite Crop AI",
    "Kano Agro-Allied Mills",
    "ScandiFeed Aquaculture Tech",
    "Highveld Citrus Exports",
    "TerraHarvest Silo Automation",
    "BioCrop Soil Microbiome",
  ],
  "Construction & Real Estate": [
    "BuildCore Modular Precast",
    "EkoAtlantic Commercial Dev",
    "RheinBridge Civil Engineering",
    "NordicTimber Smart Estates",
    "GulfSkyline Tower Projects",
    "Thames Commercial Reit PLC",
    "Nairobi Industrial Parks",
    "AlpenTunnel Geotechnical",
    "Warsaw Logistics Estates",
    "Accra Metro Infrastructure",
    "Randburg Urban Developments",
    "ProBuild BIM & Site Tech",
  ],
};

const SEED_CONTACTS = [
  ["Lukas Meyer", "VP of Operations & Procurement"],
  ["Freja Lindqvist", "Chief Commercial Officer"],
  ["Chidi Nwosu", "Head of Strategic Sourcing"],
  ["Matteo Rossi", "Director of Plant Engineering"],
  ["Annalena Scholz", "VP of Supply Chain"],
  ["Kwame Boateng", "Managing Director"],
  ["Pieter van Dijk", "Head of Enterprise IT"],
  ["Zainab Abubakar", "Director of Corporate Procurement"],
  ["Soren Kierkegaard", "VP of Revenue Operations"],
  ["Amara Okafor", "Chief Operating Officer"],
  ["Klara Novak", "Head of Vendor Management"],
  ["Tariq Al-Mansoor", "VP of Regional Expansion"],
  ["Hendrik Vermeulen", "Director of Fleet & Logistics"],
  ["Astrid Solberg", "Head of Clinical Operations"],
  ["Jakub Wisniewski", "Chief Information Security Officer"],
  ["Nia Kamau", "VP of Commercial Partnerships"],
  ["charlotte Dubois", "Director of Digital Transformation"],
  ["Oluwaseun Adeyemi", "Head of Infrastructure"],
  ["Markus Gruber", "VP of Manufacturing Excellence"],
  ["Elinor Vance", "Director of Global Accounts"],
] as const;

const SEED_ACTIONS = [
  "Validate buying authority and technical requirements",
  "Review commercial proposal with procurement committee",
  "Confirm Q4 deployment timeline and security sign-off",
  "Schedule executive technical discovery call",
  "Finalize multi-site pilot pricing and SLA terms",
  "Complete vendor onboarding and compliance checklist",
] as const;

const LOCATION_PAIRS: { country: string; city: string }[] = Object.entries(
  CRM_CITIES_BY_COUNTRY,
).flatMap(([country, cities]) => cities.map((city) => ({ country, city })));

const INITIAL_CRM_RECORDS: CrmRecord[] = ONBOARDED_BUSINESSES_DATA.flatMap(
  (b, i) =>
    Array.from({ length: 6 }, (_, j) => {
      const duplicate = i === 1 && j === 5;
      const p = b.prospects[duplicate ? 0 : j % b.prospects.length];
      const stage =
        CRM_STAGES[
          [
            [0, 1, 2, 3, 4, 1],
            [1, 2, 0, 3, 5, 0],
            [0, 1, 2, 4, 3, 0],
            [1, 3, 2, 0, 4, 5],
          ][i % 4][j]
        ];
      const closed = stage === "Won" || stage === "Lost";
      const parsedCity = p.location.split(",")[0]?.trim() || "Frankfurt";
      const category =
        INDUSTRY_DEFAULT_CATEGORY[p.industry] ??
        CRM_BUSINESS_CATEGORIES[(i + j) % CRM_BUSINESS_CATEGORIES.length];
      return {
        id: `CRM-${2001 + i * 6 + j}`,
        businessId: b.id,
        company: p.company,
        contact: p.primaryContact.name,
        role: p.primaryContact.title,
        email:
          j === 2 && i % 2 === 0
            ? ""
            : `${p.primaryContact.name.toLowerCase().replaceAll(" ", ".")}@example.com`,
        owner: j === 0 && i !== 0 ? "" : b.owner,
        industry: p.industry,
        category,
        country: p.country,
        city: parsedCity,
        stage,
        source: CRM_SOURCES[(i + j) % 3],
        value: [18000, 32000, 12500, 46000, 27000, 9500][j] + i * 2500,
        created: daysBefore([13, 10, 7, 5, 3, 1][j] + (i % 2)),
        updated: daysBefore(closed ? i + 1 : j === 1 ? 10 : 2 + i),
        due: closed ? null : daysBefore(j % 3 === 0 ? 2 : j % 3 === 1 ? 0 : -3),
        nextAction: closed
          ? "No follow-up required"
          : [
              "Validate buying authority",
              "Review proposal with client",
              "Confirm procurement timeline",
            ][j % 3],
        archived: false,
        duplicateOf: duplicate ? `CRM-${2001 + i * 6}` : null,
        duplicateReviewed: false,
        notes: [
          {
            text: "Imported into the client CRM workspace. Record ownership and deal value require client validation.",
            date: daysBefore([13, 10, 7, 5, 3, 1][j] + (i % 2)),
            actor: "Client workspace",
          },
        ],
      };
    }),
);

const EXPANDED_CRM_RECORDS: CrmRecord[] = CRM_INDUSTRIES.flatMap(
  (industry, indIdx) =>
    SEED_COMPANIES_BY_INDUSTRY[industry].map((rawCompany, compIdx) => {
      const seq = indIdx * 12 + compIdx;
      const recordNum = 2025 + seq;
      const business = CRM_BUSINESSES[seq % CRM_BUSINESSES.length];
      const company = rawCompany.trim();
      const [contactName, role] = SEED_CONTACTS[seq % SEED_CONTACTS.length];
      const loc = LOCATION_PAIRS[(seq * 7) % LOCATION_PAIRS.length];
      const category =
        compIdx % 3 === 0
          ? INDUSTRY_DEFAULT_CATEGORY[industry]
          : CRM_BUSINESS_CATEGORIES[seq % CRM_BUSINESS_CATEGORIES.length];
      const stage = CRM_STAGES[(indIdx + compIdx * 2) % CRM_STAGES.length];
      const closed = stage === "Won" || stage === "Lost";
      const teamMember = business.team[(seq + 1) % business.team.length];
      const isUnassigned = seq % 19 === 0;
      const isMissingEmail = seq % 23 === 0;
      const isDuplicate = seq % 29 === 0 && compIdx > 0;
      const domain =
        company
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 22) + ".com";
      const createdOffset = seq % 14;
      const updatedOffset = Math.max(0, createdOffset - ((seq % 4) + 1));
      const dueOffset = closed
        ? null
        : seq % 5 === 0
          ? 3
          : seq % 5 === 1
            ? 1
            : seq % 5 === 2
              ? -2
              : seq % 5 === 3
                ? -5
                : null;

      return {
        id: `CRM-${recordNum}`,
        businessId: business.id,
        company,
        contact: contactName,
        role,
        email: isMissingEmail
          ? ""
          : `${contactName.toLowerCase().replaceAll(" ", ".")}@${domain}`,
        owner: isUnassigned ? "" : teamMember,
        industry,
        category,
        country: loc.country,
        city: loc.city,
        stage,
        source: CRM_SOURCES[seq % CRM_SOURCES.length],
        value: 14000 + ((seq * 4700) % 78000),
        created: daysBefore(createdOffset),
        updated: daysBefore(updatedOffset),
        due: dueOffset === null ? null : daysBefore(dueOffset),
        nextAction: closed
          ? "No follow-up required"
          : SEED_ACTIONS[seq % SEED_ACTIONS.length],
        archived: seq % 37 === 0,
        duplicateOf: isDuplicate ? `CRM-${recordNum - 1}` : null,
        duplicateReviewed: false,
        notes: [
          {
            text: `Qualified ${industry} opportunity in ${loc.city}, ${loc.country} (${category}). Synced to ${business.name} pipeline.`,
            date: daysBefore(createdOffset),
            actor: teamMember,
          },
        ],
      };
    }),
);

export const CRM_RECORDS: CrmRecord[] = [
  ...INITIAL_CRM_RECORDS,
  ...EXPANDED_CRM_RECORDS,
];

export const CRM_INITIAL_AUDIT: CrmAudit[] = [
  {
    id: "audit-seed",
    businessId: CRM_BUSINESSES[0].id,
    recordId: "CRM-2001",
    action: "Record inspected",
    detail: "Initial sample review; no fields changed.",
    actor: "Kwame Smith",
    date: "13 Oct 2026 · 09:20 WAT",
  },
];
export function isOpen(record: CrmRecord) {
  return !record.archived && record.stage !== "Won" && record.stage !== "Lost";
}
export function issuesFor(record: CrmRecord): CrmIssue[] {
  if (record.archived) return [];
  const issues: CrmIssue[] = [];
  if (!record.owner) issues.push("Unassigned");
  if (!record.email) issues.push("Missing email");
  if (record.duplicateOf && !record.duplicateReviewed)
    issues.push("Possible duplicate");
  return issues;
}
export function isOverdue(record: CrmRecord) {
  return isOpen(record) && Boolean(record.due && record.due < CRM_SNAPSHOT);
}
export function isStale(record: CrmRecord, business: CrmBusiness) {
  return isOpen(record) && record.updated < daysBefore(business.staleDays);
}
export function money(value: number, compact = false) {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
    ...(compact ? { notation: "compact" as const } : {}),
  }).format(value);
}
export function dateLabel(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));
}
