/**
 * Typed API client for the GeoPortal FastAPI backend.
 * All calls go through Vite's dev proxy (/api → localhost:8000)
 * so the same code works in production behind the reverse proxy.
 */

export const BASE = "https://geoportal-api-ygzi.onrender.com/api";

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


export interface AOIConfig {
  type: "gaul0" | "gaul1" | "gaul2" | "geojson";
  country?: string;
  level1?: string;
  level2?: string;
  geojson?: any;
  district?: string;
  name?: string;
}

export interface NDVIRequest {
  aoi: AOIConfig;
  district?: string;
  start_date: string;
  end_date: string;
  n_classes: number;
}

export interface ClassifyPanel {
  letter: string;
  name: string;
  title: string;
  tile_url: string;
  thumb_url: string;
  areas: Record<string, number>;
  breakpoints: number[];
}

export interface NDVIResult {
  tile_url: string;
  stats: Record<string, number>;
  class_areas_km2: Record<string, number>;
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

export interface RUSLEResult {
  tile_url: string;
  risk_index: {
    tile_url: string;
    thumb_url: string;
    mean: number;
    std_dev: number;
    class_areas_km2: Record<string, number>;
    weight_pct_each: number;
  };
  stats: Record<string, number>;
  factor_means: Record<string, number>;
  class_areas_km2: Record<string, number>;
  n_class_soil_loss_km2: Record<string, number>;
  n_class_soil_loss_tile: string;
  factor_maps: Record<string, {
    label: string;
    tile_url: string;
    thumb_url: string;
    download_url: string;
    class_tile_url?: string;
    class_thumb_url?: string;
    reversed?: boolean;
    direction_desc?: string;
  }>;
  reverse_flags: Record<string, boolean>;
  center: [number, number];
  bbox?: number[];
  aoi: AOIConfig;
  district?: string;
  year: number;
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

export interface AirPollutionResult {
  tile_url: string;
  download_url?: string;
  stats: Record<string, number>;
  exceeds_who: boolean;
  time_series: Array<{ year: number; month: number; "NO2 (µmol/m²)": number }>;
  classify: { panels: ClassifyPanel[]; n_classes: number; percentile_steps: number[] };
  center: [number, number];
  bbox?: number[];
  aoi: AOIConfig;
  district?: string;
  start_date: string;
  end_date: string;
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
  n_classes?: number;
}
export interface AccessibilityMapResult {
  travel_time_tile_url: string;
  acc_class_tile_url: string;
  roads_tile_url?: string;
  center: [number, number];
  bbox?: number[];
  district?: string;
  facilities?: { lon: number; lat: number; name: string; type: string }[];
  nearest_road_geojson?: any;
  farthest_road_geojson?: any;
  incidents?: { lon: number; lat: number; name: string }[];
  routes?: { geometry: any; incident_name: string; facility_name: string; distance_km: number }[];
}
export interface AccessibilityStatsResult {
  stats: Record<string, number>;
  class_areas_km2: Record<string, number>;
  nearest_facility?: { lon: number; lat: number; name: string; type: string; distance_km: number };
  farthest_facility?: { lon: number; lat: number; name: string; type: string; distance_km: number };
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
    return err.detail.map((e: any) => e.msg || e.detail || JSON.stringify(e)).join("; ");
  }
  if (typeof err.detail === "object" && err.detail !== null) {
    return err.detail.msg || err.detail.error || err.detail.message || JSON.stringify(err.detail);
  }
  if (typeof err.message === "string") return err.message;
  return fallback;
}

async function post<T>(path: string, body: unknown, opts?: { withGeeAuth?: boolean }): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
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
  return res.json() as Promise<T>;
}

async function get<T>(path: string, opts?: { withGeeAuth?: boolean }): Promise<T> {
  const headers: Record<string, string> = {};
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
}

export const api = {
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

  health: () => get<{ status: string }>("/health"),
  districts: () => get<{ districts: string[] }>("/districts"),
  ndvi: (req: NDVIRequest) => post<NDVIResult>("/ndvi", req),
  lst: (req: { aoi: AOIConfig; district?: string; start_date: string; end_date: string; n_classes: number }) =>
    post<LSTResult>("/lst", req),
  rusle: (req: {
    aoi: AOIConfig;
  district?: string;
    year: number;
    n_classes: number;
    reverse_r: boolean;
    reverse_k: boolean;
    reverse_ls: boolean;
    reverse_c: boolean;
    reverse_p: boolean;
  }) => post<RUSLEResult>("/rusle", req),
  slope: (req: { aoi: AOIConfig; district?: string; n_classes: number }) =>
    post<SlopeResult>("/slope", req),
  landfill: (req: {
    aoi: AOIConfig;
  district?: string;
    n_classes?: number;
    reverse_river?: boolean;
    reverse_residential?: boolean;
    reverse_slope?: boolean;
    reverse_road?: boolean;
    reverse_lulc?: boolean;
    custom_weights?: Record<string, number>;
  }) => post<LandfillResult>("/landfill", req),
  airPollution: (req: any) => post<AirPollutionResult>("/air-pollution", req),
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
  drought: (req: {
    aoi: AOIConfig;
  district?: string;
    year: number;
    n_classes: number;
    reverse_sm?: boolean;
    reverse_rf?: boolean;
    reverse_ndvi?: boolean;
    reverse_vci?: boolean;
    reverse_lst?: boolean;
    reverse_cdd?: boolean;
    reverse_evi?: boolean;
  }) => post<DroughtResult>("/drought", req),
  flood: (req: {
    aoi: AOIConfig;
  district?: string;
    start_year: number;
    end_year: number;
    n_classes: number;
    reverse_rainfall?: boolean;
    reverse_twi?: boolean;
    reverse_lulc?: boolean;
    reverse_elevation?: boolean;
    reverse_slope?: boolean;
    reverse_river_dist?: boolean;
    reverse_road_dist?: boolean;
    reverse_soil_type?: boolean;
    reverse_drainage_density?: boolean;
    reverse_ndvi?: boolean;
    custom_weights?: Record<string, number>;
  }) => post<FloodResult>("/flood", req),
  uhi: (req: any) => post<UHIResult>("/uhi", req),
  adminVerify: (password: string) => post<{ ok: boolean }>("/admin/verify", { password }),
  /** Download a PDF report as a Blob */
  report: async (body: {
    module_name: string;
    aoi: AOIConfig;
  district?: string;
    date_range: string;
    stats: Record<string, number>;
    class_areas: Record<string, number>;
    extra_notes?: string;
    maps?: Array<[string, string]>;
  }): Promise<Blob> => {
    const res = await fetch(`${BASE}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error((err as any).detail ?? res.statusText);
    }
    return res.blob();
  },
  staticMap: async (body: StaticMapPayload): Promise<Blob> => {
    const res = await fetch(`${BASE}/static-map`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error((err as any).detail ?? res.statusText);
    }
    return res.blob();
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
      post<{ tile_url: string; download_url?: string; visualized_download_url?: string; classes: string[]; colors: Record<string, string>; class_values?: Record<string, number>; areas: Record<string, number>; accuracy?: any }>(
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
    addLink: (body: any) => post<DatasetRecord>("/datasets/link", body),
    delete: (id: string, source: string) =>
      fetch(BASE + "/datasets/" + id + "?source=" + source, { method: "DELETE" }).then((r) =>
        r.json()
      ) as Promise<{ ok: boolean }>,
  },
};
