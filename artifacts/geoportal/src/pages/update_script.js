const fs = require('fs');

const path = 'c:/Users/user/Documents/blacportal/artifacts/geoportal/src/pages/HabitatSuitabilityPage.tsx';
let code = fs.readFileSync(path, 'utf8');

// Replace static definitions
code = code.replace(/const FACTOR_KEYS = \[.*?\] as const;\ntype FactorKey = typeof FACTOR_KEYS\[number\];\n\nconst FACTOR_LABELS: Record<FactorKey, string> = \{[\s\S]*?};\n\nconst DEFAULT_WEIGHTS: Record<FactorKey, number> = \{[\s\S]*?};\n/, '');

code = code.replace(/function loadWeights[\s\S]*?return \{ \.\.\.DEFAULT_WEIGHTS \};\n\}\n/, '');
code = code.replace(/function saveWeights[\s\S]*?\}\n/, '');
code = code.replace(/\/\*\* Normalize weight record[\s\S]*?\n\}\n/, '');

// Add useQuery to imports
code = code.replace('import { useMutation } from "@tanstack/react-query";', 'import { useQuery, useMutation } from "@tanstack/react-query";');

// Update FactorMapCard signature
code = code.replace(
    'function FactorMapCard({ factorKey, factor, analysisDate }: {',
    'function FactorMapCard({ factorKey, factor, analysisDate, factorLabels }: {'
);
code = code.replace('FACTOR_LABELS[factorKey as FactorKey]', 'factorLabels[factorKey]');

// Update HabitatSuitabilityPage
const pageStart = code.indexOf('export function HabitatSuitabilityPage() {');
if (pageStart !== -1) {
    const newPage = `export function HabitatSuitabilityPage() {
  const { data: config, isLoading: isConfigLoading } = useQuery({
    queryKey: ["habitatConfig"],
    queryFn: api.habitatConfig,
  });

  const [aoi, setAoi] = useState<AOIConfig>({ type: "rwanda", country: "Rwanda", province: "Kigali City", name: "Kigali City" });
  const effectiveDistrictName = aoi.name || "Custom Study Area";
  const [activeLayer, setActiveLayer] = useState<string>("suitability");
  
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [year, setYear] = useState<number>(2021);
  const [landcoverScores, setLandcoverScores] = useState<Record<string, number>>({});
  
  const [ahpData, setAhpData] = useState<AhpData | null>(null);
  const [reverseFlags, setReverseFlags] = useState<Record<string, boolean>>({});
  const [nClasses, setNClasses] = useState(5);
  const [method, setMethod] = useState("natural_breaks");
  const [customClassNames, setCustomClassNames] = useState<string[]>(() => getDefaultLabels(5));
  const [activeTab, setActiveTab] = useState("map");

  // Initialize from config
  useEffect(() => {
    if (config) {
      if (Object.keys(weights).length === 0) {
        try {
          const stored = localStorage.getItem(\`habitat_weights_\${effectiveDistrictName}\`);
          if (stored) {
            setWeights({ ...config.default_weights, ...JSON.parse(stored) });
          } else {
            setWeights({ ...config.default_weights });
          }
        } catch {
          setWeights({ ...config.default_weights });
        }
      }
      if (Object.keys(landcoverScores).length === 0) {
        setLandcoverScores({ ...config.default_landcover_scores });
      }
      if (config.available_years?.length > 0 && !config.available_years.includes(year)) {
        setYear(config.available_years[config.available_years.length - 1]);
      }
    }
  }, [config, effectiveDistrictName]);

  const normalize = useCallback((w: Record<string, number>) => {
    if (!config) return w;
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    if (total === 0) return { ...config.default_weights };
    const factors = config.factors as string[];
    return Object.fromEntries(
      factors.map((k) => [k, Math.round((w[k] / total) * 1000) / 10])
    ) as Record<string, number>;
  }, [config]);

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

  const getReq = useCallback(() => {
    const norm = normalize(weights);
    const custom_weights: Record<string, number> = {};
    Object.entries(norm).forEach(([k, v]) => { custom_weights[k] = v / 100.0; });
    return {
      aoi: aoi,
      reverse_flags: reverseFlags,
      n_classes: nClasses,
      custom_weights,
      method: method,
      custom_labels: customClassNames,
      year: year,
      landcover_scores: landcoverScores
    };
  }, [weights, aoi, reverseFlags, nClasses, method, customClassNames, year, landcoverScores, normalize]);

  const analysisMutation = useMutation({
    mutationFn: async () => api.habitat(getReq()),
    onSuccess: () => setActiveTab("map"),
  });

  const runAnalysis = () => {
    analysisMutation.mutate();
  };

  const isPending = analysisMutation.isPending;
  const anyData = analysisMutation.data;
  const mapData = analysisMutation.data;
  const statsData = analysisMutation.data;
  const classifyData = analysisMutation.data;
  const exportData = analysisMutation.data;
  const data = analysisMutation.data;

  const { mutate: updateAhp } = useMutation({
    mutationFn: async (w: Record<string, number>) => {
      const norm = normalize(w);
      const custom_weights: Record<string, number> = {};
      Object.entries(norm).forEach(([k, v]) => { custom_weights[k] = v / 100.0; });
      return api.habitatAhp(custom_weights);
    },
    onSuccess: (res) => setAhpData(res),
  });

  useEffect(() => {
    if (Object.keys(weights).length > 0) {
      updateAhp(weights);
    }
  }, [weights, updateAhp]);

  const handleWeightChange = (k: string, val: number) => {
    const newW = { ...weights, [k]: val };
    setWeights(newW);
    try { localStorage.setItem(\`habitat_weights_\${effectiveDistrictName}\`, JSON.stringify(newW)); } catch {}
  };

  const handleReset = () => {
    if (!config) return;
    setWeights({ ...config.default_weights });
    try { localStorage.setItem(\`habitat_weights_\${effectiveDistrictName}\`, JSON.stringify(config.default_weights)); } catch {}
    setReverseFlags({});
    setLandcoverScores({ ...config.default_landcover_scores });
  };

  const chartData = statsData ? Object.entries(statsData.class_areas_km2).map(([name, area]) => ({ name, area })) : [];

  if (isConfigLoading) {
    return <div className="flex h-[600px] items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  if (!config) return <div className="p-8 text-red-500">Failed to load configuration.</div>;

  const FACTOR_KEYS = config.factors as string[];
  const FACTOR_LABELS = Object.fromEntries(
    Object.entries(config.factor_meta).map(([k, v]: any) => [k, v.label])
  ) as Record<string, string>;

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Crane Habitat Suitability</h1>
          <p className="text-muted-foreground mt-2 max-w-3xl">
            Multi-Criteria Evaluation (MCE) for Grey Crowned Cranes using the Analytical Hierarchy Process (AHP).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1">
          <div className="bg-card border rounded-lg shadow-sm flex flex-col h-[calc(100vh-160px)] sticky top-20 overflow-hidden">
            <h3 className="font-semibold text-lg flex items-center border-b p-5 shrink-0">
              Configuration
            </h3>
            
            <div className="flex-1 overflow-y-auto min-h-0 px-5 py-4">
              <div className="space-y-5">
                <div className="space-y-3">
                  <Label>Study Area</Label>
                  <StudyAreaSelector value={aoi} onChange={setAoi} />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Analysis Year</Label>
                  <Select value={year.toString()} onValueChange={(v) => setYear(parseInt(v))}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select Year" />
                    </SelectTrigger>
                    <SelectContent>
                      {config.available_years.map((y: number) => (
                        <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

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
                          placeholder={\`Class \${i + 1}\`}
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

                <div className="pt-2 border-t space-y-4">
                  <div className="flex justify-between items-center">
                    <Label className="text-base font-semibold">AHP Weights</Label>
                    <Button variant="ghost" size="sm" onClick={handleReset} className="h-8 px-2 text-xs">
                      Reset Defaults
                    </Button>
                  </div>

                  {ahpData && (
                    <div className={\`p-3 rounded-md text-sm \${ahpData.consistent ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}\`}>
                      <div className="flex justify-between items-center font-medium">
                        <span>Consistency Ratio (CR):</span>
                        <span>{ahpData.cr.toFixed(3)}</span>
                      </div>
                      <p className="text-xs mt-1 opacity-90">
                        {ahpData.consistent ? 'CR < 0.10. Weights are perfectly consistent.' : 'CR > 0.10. Weights are inconsistent.'}
                      </p>
                    </div>
                  )}

                  <div className="space-y-3">
                    {FACTOR_KEYS.map((k) => (
                      <div key={k} className="space-y-1.5">
                        <div className="flex justify-between text-xs font-medium text-slate-700">
                          <span>{FACTOR_LABELS[k]}</span>
                          <span className="font-mono text-slate-500">{weights[k] ?? 0}</span>
                        </div>
                        <Slider
                          value={[weights[k] ?? 0]}
                          min={0} max={100} step={1}
                          className="py-1"
                          onValueChange={([val]) => handleWeightChange(k, val)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="pt-2 border-t space-y-4">
                  <div className="flex justify-between items-center">
                    <Label className="text-base font-semibold">Land Cover Scores (1-5)</Label>
                  </div>
                  <div className="space-y-3">
                    {Object.keys(config.default_landcover_scores).map((k) => (
                      <div key={k} className="space-y-1.5">
                        <div className="flex justify-between text-xs font-medium text-slate-700">
                          <span>Class {k}</span>
                          <span className="font-mono text-slate-500">{landcoverScores[k] ?? 0}</span>
                        </div>
                        <Slider
                          value={[landcoverScores[k] ?? 0]}
                          min={1} max={5} step={1}
                          className="py-1"
                          onValueChange={([val]) => setLandcoverScores({...landcoverScores, [k]: val})}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2.5 pt-2 border-t">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Reverse Polarity
                  </Label>
                  <div className="space-y-2 text-xs">
                    {FACTOR_KEYS.map((k) => (
                      <div key={k} className="flex items-center justify-between">
                        <span>{FACTOR_LABELS[k]}</span>
                        <Switch
                          checked={reverseFlags[k] || false}
                          onCheckedChange={(c) => setReverseFlags({ ...reverseFlags, [k]: c })}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-5 border-t shrink-0">
              <Button onClick={runAnalysis} disabled={isPending} className="w-full h-11 text-base">
                {isPending && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                {isPending ? "Generating Map..." : "Run AHP Overlay"}
              </Button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-3 flex flex-col h-[calc(100vh-160px)] sticky top-20">
          {isPending && !anyData ? (
            <div className="h-[600px] border rounded-lg flex flex-col items-center justify-center bg-slate-50/50 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin mb-4" />
              <p>Analyzing Habitat Suitability...</p>
            </div>
          ) : anyData ? (
            <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="h-full flex flex-col w-full">
              <div className="flex items-center justify-between mb-4">
                <TabsList className="self-start">
                  <TabsTrigger value="map">Map</TabsTrigger>
                  <TabsTrigger value="stats">Statistics</TabsTrigger>
                  <TabsTrigger value="factors">Factor Maps</TabsTrigger>
                  <TabsTrigger value="static-map">Static Maps</TabsTrigger>
                  <TabsTrigger value="report" className="gap-1.5"><FileText className="w-3.5 h-3.5" />Report</TabsTrigger>
                </TabsList>
                
                <div className="flex gap-2">
                  {exportData?.download_url ? (
                    <Button variant="outline" size="sm" asChild>
                      <a href={exportData.download_url} download target="_blank" rel="noreferrer">
                        <FileText className="w-4 h-4 mr-2" /> Download Final TIF
                      </a>
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" disabled>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Preparing TIF...
                    </Button>
                  )}
                </div>
              </div>

              <TabsContent value="map" className="flex-1 min-h-[500px] mt-0">
                <div className="bg-card border rounded-lg p-5 shadow-sm">
                  <h3 className="font-semibold text-lg mb-4">
                    Habitat Suitability (Weighted Overlay) — {effectiveDistrictName}
                  </h3>
                  <div className="h-[520px] rounded-lg overflow-hidden border">
                    {mapData ? (
                      <DistrictMap center={mapData.center} bbox={mapData.bbox as any} tileUrl={mapData.tile_url} legend={SUITABILITY_LEGEND} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-slate-50">
                        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="stats" className="flex-1 overflow-y-auto space-y-6 mt-0">
                <div>
                  <h2 className="font-semibold text-lg mb-1">Statistics — {effectiveDistrictName}</h2>
                  <p className="text-sm text-muted-foreground">Area distribution and AHP Weights Applied.</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-card rounded-lg p-5 border shadow-sm">
                    <h4 className="font-medium mb-4 flex items-center">Area Statistics</h4>
                    <div className="h-[300px]">
                      {statsData ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 30, top: 0, bottom: 0 }}>
                            <XAxis type="number" unit=" km²" fontSize={11} />
                            <YAxis dataKey="name" type="category" width={80} fontSize={11} tickFormatter={(val: string) => val.split(" ")[0]} />
                            <Tooltip formatter={(val: number) => [\`\${val} km²\`, "Area"]} cursor={{fill: 'transparent'}} />
                            <Bar dataKey="area" radius={[0, 4, 4, 0]} barSize={20}>
                              {chartData.map((entry: any, index: number) => (
                                <Cell key={\`cell-\${index}\`} fill={CLASS_COLOR_LIST[index % CLASS_COLOR_LIST.length]} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-card rounded-lg p-5 border text-sm shadow-sm">
                    <h4 className="font-medium mb-4">AHP Weights Applied</h4>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                      {exportData ? (
                        Object.entries(exportData.factors).map(([k, v]: any) => (
                          <div key={k} className="flex justify-between items-center text-sm p-2 bg-slate-50/50 rounded border border-slate-100">
                            <span className="text-muted-foreground">{v.label}</span>
                            <span className="font-semibold">{v.weight_pct.toFixed(1)}%</span>
                          </div>
                        ))
                      ) : (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="factors" className="flex-1 overflow-y-auto space-y-6 mt-0">
                <div className="bg-card border rounded-lg p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-lg">Reclassified Criterion Maps (Scores 1-5)</h3>
                      <p className="text-sm text-muted-foreground">Individual factor maps reclassified into suitability scores based on AHP polarity.</p>
                    </div>
                  </div>
                  {exportData ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {FACTOR_KEYS.map((k) => (
                        <FactorMapCard
                          key={k}
                          factorKey={k}
                          factor={exportData.factors[k]}
                          analysisDate={new Date().toLocaleDateString()}
                          factorLabels={FACTOR_LABELS}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="h-64 flex flex-col items-center justify-center text-muted-foreground">
                      <Loader2 className="w-8 h-8 animate-spin mb-4" />
                      <p>Generating factor maps...</p>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="static-map" className="flex-1 overflow-y-auto space-y-4 mt-0">
                <div>
                  <h2 className="font-semibold text-lg mb-1">Professional Cartography</h2>
                  <p className="text-sm text-muted-foreground">High-quality static maps ready for presentation.</p>
                </div>
                
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">Select Map to Export:</span>
                  <div className="flex flex-wrap gap-2 mb-2">
                    <Button
                      size="sm"
                      variant={activeLayer === "suitability" ? "default" : "outline"}
                      onClick={() => setActiveLayer("suitability")}
                    >
                      Final Suitability
                    </Button>
                    {FACTOR_KEYS.map((k) => (
                      <Button
                        key={k}
                        size="sm"
                        variant={activeLayer === k ? "default" : "outline"}
                        onClick={() => setActiveLayer(k)}
                      >
                        {FACTOR_LABELS[k]}
                      </Button>
                    ))}
                  </div>
                </div>

                {analysisMutation?.isPending && !exportData ? (
                   <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                ) : exportData && mapData ? (
                  <div className="bg-card border rounded-lg p-4">
                    <MapExportControls
                      tileUrl={activeLayer === "suitability" ? mapData.tile_url : mapData.factor_maps?.[activeLayer]?.tile_url || mapData.tile_url}
                      thumbUrl={activeLayer === "suitability" ? exportData.thumb_url : exportData.factors[activeLayer]?.thumb_url}
                      downloadUrl={activeLayer === "suitability" ? exportData.download_url : exportData.factors[activeLayer]?.download_url}
                      district={effectiveDistrictName}
                      title={activeLayer === "suitability" ? "Crane Habitat Suitability" : \`\${FACTOR_LABELS[activeLayer as string]} Factor\`}
                      classAreas={activeLayer === "suitability" ? (statsData?.class_areas_km2 || {}) : undefined}  bbox={data?.bbox}
                    />
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">Waiting for map data to load...</div>
                )}
              </TabsContent>

              <TabsContent value="report" className="space-y-6 mt-0">
                <div>
                  <h2 className="font-semibold text-lg mb-1">PDF Report — {effectiveDistrictName}</h2>
                  <p className="text-sm text-muted-foreground">
                    Download a full PDF report including habitat suitability statistics, area analysis, and factor maps.
                  </p>
                </div>
                <div className="bg-card border rounded-lg p-5 space-y-4 shadow-sm">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    <strong>Contents:</strong> Study area metadata · Suitability class area table · Reclassified criterion maps · AHP methodology notes.
                  </p>
                  
                  {isPending ? (
                     <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin"/> Gathering report data...</div>
                  ) : (
                    <div className="text-sm text-muted-foreground italic border-l-2 border-primary/50 pl-4 py-1">
                      Automated PDF Report generation for the Habitat module is coming soon. Please use the Static Maps tab to export print-ready cartography in the meantime.
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="h-[600px] border rounded-lg flex flex-col items-center justify-center bg-slate-50/50 text-slate-400">
              <div className="p-4 bg-white rounded-full shadow-sm mb-4">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-50">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <p className="text-lg font-medium">Ready to run Habitat Suitability Analysis</p>
              <p className="text-sm mt-1">Select a study area and adjust AHP weights, then click Run Analysis.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}`;
    code = code.substring(0, pageStart) + newPage;
}

code = code.replace(/exportMutation\?\.isPending/g, 'analysisMutation.isPending');
code = code.replace(/exportMutation\.isPending/g, 'analysisMutation.isPending');

fs.writeFileSync(path, code, 'utf8');
