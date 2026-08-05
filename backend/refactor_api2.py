import os

path = "c:/Users/user/Documents/blacportal/artifacts/geoportal/src/lib/api.ts"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

new_methods = """
  async getRegions(country?: string, level1?: string): Promise<{regions: string[]}> {
    const params = new URLSearchParams();
    if (country) params.append("country", country);
    if (level1) params.append("level1", level1);
    const res = await fetch(`${BASE}/aoi/regions?${params.toString()}`);
    if (!res.ok) throw new Error("Failed to fetch regions");
    return res.json();
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
"""

content = content.replace("export const api = {", "export const api = {" + new_methods)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("api.ts updated with region/upload methods")
