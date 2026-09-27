/**
 * Typed API client for the GeoPortal FastAPI backend.
 * All calls go through Vite's dev proxy (/api → localhost:8000)
 * so the same code works in production behind the reverse proxy.
 */

export const BASE = import.meta.env.PROD ? "https://geoportal-api-ygzi.onrender.com/api" : "/api";

// ── GEE Individual Auth Token Management ────────────────────────────────────
const GEE_TOKEN_KEY = "gee_individual_token";
const GEE_EMAIL_KEY = "gee_individual_email";
const GEE_PROJECT_KEY = "gee_individual_project";

export function getGeeToken(): string | null {
  return localStorage.getItem(GEE_TOKEN_KEY);
}

export function getGeeProject(): string | null {
  return localStorage.getItem(GEE_PROJECT_KEY);
}

export function getGeeEmail(): string | null {
  return localStorage.getItem(GEE_EMAIL_KEY);
}

export function setGeeAuth(token: string, email: string, projectName?: string): void {
  localStorage.setItem(GEE_TOKEN_KEY, token);
  localStorage.setItem(GEE_EMAIL_KEY, email);
  if (projectName) {
    localStorage.setItem(GEE_PROJECT_KEY, projectName);
  } else {
    localStorage.removeItem(GEE_PROJECT_KEY);
  }
}

export function clearGeeAuth(): void {
  localStorage.removeItem(GEE_TOKEN_KEY);
  localStorage.removeItem(GEE_EMAIL_KEY);
  localStorage.removeItem(GEE_PROJECT_KEY);
}


export type AOIConfig = {
  type: string;
  country?: string;
  level1?: string;
  level2?: string;
  province?: string;
  district?: string;
  sector?: string;
  cell?: string;
  geojson?: any;
  start_year?: number;
  end_year?: number;
  name?: string; // friendly name
};

export interface NDVIRequest {
  aoi: AOIConfig;
  district?: string;
  start_date: string;
  end_date: string;
  n_classes: number;
  method?: string;
  custom_labels?: string[];
}

export interface ClassifyPanel {
  letter: string;
  name: string;
  title: string;
  tile_url: string;
  thumb_url: string;
  clean_thumb_url?: string;
  areas: Record<string, number>;
  breakpoints: number[];
}

export interface NDVIResult {
  tile_url: string;
  thumb_url?: string;
  download_url?: string;
  stats: Record<string, number>;
  class_areas_km2: Record<string, number>;
  classified_areas_km2?: Record<string, number>;
  method?: string;
  classify: {
    panels: ClassifyPanel[];
    n_classes: number;
    percentile_steps: number[];
  };
  center: [number, number];
  bbox?: number[];
  aoi: AOIConfig;
  district?: string;
  start_date: string;
  end_date: string;
}

export interface ChangeDetectionRequest {
  aoi: AOIConfig;
  district?: string;
  before_start: string;
  before_end: string;
  after_start: string;
  after_end: string;
  index_type?: string;
  mask_water?: boolean;
  threshold?: number;
  n_classes?: number;
  method?: string;
  custom_labels?: string[];
}

export interface ChangeDetectionResult {
  tile_url: string;
  before_tile_url?: string;
  after_tile_url?: string;
  before_rgb_tile_url?: string;
  after_rgb_tile_url?: string;
  thumb_url: string;
  download_url?: string;
  index_type?: string;
  stats: Record<string, number>;
  net_change?: {
    loss_km2: number;
    stable_km2: number;
    gain_km2: number;
    net_km2: number;
    pct_changed: number;
    total_analyzed_km2: number;
  };
  class_areas_km2: Record<string, number>;
  class_colors?: string[];
  classify?: any;
  center: [number, number];
  bbox?: number[];
  district?: string;
  before_start: string;
  before_end: string;
  after_start: string;
  after_end: string;
}

export interface ChangeDetectionPointRequest {
  aoi: AOIConfig;
  district?: string;
  before_start: string;
  before_end: string;
  after_start: string;
  after_end: string;
  lat: number;
  lng: number;
  index_type?: string;
}

export interface ChangeDetectionPointResult {
  lat: number;
  lng: number;
  index_type: string;
  before_value: number | null;
  after_value: number | null;
  delta: number | null;
  status: string;
  color: string;
}


export interface LSTResult {
  tile_url: string;
  stats: Record<string, number>;
  class_areas_km2: Record<string, number>;
  classify: { panels: ClassifyPanel[]; n_classes: number; percentile_steps: number[] };
  center: [number, number];
  bbox?: number[];
  aoi: AOIConfig;
  district?: string;
  start_date: string;
  end_date: string;
}

export interface RUSLEMapResult {
  tile_url: string;
  thumb_url?: string;
  factor_maps: Record<string, any>;
  center: [number, number];
}

export interface RUSLEStatsResult {
  stats: Record<string, number>;
  factor_means: Record<string, number>;
}

export interface RUSLEClassifyResult {
  classify?: { panels: ClassifyPanel[]; n_classes: number; percentile_steps: number[] };
  panels?: Array<{ name: string; tile_url: string; thumb_url: string; class_areas: Record<string, number> }>;
}

export interface RUSLEExportResult {
  A: string;
  R: string;
  K: string;
  LS: string;
  C: string;
  P: string;
  risk_index: string;
}

export interface SlopeResult {
  slope_tile_url: string;
  hillshade_tile_url: string;
  aspect_tile_url: string;
  stats: Record<string, number>;
  class_areas_km2: Record<string, number>;
  classify: { panels: ClassifyPanel[]; n_classes: number; percentile_steps: number[] };
  center: [number, number];
  bbox?: number[];
  aoi: AOIConfig;
  district?: string;
}

export interface AhpData {
  weights: Record<string, number>;
  matrix: number[][];
  factor_labels: string[];
  lambda_max: number;
  ci: number;
  cr: number;
  ri: number;
  consistent: boolean;
  n: number;
}

export const fetchLandfillAhp = async (
  customWeights: Record<string, number> | null
): Promise<AhpData> => {
  const { data } = await api.post("/landfill/ahp", { custom_weights: customWeights || {} });
  return data;
};



export interface LandfillFactorMap {
  label: string;
  weight_pct: number;
  reversed: boolean;
  description: string;
  tile_url: string;
  thumb_url: string;
  download_url: string;
}

export interface LandfillResult {
  tile_url: string;
  thumb_url: string;
  download_url?: string;
  stats: Record<string, number>;
  class_areas_km2: Record<string, number>;
  classify: { panels: ClassifyPanel[]; n_classes: number; percentile_steps: number[] };
  factor_maps: Record<string, LandfillFactorMap>;
  reverse_flags: Record<string, boolean>;
  weights_used: Record<string, number>;
  ahp_data: AhpData;
  center: [number, number];
  bbox?: number[];
  aoi: AOIConfig;
  district?: string;
}

export interface HabitatFactorMap {
  label: string;
  weight_pct: number;
  reversed: boolean;
  description: string;
  tile_url: string;
  thumb_url: string;
  download_url: string;
  labels?: string[];
}

export interface HabitatResult {
  tile_url: string;
  factor_maps: Record<string, { tile_url: string }>;
  center: [number, number];
  bbox: number[];
  class_areas_km2: Record<string, number>;
  classify: { panels: ClassifyPanel[]; n_classes: number; percentile_steps: number[] };
  thumb_url: string;
  download_url?: string;
  factors: Record<string, HabitatFactorMap>;
}

export interface AirPollutionMapResult {
  tile_url: string;
  thumb_url: string;
  center: [number, number];
  bbox?: number[];
  district?: string;
  start_date: string;
  end_date: string;
}

export interface AirPollutionStatsResult {
  stats: Record<string, number>;
  exceeds_who: boolean;
}

export interface AirPollutionClassifyResult {
  classify: { panels: ClassifyPanel[]; n_classes: number; percentile_steps: number[] };
}

export interface AirPollutionTimeseriesResult {
  time_series: Array<{ year: number; month: number; "NO2 (µmol/m²)": number; "CO (mol/m²)": number; "SO2 (µmol/m²)": number; "Aerosol Index": number; }>;
}

export interface AirPollutionExportResult {
  download_url: string;
}

export interface LandslideMapResult {
  lsi_tile_url: string;
  lsi_class_tile_url: string;
  factor_maps?: Record<string, { tile_url: string; thumb_url?: string; download_url?: string; class_tile_url?: string; class_thumb_url?: string; label?: string; direction_desc?: string }>;
  center: [number, number];
  bbox?: number[];
  district?: string;
  start_year: number;
  end_year: number;
}

export interface IrrigationMapResult {
  tile_url: string;
  factor_maps: Record<string, { tile_url: string }>;
  center: [number, number];
  bbox?: number[];
  classify?: { panels: any[]; n_classes: number; method: string; };
}

export interface IrrigationStatsResult {
  mean_deficit_mm: number;
  mean_etc_mm: number;
  mean_precip_mm: number;
  mean_sm_mm: number;
  recommendation: string;
  status: "irrigate" | "monitor" | "skip";
  kc_used: number;
}

export interface IrrigationExportResult {
  download_url?: string;
  thumb_url?: string;
  labels?: string[];
  factors: Record<string, { download_url?: string; thumb_url?: string; labels?: string[] }>;
}
export interface LandslideStatsResult {
  stats: Record<string, number>;
  class_areas_km2: Record<string, number>;
}
export interface LandslideClassifyResult {
  classify: { panels: ClassifyPanel[]; n_classes: number; percentile_steps: number[] };
}
export interface LandslideExportResult {
  lsi_thumb_url: string;
  lsi_download_url?: string;
  lsi_class_thumb_url: string;
  factor_maps?: Record<string, { tile_url: string; thumb_url?: string; download_url?: string; class_tile_url?: string; class_thumb_url?: string; label?: string; direction_desc?: string }>;
}

export interface AccessibilityRequest {
  aoi: AOIConfig;
  district?: string;
  amenities: string[];
  dest_amenities?: string[];
  n_classes?: number;
  service_threshold_mins?: number;
  method?: string;
  custom_labels?: string[];
  proposed_facilities?: number[][];
}
export interface AccessibilityMapResult {
  travel_time_tile_url: string;
  acc_class_tile_url: string;
  roads_tile_url?: string;
  center: [number, number];
  bbox?: number[];
  district?: string;
  facilities?: { lon: number; lat: number; name: string; type: string }[];
  origins?: { lon: number; lat: number; name: string; type: string }[];
  nearest_road_geojson?: any;
  start_year?: number;
  end_year?: number;
  farthest_road_geojson?: any;
  start_year?: number;
  end_year?: number;
  incidents?: { lon: number; lat: number; name: string }[];
  routes?: { geometry: any; incident_name: string; facility_name: string; distance_km: number }[];
}
export interface AccessibilityStatsResult {
  stats: Record<string, number>;
  served?: {
    threshold_mins: number;
    area_km2: number;
    population: number;
    total_population: number;
    pop_percent: number;
  };
  class_areas_km2: Record<string, number>;
  nearest_facility?: { lon: number; lat: number; name: string; type: string; distance_km: number };
  farthest_facility?: { lon: number; lat: number; name: string; type: string; distance_km: number };
  delta_stats?: {
    population_served: number;
    area_km2_served: number;
    mean_time_min: number;
  };
}
export interface AccessibilityClassifyResult {
  classify: { panels: ClassifyPanel[]; n_classes: number; percentile_steps: number[] };
}
export interface AccessibilityExportResult {
  travel_time_thumb_url: string;
  travel_time_download_url?: string;
  acc_class_thumb_url: string;
  factor_maps?: Record<string, any>;
}

export interface DroughtResult {
  dvi_tile_url: string;
  dvi_download_url?: string;
  dvi_thumb_url: string;
  dvi_class_tile_url: string;
  dvi_class_thumb_url: string;
  stats: Record<string, number>;
  class_areas_km2: Record<string, number>;
  classify: { panels: ClassifyPanel[]; n_classes: number; percentile_steps: number[] };
  center: [number, number];
  bbox?: number[];
  aoi: AOIConfig;
  district?: string;
  year: number;
}
export interface FloodFactorMap {
  label: string;
  tile_url: string;
  thumb_url: string;
  download_url: string;
  class_tile_url?: string;
  class_thumb_url?: string;
  reversed: boolean;
}

export interface FloodMapResult {
  tile_url: string;
  center: [number, number];
  bbox?: number[];
  ahp: AhpData;
  factor_maps: Record<string, FloodFactorMap>;
}

export interface FloodStatsResult {
  stats: Record<string, number>;
  class_areas_km2: Record<string, number>;
}

export interface FloodClassifyResult {
  classify: { panels: ClassifyPanel[]; n_classes: number; percentile_steps: number[] };
}

export interface FloodExportResult {
  download_url: string;
}

export interface FloodResult {
  tile_url: string;
  thumb_url: string;
  stats: Record<string, number>;
  class_areas_km2: Record<string, number>;
  classify: { panels: ClassifyPanel[]; n_classes: number; percentile_steps: number[] };
  factor_maps: Record<string, FloodFactorMap>;
  reverse_flags: Record<string, boolean>;
  ahp: AhpData;
  center: [number, number];
  bbox?: number[];
  aoi: AOIConfig;
  district?: string;
  start_year: number;
  end_year: number;
}


export interface UHIResult {
  center: [number, number];
  bbox?: number[];
  district?: string;
  start_date?: string;
  end_date?: string;
  class_areas_km2?: Record<string, number>;
  lst_tile_url: string;
  lst_download_url?: string;
  ndbi_tile_url: string;
  ndbi_download_url?: string;
  lst_thumb_url: string;
  ndbi_thumb_url: string;
  lst_stats: Record<string, number | null>;
  ndbi_stats: Record<string, number | null>;
  n_cells_total: number;
  n_cells_with_data: number;
  regression: {
    slope: number;
    intercept: number;
    r2: number;
    p_value: number;
    n: number;
  } | null;
  bivariate_png: string;
  scatter_png: string;
  grid_table: Array<{ grid_id: number; LST: number; NDBI: number }>;
}

export interface DatasetRecord {
  id: string;
  name: string;
  description: string;
  file_type: string;
  original_filename: string;
  bbox?: number[];
  file_size_mb: number;
  status: string;
  error_message?: string;
  source: string;
  contributor?: string;
  source_url?: string;
  storage_key?: string;
}

export interface TrainingSample {
  id: string;
  geometry: any;
  class_label: string;
  source_filename: string;
  source_url: string;
  creator: string;
  color: string;
  created_at: string;
}

function parseApiError(err: any, fallback: string): string {
  if (!err) return fallback;
  if (typeof err.detail === "string") return err.detail;
  if (Array.isArray(err.detail)) {
    return err.detail.map((e: any) => {
      const field = e.loc ? e.loc[e.loc.length - 1] : "";
      return field ? `${field}: ${e.msg}` : (e.msg || e.detail || JSON.stringify(e));
    }).join("; ");
  }
  if (typeof err.detail === "object" && err.detail !== null) {
    return err.detail.msg || err.detail.error || err.detail.message || JSON.stringify(err.detail);
  }
  if (typeof err.message === "string") return err.message;
  return fallback;
}

async function post<T>(path: string, body: unknown, opts?: { withGeeAuth?: boolean }): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const appToken = localStorage.getItem("spetro_token");
  if (appToken) {
    headers["Authorization"] = `Bearer ${appToken}`;
  }
  if (opts?.withGeeAuth) {
    const token = getGeeToken();
    if (token) headers["X-GEE-Token"] = token;
  }
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(parseApiError(err, res.statusText));
  }
  const data = await res.json() as T;
  window.dispatchEvent(new Event("gee-usage-update"));
  return data;
}

async function downloadExternalLayer(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Failed to download external layer. Status: ${res.status}`);
  }

  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

// ── AI ──────────────────────────────────────────────────────────────────────
export async function fetchAITakeaways(pdfUrl: string, title: string): Promise<string[]> {
  const res = await fetch(`${BASE}/ai/takeaways`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pdfUrl, title })
  });
  
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `AI generation failed (Status ${res.status})`);
  }
  
  const data = await res.json();
  return data.takeaways;
}

async function put<T>(path: string, body: unknown, opts?: { withGeeAuth?: boolean }): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const appToken = localStorage.getItem("spetro_token");
  if (appToken) {
    headers["Authorization"] = `Bearer ${appToken}`;
  }
  if (opts?.withGeeAuth) {
    const token = getGeeToken();
    if (token) headers["X-GEE-Token"] = token;
  }
  const res = await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(parseApiError(err, res.statusText));
  }
  return res.json() as Promise<T>;
}

async function get<T>(path: string, opts?: { withGeeAuth?: boolean }): Promise<T> {
  const headers: Record<string, string> = {};
  const appToken = localStorage.getItem("spetro_token");
  if (appToken) {
    headers["Authorization"] = `Bearer ${appToken}`;
  }
  if (opts?.withGeeAuth) {
    const token = getGeeToken();
    if (token) headers["X-GEE-Token"] = token;
  }
  const separator = path.includes('?') ? '&' : '?';
  const noCachePath = `${path}${separator}_t=${Date.now()}`;
  const res = await fetch(`${BASE}${noCachePath}`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(parseApiError(err, res.statusText));
  }
  return res.json() as Promise<T>;
}
export interface StaticMapPayload {
  url: string;
  aoi: AOIConfig;
  district?: string;
  title: string;
  class_areas?: Record<string, number>;
  override_palette?: string[];
  show_frame?: boolean;
  show_grid?: boolean;
  show_legend?: boolean;
  show_scale?: boolean;
  size_multiplier?: number;
  legend_pos?: string;
  scale_pos?: string;
  north_arrow_pos?: string;
  proposed_facilities?: [number, number][];
}

export const api = {
  analytics: {
    getSummary: (days?: string) => get<any>(`/analytics/summary${days && days !== 'all' ? '?days=' + days : ''}`),
    getTimeseries: (days?: string) => get<any[]>(`/analytics/timeseries${days && days !== 'all' ? '?days=' + days : ''}`),
    getModules: (days?: string) => get<any[]>(`/analytics/modules${days && days !== 'all' ? '?days=' + days : ''}`),
    getLocations: (days?: string) => get<any[]>(`/analytics/locations${days && days !== 'all' ? '?days=' + days : ''}`),
    getRawEvents: (limit: number = 50) => get<any[]>(`/analytics/raw?limit=${limit}`)
  },

  async getRegions(country?: string, level1?: string): Promise<{regions: string[]}> {
    let url = "/aoi/regions";
    const p = new URLSearchParams();
    if (country) p.append("country", country);
    if (level1) p.append("level1", level1);
    if (p.toString()) url += "?" + p.toString();
    return get(url);
  },

  async getRwandaHierarchy(): Promise<Record<string, Record<string, string[]>>> {
    return get("/aoi/rwanda-hierarchy");
  },

  async getRwandaMicroHierarchy(): Promise<Record<string, Record<string, string[]>>> {
    return get("/aoi/rwanda-micro-hierarchy");
  },

  async getRwandaFullHierarchy(): Promise<any> {
    return get("/aoi/rwanda-full-hierarchy");
  },

  async uploadShapefile(file: File): Promise<{geojson: any}> {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${BASE}/aoi/upload`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) throw new Error("Failed to upload shapefile");
    return res.json();
  },

  async uploadTiff(file: File): Promise<{asset_id: string, task_id: string}> {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${BASE}/aoi/upload-tiff`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) throw new Error("Failed to upload TIFF");
    return res.json();
  },

  health: () => get<{ status: string }>("/health"),
  districts: () => get<{ districts: string[] }>("/districts"),
  ndvi: (req: NDVIRequest) => post<NDVIResult>("/ndvi", req),
  changeDetection: (req: ChangeDetectionRequest) => post<ChangeDetectionResult>("/change-detection", req),
  changeDetectionPoint: (req: ChangeDetectionPointRequest) => post<ChangeDetectionPointResult>("/change-detection/point", req),
  lst: {
    analyze: (req: { aoi: AOIConfig; district?: string; start_date: string; end_date: string; n_classes: number; method?: string; custom_labels?: string[] }) =>
      post<LSTResult>("/lst", req),
    point: (req: { aoi: AOIConfig; start_date: string; end_date: string; lat: number; lng: number }) =>
      post<{lst: number | null}>("/lst/point", req),
  },  rusle: {
    map: (req: any) => post<RUSLEMapResult>("/rusle/map", req),
    stats: (req: any) => post<RUSLEStatsResult>("/rusle/stats", req),
    classify: (req: any) => post<RUSLEClassifyResult>("/rusle/classify", req),
    export: (req: any) => post<RUSLEExportResult>("/rusle/export", req),
  },
  slope: {
    map: (req: any) => post<any>("/slope/map", req),
    stats: (req: any) => post<any>("/slope/stats", req),
    classify: (req: any) => post<any>("/slope/classify", req),
    export: (req: any) => post<any>("/slope/export", req),
    inspect: (req: { lat: number; lon: number; aoi: any }) => post<any>("/slope/inspect", req),
    profile: (req: { line: number[][]; aoi: any }) => post<any>("/slope/profile", req),
    watershed: (req: { lat: number; lon: number; level: number }) => post<any>("/slope/watershed", req),
    earthwork: (req: { polygon: number[][]; target_elevation: number }) => post<any>("/slope/earthwork", req),
  },
  earthwork: {
    analyze: (req: { 
      polygon: number[][]; 
      target_elevation?: number; 
      auto_balance?: boolean;
      swell_factor?: number; 
      shrink_factor?: number;
      topsoil_depth?: number;
      slope_grade?: number;
      slope_angle?: number;
      strata_layers?: any[];
      custom_dem_id?: string;
    }) => post<any>("/earthwork/analyze", req),
    profile: (req: {
      polygon: number[][];
      line: number[][];
      target_elevation: number;
      slope_grade?: number;
      slope_angle?: number;
      topsoil_depth?: number;
      custom_dem_id?: string;
    }) => post<any[]>("/earthwork/profile", req),
  },
  landfill: {
    map: (req: any) => post<any>("/landfill/map", req),
    stats: (req: any) => post<any>("/landfill/stats", req),
    classify: (req: any) => post<any>("/landfill/classify", req),
    export: (req: any) => post<any>("/landfill/export", req),
  },
  airPollution: {
    map: (req: any) => post<AirPollutionMapResult>("/air-pollution/map", req),
    stats: (req: any) => post<AirPollutionStatsResult>("/air-pollution/stats", req),
    classify: (req: any) => post<AirPollutionClassifyResult>("/air-pollution/classify", req),
    export: (req: any) => post<AirPollutionExportResult>("/air-pollution/export", req),
    timeseries: (req: any) => post<AirPollutionTimeseriesResult>("/air-pollution/timeseries", req),
  },
  landslide: {
    map: (req: any) => post<LandslideMapResult>("/landslide/map", req),
    stats: (req: any) => post<LandslideStatsResult>("/landslide/stats", req),
    classify: (req: any) => post<LandslideClassifyResult>("/landslide/classify", req),
    export: (req: any) => post<LandslideExportResult>("/landslide/export", req),
  },
  accessibility: {
    map: (req: AccessibilityRequest) => post<AccessibilityMapResult>("/accessibility/map", req),
    stats: (req: AccessibilityRequest) => post<AccessibilityStatsResult>("/accessibility/stats", req),
    classify: (req: AccessibilityRequest) => post<AccessibilityClassifyResult>("/accessibility/classify", req),
    export: (req: AccessibilityRequest) => post<AccessibilityExportResult>("/accessibility/export", req),
  },
  drought: {
    map: (req: any) => post<any>("/drought/map", req),
    stats: (req: any) => post<any>("/drought/stats", req),
    classify: (req: any) => post<any>("/drought/classify", req),
    export: (req: any) => post<any>("/drought/export", req),
  },
  flood: {
    map: (req: any) => post<FloodMapResult>("/flood/map", req),
    stats: (req: any) => post<FloodStatsResult>("/flood/stats", req),
    classify: (req: any) => post<FloodClassifyResult>("/flood/classify", req),
    export: (req: any) => post<FloodExportResult>("/flood/export", req),
  },
  uhi: (req: any) => post<UHIResult>("/uhi", req),
  adminVerify: (password: string) => post<{ ok: boolean }>("/admin/verify", { password }),
  uploadLogo: async (file: File): Promise<{ url: string }> => {
    const formData = new FormData();
    formData.append("file", file);
    const headers: Record<string, string> = {};
    const appToken = localStorage.getItem("spetro_token");
    if (appToken) headers["Authorization"] = `Bearer ${appToken}`;
    
    const url = `${BASE}/admin/logo/upload`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers,
        body: formData,
      });
    } catch (err: any) {
      throw new Error(`Network error (${url}): ${err.message}`);
    }
    
    if (!res.ok) {
      let errStr = res.statusText;
      try {
        const errJson = await res.json();
        errStr = parseApiError(errJson, res.statusText);
      } catch (e) {
        const errText = await res.text().catch(() => "");
        if (errText) errStr = errText.slice(0, 100);
      }
      throw new Error(`Error ${res.status}: ${errStr}`);
    }
    return res.json();
  },
  academy: {
    getBooks: () => get<{ books: any[] }>("/academy/books"),
    deleteBook: async (id: string) => {
      const headers: Record<string, string> = {};
      const appToken = localStorage.getItem("spetro_token");
      if (appToken) headers["Authorization"] = `Bearer ${appToken}`;
      const res = await fetch(`${BASE}/academy/books/${id}`, { method: "DELETE", headers });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(parseApiError(err, res.statusText));
      }
      return res.json() as Promise<{ ok: boolean }>;
    },
    updateBook: async (id: string, data: any): Promise<{ ok: boolean, book: any }> => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const appToken = localStorage.getItem("spetro_token");
      if (appToken) headers["Authorization"] = `Bearer ${appToken}`;
      const res = await fetch(`${BASE}/academy/books/${id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          title: data.title,
          author: data.author || "Unknown",
          description: data.description || "",
          pages: parseInt(data.pages) || 0
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(parseApiError(err, res.statusText));
      }
      return res.json();
    },
    uploadBook: async (formData: FormData): Promise<{ ok: boolean, book: any }> => {
      const headers: Record<string, string> = {};
      const appToken = localStorage.getItem("spetro_token");
      if (appToken) headers["Authorization"] = `Bearer ${appToken}`;
      const res = await fetch(`${BASE}/academy/books/upload`, {
        method: "POST",
        headers,
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(parseApiError(err, res.statusText));
      }
      return res.json();
    },
    fetchBookFromUrl: async (data: { url: string; title: string; author?: string; description?: string; pages?: number }): Promise<{ ok: boolean, book: any }> => {
      return post<{ ok: boolean, book: any }>("/academy/books/fetch-from-url", data);
    },
    getCourses: () => get<{ courses: any[] }>("/academy/courses"),
    createCourse: (data: any) => post<{ ok: boolean, course: any }>("/academy/courses", data),
    updateCourse: (id: string, data: any) => put<{ ok: boolean, course: any }>(`/academy/courses/${id}`, data),
    deleteCourse: async (id: string) => {
      const headers: Record<string, string> = {};
      const appToken = localStorage.getItem("spetro_token");
      if (appToken) headers["Authorization"] = `Bearer ${appToken}`;
      const res = await fetch(`${BASE}/academy/courses/${id}`, { method: "DELETE", headers });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(parseApiError(err, res.statusText));
      }
      return res.json() as Promise<{ ok: boolean }>;
    }
  },
  habitat: (req: any) => post<HabitatResult>("/habitat", req),
  habitatAhp: (customWeights: Record<string, number> | null) => post<AhpData>("/habitat/ahp", { custom_weights: customWeights || {} }),
  habitatConfig: () => get<any>("/habitat/config"),
  waterHarvesting: {
    map: (req: { aoi: AOIConfig; year: number; runoff_coefficient?: number; manual_area_m2?: number; use_building_footprint?: boolean; household_size?: number; daily_water_use_liters?: number }) => post<any>("/water-harvesting/map", req),
    stats: (req: { aoi: AOIConfig; year: number; runoff_coefficient?: number; manual_area_m2?: number; use_building_footprint?: boolean; household_size?: number; daily_water_use_liters?: number }) => post<any>("/water-harvesting/stats", req),
    export: (req: { aoi: AOIConfig; year: number; runoff_coefficient?: number; manual_area_m2?: number; use_building_footprint?: boolean; household_size?: number; daily_water_use_liters?: number }) => post<any>("/water-harvesting/export", req),
  },
  wellscope: {
    map: (req: any) => post<any>("/wellscope/map", req),
    stats: (req: any) => post<any>("/wellscope/stats", req),
    classify: (req: any) => post<any>("/wellscope/classify", req),
    export: (req: any) => post<any>("/wellscope/export", req),
    factorExport: (req: any) => post<{ thumb_url: string; download_url: string }>("/wellscope/factor-export", req),
  },

  
  // ... (some lines are omitted for brevity if needed, wait no I shouldn't omit lines in replacement if I match exactly)
  report: async (body: {
    module_name: string;
    aoi: AOIConfig;
  district?: string;
    date_range: string;
    stats: Record<string, number>;
    class_areas: Record<string, number>;
    extra_notes?: string;
    maps?: Array<[string, string]>;
    agency_template?: string;
    include_action_matrix?: boolean;
    proposed_facilities?: [number, number][];
    delta_stats?: Record<string, number>;
  }): Promise<Blob> => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const appToken = localStorage.getItem("spetro_token");
    if (appToken) {
      headers["Authorization"] = `Bearer ${appToken}`;
    }
    const res = await fetch(`${BASE}/report`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error((err as any).detail ?? res.statusText);
    }
    return res.blob();
  },
  staticMap: async (body: StaticMapPayload): Promise<Blob> => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const appToken = localStorage.getItem("spetro_token");
    if (appToken) {
      headers["Authorization"] = `Bearer ${appToken}`;
    }
    const res = await fetch(`${BASE}/static-map`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error((err as any).detail ?? res.statusText);
    }
    return res.blob();
  },

  irrigation: {
    map: (req: { aoi: AOIConfig; start_date: string; end_date: string; planting_date: string; crop_type: string; n_classes?: number; method?: string; custom_labels?: string[] }) =>
      post<IrrigationMapResult>("/irrigation/map", req),
    stats: (req: { aoi: AOIConfig; start_date: string; end_date: string; planting_date: string; crop_type: string; n_classes?: number; method?: string; custom_labels?: string[] }) =>
      post<IrrigationStatsResult>("/irrigation/stats", req),
    export: (req: { aoi: AOIConfig; start_date: string; end_date: string; planting_date: string; crop_type: string; n_classes?: number; method?: string; custom_labels?: string[] }) =>
      post<IrrigationExportResult>("/irrigation/export", req),
  },

  biomass: {
    map: (body: any) => post<{ tile_url: string; thumb_url?: string; factor_maps?: Record<string, any>; center: [number, number]; bbox: number[] }>("/biomass/map", body),
    stats: (body: any) => post<{ stats: Record<string, number>; class_areas_km2: Record<string, number>; district: string }>("/biomass/stats", body),
    classify: (body: any) => post<any>("/biomass/classify", body),
    export: (body: any) => post<any>("/biomass/export", body),
    factorExport: (req: { aoi: AOIConfig; factor_key: string; palette?: string[]; buffer_km?: number; year_start?: number; year_end?: number }) => post<{ download_url: string }>("/biomass/factor-export", req),
  },

  // ── GEE Individual Auth ─────────────────────────────────────────────────
  geeAuth: {
    login: (tokenOrEmail: string, projectId?: string) =>
      post<{ ok: boolean; token: string; email: string; project_name?: string }>("/gee/individual-auth", {
        token: tokenOrEmail,
        email: tokenOrEmail,
        project_name: projectId,
      }),
    status: async (): Promise<{ authenticated: boolean; email?: string; project_name?: string; authenticated_at?: string }> => {
      const storedToken = getGeeToken();
      if (!storedToken) return { authenticated: false };
      const headers: Record<string, string> = { "X-GEE-Token": storedToken };
      const res = await fetch(`${BASE}/gee/individual-auth/status`, { headers });
      if (!res.ok) return { authenticated: false };
      return res.json();
    },
    logout: async (): Promise<void> => {
      const token = getGeeToken();
      if (token) {
        await fetch(`${BASE}/gee/individual-auth/logout`, {
          method: "POST",
          headers: { "X-GEE-Token": token },
        }).catch(() => {});
      }
      clearGeeAuth();
    },
  },
  // ── Sample Digitization (requires individual GEE auth) ──────────────────
  samples: {
    list: () => get<{ samples: TrainingSample[] }>("/samples", { withGeeAuth: true }),
    add: (body: any) => post<TrainingSample>("/samples", body, { withGeeAuth: true }),
    batchSave: (body: { dataset_name: string; creator?: string; samples: any[] }) =>
      post<{ ok: boolean; saved_count: number; dataset_name: string; message: string }>("/samples/batch", body, { withGeeAuth: true }),
    delete: async (id: string) => {
      const headers: Record<string, string> = {};
      const token = getGeeToken();
      if (token) headers["X-GEE-Token"] = token;
      const r = await fetch(BASE + "/samples/" + id, { method: "DELETE", headers });
      return r.json() as Promise<{ ok: boolean }>;
    },
    classify: (body?: any) =>
      post<{ tile_url: string; download_url?: string; visualized_download_url?: string; classes: string[]; colors: Record<string, string>; class_values?: Record<string, number>; areas: Record<string, number>; accuracy?: any; feature_importance?: Record<string, number> }>(
        "/classify/supervised",
        body ?? {},
        { withGeeAuth: true }
      ),
    ingestUrl: (body: { url: string; class_label?: string; creator?: string }) =>
      post<{ imported_count: number; info: any; kind?: string; asset_id?: string }>("/samples/ingest-url", body, { withGeeAuth: true }),
    importDataset: (body: { dataset_id: string; source: string; class_label?: string; creator?: string }) =>
      post<{ imported_count: number; dataset_name: string }>("/samples/import-from-dataset", body, { withGeeAuth: true }),
  },
  gee: {
    ingestRaster: (body: { source_url: string; target_asset_id?: string }) =>
      post<{ ok: boolean; message: string }>("/gee/ingest-raster", body),
    previewImagery: (body: { aoi_bounds?: number[], data_source: string, custom_asset_id?: string }) =>
      post<{ tile_url: string }>("/gee/preview-imagery", body, { withGeeAuth: true }),
    timelapseTile: (body: {
      source: "sentinel2" | "landsat" | "gedi";
      year: number;
      aoi_bounds?: number[];
      gedi_mode?: "single" | "rolling" | "cumulative";
      gedi_window?: number;
    }) =>
      post<{ tile_url: string; shot_count?: number; date_range?: [string, string] }>(
        "/gee/timelapse-tile", body
      ),
    extractSamples: (body: {
      source: "sentinel2" | "landsat" | "gedi";
      year: number;
      scale?: number;
      gedi_mode?: "single" | "rolling" | "cumulative";
      gedi_window?: number;
      aoi_bounds?: number[];
      samples: Array<{ geometry: any; class_label: string }>;
    }) =>
      post<{
        rows: Record<string, any>[];
        band_names: string[];
        n_samples: number;
        csv_b64: string;
        source: string;
        year: number;
      }>("/gee/extract-samples", body),
  },
  harvester: {
    scan: (url: string) =>
      post<{
        url: string;
        title: string;
        source_type: string;
        count: number;
        datasets: Array<{
          id: string;
          name: string;
          url: string;
          category: "raster" | "vector" | "archive" | "tabular" | "stac" | "unknown";
          format: string;
          size_mb?: number | null;
          is_direct: boolean;
          internal_path?: string;
          stac_asset_key?: string;
          feature_count?: number;
          description?: string;
        }>;
      }>("/harvester/scan", { url }),
    getDownloadUrl: (remoteUrl: string, filename?: string) =>
      `${BASE}/harvester/download?url=${encodeURIComponent(remoteUrl)}${filename ? `&filename=${encodeURIComponent(filename)}` : ""}`,
    saveToPortal: (body: { url: string; name: string; class_label?: string; category?: string; internal_path?: string }) =>
      post<{ ok: boolean; task_id: string; message: string }>(
        "/harvester/save-to-portal",
        body
      ),
    pushToGee: (body: { url: string; asset_id?: string; target_project?: string }) =>
      post<{ task_id: string; message: string }>("/harvester/push-to-gee", body, { withGeeAuth: true }),
    getTaskStatus: (taskId: string) =>
      get<{
        task_id: string;
        action: string;
        source_url: string;
        target_name: string;
        status: string;
        progress: number;
        message: string;
        error?: string;
        result_data?: any;
      }>(`/harvester/tasks/${taskId}`),
    cancelTask: (taskId: string) =>
      post<{ ok: boolean; message: string }>(`/harvester/tasks/${taskId}/cancel`, {}),
    deleteTask: (taskId: string) =>
      del<{ ok: boolean; message: string }>(`/harvester/tasks/${taskId}`),
  },

  blog: {
    list: (limit = 100) => get<{ posts: any[] }>(`/blog/posts?limit=${limit}`),
    get: (id: number) => get<{ post: any }>(`/blog/posts/${id}`),
    create: (body: any) => post<{ ok: boolean; id: number }>("/blog/posts", body),
    update: (id: number, body: any) => put<{ ok: boolean }>(`/blog/posts/${id}`, body),
    delete: (id: number) => {
      const appToken = localStorage.getItem("spetro_token");
      return fetch(`${BASE}/blog/posts/${id}`, {
        method: "DELETE",
        headers: appToken ? { "Authorization": `Bearer ${appToken}` } : {}
      }).then(res => res.json());
    },
    upload: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const appToken = localStorage.getItem("spetro_token");
      return fetch(`${BASE}/blog/upload`, {
        method: "POST",
        headers: appToken ? { "Authorization": `Bearer ${appToken}` } : {},
        body: formData
      }).then(res => res.json());
    }
  },


  datasets: {
    list: (source: string) => get<{ records: DatasetRecord[] }>("/datasets?source=" + source),
    preview: (id: string, source: string) => get<any>(`/datasets/${id}/preview?source=${source}`),
    upload: async (fd: FormData) => {
      const r = await fetch(BASE + "/datasets/upload", { method: "POST", body: fd });
      if (!r.ok) {
        const e = await r.json().catch(() => ({ detail: r.statusText }));
        throw new Error(e.detail ?? r.statusText);
      }
      return r.json() as Promise<DatasetRecord>;
    },
    uploadWithProgress: (fd: FormData, onProgress: (pct: number) => void) => {
      return new Promise<DatasetRecord>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", BASE + "/datasets/upload");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            onProgress(Math.round((e.loaded * 100) / e.total));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try { resolve(JSON.parse(xhr.responseText)); } 
            catch { reject(new Error("Invalid response")); }
          } else {
            let msg = xhr.statusText;
            try { msg = JSON.parse(xhr.responseText).detail || msg; } catch {}
            reject(new Error(msg));
          }
        };
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(fd);
      });
    },
    addLink: (body: any) => post<DatasetRecord>("/datasets/link", body),
    delete: (id: string, source: string) =>
      fetch(BASE + "/datasets/" + id + "?source=" + source, { method: "DELETE" }).then(async (r) => {
        if (!r.ok) {
           let msg = r.statusText;
           try { msg = (await r.json()).detail || msg; } catch {}
           throw new Error(msg);
        }
        return r.json();
      }),
  },

  community: {
    getComments: (params?: { tag?: string, search?: string, limit?: number, offset?: number, category?: string }) => {
      const q = new URLSearchParams();
      if (params?.tag) q.append('tag', params.tag);
      if (params?.search) q.append('search', params.search);
      if (params?.limit) q.append('limit', params.limit.toString());
      if (params?.offset) q.append('offset', params.offset.toString());
      if (params?.category) q.append('category', params.category);
      const qs = q.toString();
      return get<{ comments: Array<{id: number, author: string, content: string, tag: string, image_url: string, timestamp: string, is_edited: boolean, parent_id: number | null, upvotes: number, upvoted_by: string[], category: string}>, is_frozen: boolean, blocked_users: string[] }>(`/community/comments${qs ? '?' + qs : ''}`);
    },
    postComment: (body: { author: string, content: string, tag?: string, image_url?: string, parent_id?: number, category?: string }) => post<{ status: string, id: number }>("/community/comments", body),
    editComment: (id: number, body: { author: string, content: string }) => put<{ status: string }>(`/community/comments/${id}`, body),
    deleteComment: (id: number, author?: string) => fetch(BASE + `/community/comments/${id}${author ? '?author=' + encodeURIComponent(author) : ''}`, { method: "DELETE", headers: { "Authorization": `Bearer ${localStorage.getItem("spetro_token") || ''}` } }).then(r => r.json()),
    setFreeze: (frozen: boolean) => post<{ok: boolean}>("/community/settings/freeze", { frozen }),
    blockUser: (author: string) => post<{ok: boolean}>("/community/users/block", { author }),
    unblockUser: (author: string) => post<{ok: boolean}>("/community/users/unblock", { author }),
    toggleUpvote: (id: number, author: string) => post<{status: string, is_upvoted: boolean}>(`/community/comments/${id}/toggle-upvote`, { author }),
    uploadImage: async (fd: FormData) => {
      const headers: Record<string, string> = {};
      const appToken = localStorage.getItem("spetro_token");
      if (appToken) headers["Authorization"] = `Bearer ${appToken}`;
      const r = await fetch(BASE + "/community/upload", { method: "POST", headers, body: fd });
      if (!r.ok) {
        const e = await r.json().catch(() => ({ detail: r.statusText }));
        throw new Error(e.detail ?? r.statusText);
      }
      return r.json() as Promise<{ url: string }>;
    },
    getProfile: (author: string) => get<{ author: string, bio: string, avatar_url: string }>(`/community/profile/${encodeURIComponent(author)}`),
    updateProfile: (author: string, body: { bio: string, avatar_url?: string }) => put<{ status: string }>(`/community/profile/${encodeURIComponent(author)}`, body),
    getNotifications: (author: string) => get<{ notifications: Array<{id: number, sender: string, type: string, comment_id: number, read: boolean, timestamp: string}> }>(`/community/notifications/${encodeURIComponent(author)}`),
    markNotificationsRead: (author: string) => post<{ status: string }>(`/community/notifications/${encodeURIComponent(author)}/read`, {}),
  },

  auth: {
    updateProfile: (name: string) => put<{ ok: boolean, token: string, user: any }>("/auth/profile", { name }),
    changePassword: (old_password: string, new_password: string) => post<{ ok: boolean, message: string }>("/auth/change-password", { old_password, new_password }),
    getGeeUsage: () => get<{ used: number, limit: number | string }>("/auth/gee-usage"),
  },
  services: {
    requestService: (body: { service_type: string; message: string }) => post<{ ok: boolean }>("/services/request", body),
    getRequests: () => get<{ requests: any[] }>("/services/requests"),
  },
  admin: {
    notifyNewCourse: (title: string, description: string) => post<{ ok: boolean }>("/admin/notify-new-course", { title, description }),
  }
};
