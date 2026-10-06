import sys

with open(r'c:\Users\user\Documents\blacportal\artifacts\geoportal\src\pages\LandslidePage.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
for i, line in enumerate(lines):
    if 649 <= i <= 677:
        continue
    new_lines.append(line)

new_content = """              {/* Map Layer Switcher Header */}
              <div className="flex flex-col gap-3 mb-3 p-2 bg-muted/30 rounded-lg border">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[90px]">Map Symbology:</span>
                  <div className="inline-flex items-center rounded-md border bg-background p-0.5 text-xs shadow-2xs">
                    <button
                      onClick={() => setActiveLayer("classified")}
                      className={`px-3 py-1 rounded font-medium transition-all ${
                        activeLayer === "classified"
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      LSI Classified
                    </button>
                    <button
                      onClick={() => setActiveLayer("continuous")}
                      className={`px-3 py-1 rounded font-medium transition-all ${
                        activeLayer === "continuous"
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      LSI Continuous
                    </button>
                  </div>
                </div>
                
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[90px]">Factor Maps:</span>
                  <div className="inline-flex flex-wrap items-center rounded-md border bg-background p-0.5 text-xs shadow-2xs">
                    {FACTOR_LAYERS.map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => setActiveLayer(key)}
                        className={`px-3 py-1 rounded font-medium transition-all ${
                          activeLayer === key
                            ? "bg-primary text-primary-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>\n"""

lines.insert(649, new_content)

with open(r'c:\Users\user\Documents\blacportal\artifacts\geoportal\src\pages\LandslidePage.tsx', 'w', encoding='utf-8') as f:
    f.writelines(new_lines[:649] + [new_content] + new_lines[649:])
