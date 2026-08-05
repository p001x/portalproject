import os
import re

# Update DistrictMap.tsx
path = "c:/Users/user/Documents/blacportal/artifacts/geoportal/src/components/DistrictMap.tsx"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("center: [number, number];", "center: [number, number];\n  bbox?: number[][];")
flyto = """/** Fly to a new center/bounds when it changes. */
function FlyTo({ center, zoom, bbox }: { center: [number, number]; zoom: number; bbox?: number[][] }) {
  const map = useMap();
  useEffect(() => {
    if (bbox && bbox.length >= 4) {
      // bbox is usually [[lon_min, lat_min], [lon_max, lat_min], [lon_max, lat_max], [lon_min, lat_max], ...]
      const latMin = Math.min(...bbox.map(c => c[1]));
      const latMax = Math.max(...bbox.map(c => c[1]));
      const lonMin = Math.min(...bbox.map(c => c[0]));
      const lonMax = Math.max(...bbox.map(c => c[0]));
      map.flyToBounds([[latMin, lonMin], [latMax, lonMax]], { duration: 1.2, maxZoom: 14 });
    } else {
      map.flyTo(center, zoom, { duration: 1.2 });
    }
  }, [center, zoom, bbox, map]);
  return null;
}"""
content = re.sub(r'/\*\* Fly to a new center when it changes\. \*/[\s\S]*?return null;\n\}', flyto, content)

content = content.replace("export function DistrictMap({\n  center,\n  tileUrl,", "export function DistrictMap({\n  center,\n  bbox,\n  tileUrl,")
content = content.replace("<FlyTo center={center} zoom={zoom} />", "<FlyTo center={center} zoom={zoom} bbox={bbox} />")

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("DistrictMap updated")

# Now update all pages
pages_dir = "c:/Users/user/Documents/blacportal/artifacts/geoportal/src/pages"
pages = [f for f in os.listdir(pages_dir) if f.endswith(".tsx")]

for p in pages:
    p_path = os.path.join(pages_dir, p)
    with open(p_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Import StudyAreaSelector
    if "import { StudyAreaSelector }" not in content and "const [district" in content:
        content = re.sub(
            r'import \{ (.*?) \} from "@/components/ui/select";', 
            r'import { \1 } from "@/components/ui/select";\nimport { StudyAreaSelector } from "@/components/StudyAreaSelector";', 
            content
        )

    # Replace district state
    content = re.sub(
        r'const \[district, setDistrict\] = useState\([^)]+\);',
        r'const [aoi, setAoi] = useState<AOIConfig>({ type: "gaul2", country: "Rwanda", name: "Musanze", level1: "Northern Province", level2: "Musanze" });',
        content
    )

    # In mutate API call, replace `district,` with `aoi,`
    content = re.sub(r'\bdistrict,(\n|\s)', r'aoi,\n        ', content)
    
    # In MapExportControls, replace `district={district}` with `district={aoi.name || "Custom"}`
    content = re.sub(r'district=\{district\}', r'district={aoi.name || "Custom"}', content)
    content = re.sub(r'district=\{data\.district\}', r'district={aoi.name || "Custom"}', content)
    
    # In DistrictMap, add bbox={data?.bbox}
    content = re.sub(r'<DistrictMap\n\s*center=\{', r'<DistrictMap\n            bbox={data?.bbox as any}\n            center={', content)
    
    # Replace district Select with StudyAreaSelector
    select_block = r'<div className="space-y-1">\n\s*<Label>District</Label>\n\s*<Select value=\{district\}[\s\S]*?</Select>\n\s*</div>'
    content = re.sub(select_block, r'<StudyAreaSelector value={aoi} onChange={setAoi} />', content)

    # Replace DISTRICTS mapping block if it was different
    content = re.sub(r'<Label>District</Label>[\s\S]*?<SelectContent>[\s\S]*?</SelectContent>[\s\S]*?</Select>', r'<StudyAreaSelector value={aoi} onChange={setAoi} />', content)

    # In InteractiveMapEditor (if any), change district usage
    content = re.sub(r'const district = searchParams\.get\("district"\) \|\| ""', r'const district = searchParams.get("district") || "Custom"', content)

    with open(p_path, "w", encoding="utf-8") as f:
        f.write(content)

print("Pages updated")
