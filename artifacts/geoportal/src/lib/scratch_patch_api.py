with open('api.ts', 'r', encoding='utf-8') as f:
    code = f.read()

# Replace DroughtResult
old_result = '''export interface DroughtResult {
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
}'''

new_result = '''export interface DroughtResult {
  dvi_tile_url: string;
  dvi_download_url?: string;
  dvi_thumb_url: string;
  dvi_class_tile_url: string;
  dvi_class_thumb_url: string;
  factor_maps?: Record<string, { tile_url: string; thumb_url: string; label: string; reversed: boolean }>;
  factor_means?: Record<string, number>;
  weights_used?: Record<string, number>;
  stats: Record<string, number>;
  class_areas_km2: Record<string, number>;
  classify: { panels: ClassifyPanel[]; n_classes: number; percentile_steps: number[] };
  center: [number, number];
  bbox?: number[];
  aoi: AOIConfig;
  district?: string;
  year: number;
}'''

code = code.replace(old_result, new_result)

# Replace api.drought definition
old_api = '''  drought: (req: any) => post<DroughtResult>("/drought", req),
  flood: {'''

new_api = '''  drought: {
    map: (req: any) => post<DroughtResult>("/drought", req),
    ahp: (req: any) => post<any>("/drought/ahp", req)
  },
  flood: {'''

code = code.replace(old_api, new_api)

with open('api.ts', 'w', encoding='utf-8') as f:
    f.write(code)
