import os
import re

pages_dir = r"c:\Users\user\Documents\blacportal\artifacts\geoportal\src\pages"
pages = [
    "SlopePage.tsx", "LandslidePage.tsx", "LandfillPage.tsx",
    "HabitatSuitabilityPage.tsx", "AirPollutionPage.tsx", "AccessibilityPage.tsx",
    "FloodPage.tsx", "DroughtPage.tsx"
]

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
                  style={{ background: typeof palette === 'function' ? palette(nClasses)[i] : (Array.isArray(palette) ? palette[i] : ["#08306b", "#313695", "#74add1", "#fee090", "#f46d43", "#a50026", "#000000", "#555555", "#999999", "#cccccc"][i % 10]) }}
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

    # We only want to replace the Slider block if "Rename Classes" is not present
    if "Rename Classes" not in content:
        # Regex to find the Slider block (Slider is self-closing)
        old_slider_regex = re.compile(
            r'<div className="space-y-2">\s*<Label>Classes:\s*\{nClasses\}</Label>\s*<Slider[\s\S]*?/>\s*</div>'
        )
        if old_slider_regex.search(content):
            content = old_slider_regex.sub(ui_block, content, count=1)
            with open(p_path, "w", encoding="utf-8") as f:
                f.write(content)
            print(f"Injected UI into {p}")
        else:
            print(f"Could not find Slider block in {p}")
    else:
        print(f"{p} already has Rename Classes")
