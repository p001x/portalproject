import os
import re

pages_dir = r"c:\Users\user\Documents\blacportal\artifacts\geoportal\src\pages"
pages = [
    "LSTPage.tsx", "SlopePage.tsx", "LandslidePage.tsx", "LandfillPage.tsx",
    "HabitatSuitabilityPage.tsx", "AirPollutionPage.tsx", "AccessibilityPage.tsx",
    "FloodPage.tsx", "DroughtPage.tsx"
]

default_presets = """
const DEFAULT_PRESETS: Record<number, string[]> = {
  1: ["Uniform / Full Area"],
  2: ["Low", "High"],
  3: ["Low", "Moderate", "High"],
  4: ["Low", "Moderate", "High", "Very High"],
  5: ["Very Low", "Low", "Moderate", "High", "Very High"],
  6: ["Very Low", "Low", "Moderate", "High", "Very High", "Extreme"],
  7: ["Extremely Low", "Very Low", "Low", "Moderate", "High", "Very High", "Extreme"],
  8: ["Extremely Low", "Very Low", "Low", "Moderately Low", "Moderately High", "High", "Very High", "Extreme"],
  9: ["Extremely Low", "Very Low", "Low", "Moderately Low", "Moderate", "Moderately High", "High", "Very High", "Extreme"],
  10: ["Extremely Low", "Very Low", "Low", "Moderately Low", "Moderate", "Moderately High", "High", "Very High", "Extremely High", "Extreme"],
};

function getDefaultLabels(n: number): string[] {
  if (DEFAULT_PRESETS[n]) return [...DEFAULT_PRESETS[n]];
  return Array.from({ length: n }, (_, i) => `Class ${i + 1}`);
}
"""

state_vars = """  const [method, setMethod] = useState("natural_breaks");
  const [customClassNames, setCustomClassNames] = useState<string[]>(() => getDefaultLabels(5));

  useEffect(() => {
    setCustomClassNames((prev) => {
      if (prev.length === nClasses) return prev;
      const next = getDefaultLabels(nClasses);
      for (let i = 0; i < Math.min(prev.length, nClasses); i++) {
        if (!DEFAULT_PRESETS[prev.length]?.includes(prev[i])) {
          next[i] = prev[i];
        }
      }
      return next;
    });
  }, [nClasses]);

  const activeAreas = useMemo(() => {
    const rawAreas = data?.classify?.panels?.[0]?.class_areas || data?.class_areas_km2;
    if (!rawAreas) return undefined;
    const mapped: Record<string, number> = {};
    const keys = Object.keys(rawAreas);
    keys.forEach((oldKey, i) => {
      const newKey = customClassNames[i] || oldKey;
      mapped[newKey] = rawAreas[oldKey];
    });
    return mapped;
  }, [data, customClassNames]);
"""

ui_block = """
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Classification Method</Label>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select Method" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="natural_breaks">Natural Breaks (Jenks)</SelectItem>
              <SelectItem value="equal_interval">Discrete (Equal Interval)</SelectItem>
              <SelectItem value="quantiles">Discrete (Quantiles / Equal Area)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <Label>Classes: {nClasses}</Label>
            <span className="text-[11px] text-muted-foreground">{nClasses} intervals</span>
          </div>
          <Slider
            min={2}
            max={10}
            step={1}
            value={[nClasses]}
            onValueChange={([v]) => setNClasses(v)}
          />
        </div>

        <div className="space-y-3 bg-muted/40 border rounded-lg p-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
              <Tag className="w-3.5 h-3.5 text-primary" />
              Rename Classes ({nClasses})
            </Label>
            <button
              type="button"
              onClick={() => setCustomClassNames(getDefaultLabels(nClasses))}
              className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
              title="Reset to default names"
            >
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          </div>

          <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
            {Array.from({ length: nClasses }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <span
                  className="w-3.5 h-3.5 rounded-xs shrink-0 border border-black/15 shadow-2xs"
                  style={{ background: ["#08306b", "#313695", "#74add1", "#fee090", "#f46d43", "#a50026", "#000000", "#555555", "#999999", "#cccccc"][i % 10] }}
                />
                <input
                  type="text"
                  value={customClassNames[i] || ""}
                  placeholder={`Class ${i + 1}`}
                  onChange={(e) => {
                    const next = [...customClassNames];
                    next[i] = e.target.value;
                    setCustomClassNames(next);
                  }}
                  className="flex-1 h-7 text-xs rounded border border-input bg-background px-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            ))}
          </div>
        </div>
"""

for p in pages:
    p_path = os.path.join(pages_dir, p)
    if not os.path.exists(p_path):
        continue
        
    with open(p_path, "r", encoding="utf-8") as f:
        content = f.read()
        
    if "Tag, RotateCcw" in content:
        print(f"Skipping {p}, already has UI")
        continue

    # 1. Imports
    if "import { Tag, RotateCcw } from" not in content:
        content = re.sub(
            r'import {([^}]+)} from "lucide-react";',
            r'import {\1, Tag, RotateCcw } from "lucide-react";',
            content
        )
        
    # 2. Defaults before component
    if "DEFAULT_PRESETS" not in content:
        content = re.sub(r'(export function [A-Za-z]+Page\(\)\s*\{)', default_presets + r'\n\1', content)

    # 3. State vars
    if "const [method, setMethod]" not in content:
        content = re.sub(
            r'(const \[nClasses, setNClasses\] = useState[^\n]+;)',
            r'\1\n' + state_vars,
            content
        )

    # 4. We also need useMemo
    if "useMemo" not in content:
        content = re.sub(r'import \{ useState, useEffect \} from "react";', r'import { useState, useEffect, useMemo } from "react";', content)

    # 5. Mutate args
    if "method: method" not in content:
        content = re.sub(
            r'n_classes: nClasses\s*\}\)',
            r'n_classes: nClasses, method: method, custom_labels: customClassNames })',
            content
        )
        # Also handle cases where there might be a trailing comma
        content = re.sub(
            r'n_classes: nClasses\s*,\s*\}\)',
            r'n_classes: nClasses, method: method, custom_labels: customClassNames })',
            content
        )
        
    # 6. UI elements - replace Slider block
    old_slider_regex = r'<div className="space-y-2">\s*<Label>Classes: \{nClasses\}</Label>\s*<Slider[\s\S]*?</Slider>\s*</div>'
    if "Rename Classes" not in content:
        content = re.sub(old_slider_regex, ui_block, content)

    # 7. Change MapExportControls to use activeAreas
    content = re.sub(r'classAreas=\{data\?\.class_areas_km2\}', r'classAreas={activeAreas}', content)

    # 8. Change BarChart Object.entries(data.class_areas_km2) to Object.entries(activeAreas)
    content = re.sub(r'Object\.entries\(\s*data\?\.class_areas_km2\s*\)', r'Object.entries(activeAreas || {})', content)
    content = re.sub(r'Object\.entries\(\s*data\.class_areas_km2\s*\)', r'Object.entries(activeAreas || {})', content)

    with open(p_path, "w", encoding="utf-8") as f:
        f.write(content)
        
    print(f"Updated {p}")
