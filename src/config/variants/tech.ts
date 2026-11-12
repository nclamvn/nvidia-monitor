// Tech/AI variant - tech.worldmonitor.app
import type { PanelConfig, MapLayers } from '@/types';
import type { VariantConfig } from './base';

// Re-export base config
export * from './base';

// Tech-specific exports
export * from '../tech-companies';
export * from '../ai-research-labs';
export * from '../startup-ecosystems';
export * from '../ai-regulations';

// Source metadata (feeds themselves live in shared/news-catalog.json)
export {
  SOURCE_TIERS,
  getSourceTier,
  SOURCE_TYPES,
  getSourceType,
  getSourcePropagandaRisk,
  type SourceRiskProfile,
  type SourceType,
} from '../feeds';

// Panel configuration for tech/AI analysis
export const DEFAULT_PANELS: Record<string, PanelConfig> = {
  map: { name: 'AI Infrastructure Map', enabled: true, priority: 1 },
  'live-news': { name: 'AI & Chip Headlines', enabled: true, priority: 1 },
  'fork-video-a': { name: 'Yahoo Finance Live', enabled: true, priority: 1 },
  'fork-video-b': { name: 'CNA Asia Live', enabled: true, priority: 1 },
  tech: { name: 'Nvidia CEO Scandal', enabled: true, priority: 1 },
  policy: { name: 'Chip & AI Policy', enabled: true, priority: 1 },
  hardware: { name: 'Chips & Supply Chain', enabled: true, priority: 1 },
  cloud: { name: 'Data Centers & Power', enabled: true, priority: 1 },
  ai: { name: 'AI Industry News', enabled: true, priority: 1 },
  finance: { name: 'AI Stocks News', enabled: true, priority: 2 },
  markets: { name: 'Tech Stocks', enabled: false, priority: 2 },
  monitors: { name: 'My Monitors', enabled: true, priority: 2 },
};

// Tech-focused map layers (subset)
export const DEFAULT_MAP_LAYERS: MapLayers = {
  // Keep only relevant layers, set others to false
  gpsJamming: false,
  satellites: false,


  conflicts: false,
  bases: false,
  cables: true,
  pipelines: false,
  hotspots: false,
  ais: false,
  nuclear: false,
  irradiators: false,
  sanctions: false,
  weather: true,
  canadaRoads: false,
  canadaAlerts: false,
  economic: true,
  waterways: false,
  outages: false,
  cyberThreats: false,
  datacenters: true,
  protests: false,
  flights: false,
  military: false,
  natural: false,
  spaceports: false,
  minerals: false,
  fires: false,
  ucdpEvents: false,
  displacement: false,
  climate: false,
  // Tech-specific layers
  startupHubs: false,
  cloudRegions: true,
  accelerators: false,
  techHQs: true,
  techEvents: false,
  // Finance layers (disabled in tech variant)
  stockExchanges: false,
  financialCenters: false,
  centralBanks: false,
  commodityHubs: false,
  gulfInvestments: false,
  // Happy variant layers
  positiveEvents: false,
  kindness: false,
  happiness: false,
  speciesRecovery: false,
  renewableInstallations: false,
  tradeRoutes: false,
  iranAttacks: false,
  ciiChoropleth: false,
  resilienceScore: false,
  dayNight: false,
  // Commodity variant layers (disabled in tech variant)
  miningSites: false,
  processingPlants: false,
  commodityPorts: false,
  webcams: false,
  diseaseOutbreaks: false,
};

// Mobile defaults for tech variant
export const MOBILE_DEFAULT_MAP_LAYERS: MapLayers = {
  gpsJamming: false,
  satellites: false,


  conflicts: false,
  bases: false,
  cables: false,
  pipelines: false,
  hotspots: false,
  ais: false,
  nuclear: false,
  irradiators: false,
  sanctions: false,
  weather: false,
  canadaRoads: false,
  canadaAlerts: false,
  economic: false,
  waterways: false,
  outages: false,
  cyberThreats: false,
  datacenters: true,
  protests: false,
  flights: false,
  military: false,
  natural: false,
  spaceports: false,
  minerals: false,
  fires: false,
  ucdpEvents: false,
  displacement: false,
  climate: false,
  // Tech-specific layers (limited on mobile)
  startupHubs: false,
  cloudRegions: false,
  accelerators: false,
  techHQs: false,
  techEvents: false,
  // Finance layers (disabled in tech variant)
  stockExchanges: false,
  financialCenters: false,
  centralBanks: false,
  commodityHubs: false,
  gulfInvestments: false,
  // Happy variant layers
  positiveEvents: false,
  kindness: false,
  happiness: false,
  speciesRecovery: false,
  renewableInstallations: false,
  tradeRoutes: false,
  iranAttacks: false,
  ciiChoropleth: false,
  resilienceScore: false,
  dayNight: false,
  // Commodity variant layers (disabled in tech variant)
  miningSites: false,
  processingPlants: false,
  commodityPorts: false,
  webcams: false,
  diseaseOutbreaks: false,
};

export const VARIANT_CONFIG: VariantConfig = {
  name: 'tech',
  description: 'Tech, AI & Startups intelligence dashboard',
  panels: DEFAULT_PANELS,
  mapLayers: DEFAULT_MAP_LAYERS,
  mobileMapLayers: MOBILE_DEFAULT_MAP_LAYERS,
};
