import re
import os

path = "c:/Users/user/Documents/blacportal/artifacts/geoportal/src/lib/api.ts"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Add AOIConfig interface at the top
aoi_config_str = """
export interface AOIConfig {
  type: "gaul0" | "gaul1" | "gaul2" | "geojson";
  country?: string;
  level1?: string;
  level2?: string;
  geojson?: any;
  district?: string;
  name?: string;
}
"""
content = re.sub(r'(export interface NDVIRequest)', aoi_config_str + r'\n\1', content)

# Replace all Request interfaces' "district: string;" with "aoi: AOIConfig; district?: string;"
content = re.sub(r'  district: string;\n', r'  aoi: AOIConfig;\n  district?: string;\n', content)
# Wait, ReportRequest and StaticMapRequest might be defined differently.
# But StaticMapRequest should just take bbox
content = content.replace("district: string;\n  title: string;", "district: string;\n  bbox?: number[];\n  title: string;")

# Add bbox to Result interfaces
content = re.sub(r'  center: \[number, number\];\n', r'  center: [number, number];\n  bbox?: number[];\n', content)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("api.ts updated")
