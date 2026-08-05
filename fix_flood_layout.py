import re

with open('c:/Users/user/Documents/blacportal/artifacts/geoportal/src/pages/FloodPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# We want to replace everything from `{data && (` down to the end of `<main>` with the new harmonized layout.

start_idx = content.find('{data && (')
end_idx = content.find('</main>')

if start_idx == -1 or end_idx == -1:
    print('Could not find boundaries')
    exit(1)

new_content = content[:start_idx] + '''{data && (
          <Tabs defaultValue="map" className="h-full flex flex-col">
            <TabsList className="mb-4 self-start flex-wrap h-auto gap-1">
              <TabsTrigger value="map">Map</TabsTrigger>
              <TabsTrigger value="stats">Summary</TabsTrigger>
              <TabsTrigger value="ahp">AHP</TabsTrigger>
              <TabsTrigger value="static-map">Static Maps</TabsTrigger>
              {getReportPayload() && <TabsTrigger value="report" className="gap-1.5"><FileText className="w-3.5 h-3.5" />Report</TabsTrigger>}
            </TabsList>

            {/* Map */}
            <TabsContent value="map" className="flex-1 min-h-[500px] space-y-3">
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-xs font-semibold text-muted-foreground uppercase mr-2">Main Layers:</span>
                  <button
                    onClick={() => setActiveLayer("continuous")}
                    className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                      activeLayer === "continuous" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-input hover:bg-muted"
                    }`}
                  >
                    Flood Index (Continuous)
                  </button>
                  <button
                    onClick={() => setActiveLayer("classified")}
                    className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                      activeLayer === "classified" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-input hover:bg-muted"
                    }`}
                  >
                    Flood Risk (Classified)
                  </button>
                </div>
                
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-xs font-semibold text-muted-foreground uppercase mr-2">Factor Maps:</span>
                  {Object.entries(data.factor_maps).map(([k, fm]) => (
                    <button
                      key={k}
                      onClick={() => setActiveLayer(k as any)}
                      className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                        activeLayer === k ? "bg-primary text-primary-foreground border-primary" : "bg-card border-input hover:bg-muted"
                      }`}
                    >
                      {fm.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="h-[520px] rounded-lg overflow-hidden border relative">
                {currentTileUrl ? (
                  <DistrictMap district={data.district} tileUrl={currentTileUrl} center={data.center} />
                ) : (
                  <div className="flex-1 h-full flex items-center justify-center bg-muted">
                    <span className="text-muted-foreground">Map data unavailable</span>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Statistics */}
            <TabsContent value="stats" className="space-y-6">
              <div>
                <h2 className="font-semibold text-lg mb-1">
                  Flood Statistics — {data.district}
                </h2>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-card border rounded-lg p-4">
                  <div className="text-xs text-muted-foreground mb-1">Mean Flood Index</div>
                  <div className="text-2xl font-bold text-primary">
                    {data.stats.mean_suitability?.toFixed(2) || "N/A"}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">Scale 1-5</div>
                </div>
                <div className="bg-card border rounded-lg p-4">
                  <div className="text-xs text-muted-foreground mb-1">High Risk Area</div>
                  <div className="text-2xl font-bold text-destructive">
                    {data.stats.max_risk_area_km2?.toFixed(1) || "0"} <span className="text-sm font-normal">km²</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">Area &gt; 4.5 index</div>
                </div>
              </div>

              <div>
                <h3 className="font-medium mb-3">Area by Flood Risk Class (km²)</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    data={Object.entries(data.class_areas_km2).map(([name, val], i) => ({
                      name: name,
                      value: Math.round(val),
                      color: SUSCEPTIBILITY_COLORS[i % SUSCEPTIBILITY_COLORS.length],
                    }))}
                  >
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={50} />
                    <YAxis unit=" km²" tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => [`${v} km²`, "Area"]} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {Object.keys(data.class_areas_km2).map((_, index) => (
                        <Cell key={`cell-${index}`} fill={SUSCEPTIBILITY_COLORS[index % SUSCEPTIBILITY_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>

            {/* AHP */}
            <TabsContent value="ahp" className="space-y-6">
              <div>
                <h2 className="font-semibold text-lg mb-4">
                  AHP & Consistency Analysis
                </h2>
                
                <div className="flex justify-between items-center bg-muted/50 p-4 rounded-lg border mb-6 max-w-md">
                  <span className="font-semibold">Consistency Ratio (CR)</span>
                  <span className={`px-3 py-1 rounded text-sm font-bold ${data.ahp.consistent ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                    {data.ahp.cr.toFixed(3)} {data.ahp.consistent ? "(Consistent)" : "(Inconsistent)"}
                  </span>
                </div>
                
                <h3 className="font-medium mb-3">Factor Weights</h3>
                <div className="border rounded-lg overflow-hidden max-w-2xl text-sm">
                  <table className="w-full">
                    <thead className="bg-muted text-xs uppercase">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium">Factor</th>
                        <th className="px-4 py-3 text-right font-medium">Weight</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {Object.entries(data.ahp.weights).map(([k, w]) => (
                        <tr key={k} className="hover:bg-muted/30">
                          <td className="px-4 py-3 capitalize">{k.replace("_", " ")}</td>
                          <td className="px-4 py-3 text-right font-mono\">{(w * 100).toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>

            {/* Static Maps */}
            <TabsContent value="static-map" className="flex-1 overflow-y-auto space-y-4">
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Select Map to Export:</span>
                <div className="flex flex-wrap gap-2 items-center mb-1">
                  <button
                    onClick={() => setActiveLayer("continuous")}
                    className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                      activeLayer === "continuous" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-input hover:bg-muted"
                    }`}
                  >
                    Flood Index (Continuous)
                  </button>
                  <button
                    onClick={() => setActiveLayer("classified")}
                    className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                      activeLayer === "classified" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-input hover:bg-muted"
                    }`}
                  >
                    Flood Risk (Classified)
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 items-center mb-4">
                  {Object.entries(data.factor_maps).map(([k, fm]) => (
                    <button
                      key={k}
                      onClick={() => setActiveLayer(k as any)}
                      className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                        activeLayer === k ? "bg-primary text-primary-foreground border-primary" : "bg-card border-input hover:bg-muted"
                      }`}
                    >
                      {fm.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-card border rounded-lg p-4">
                {activeLayer === "continuous" && (
                  <MapExportControls
                    title="Flood_Susceptibility"
                    district={data.district}
                    tileUrl={data.tile_url}
                    thumbUrl={data.thumb_url}
                    downloadUrl={data.thumb_url}
                  />
                )}
                {activeLayer === "classified" && data.classify?.panels[0] && (
                  <MapExportControls
                    title="Flood_Risk_Classified"
                    district={data.district}
                    tileUrl={data.classify.panels[0].tile_url}
                    thumbUrl={data.classify.panels[0].thumb_url}
                    downloadUrl={data.classify.panels[0].thumb_url}
                    classAreas={data.class_areas_km2}
                  />
                )}
                {activeLayer !== "continuous" && activeLayer !== "classified" && data.factor_maps[activeLayer] && (
                  <MapExportControls
                    title={`Flood_Factor_${activeLayer}`}
                    district={data.district}
                    tileUrl={data.factor_maps[activeLayer].class_tile_url || data.factor_maps[activeLayer].tile_url}
                    thumbUrl={data.factor_maps[activeLayer].class_thumb_url || data.factor_maps[activeLayer].thumb_url}
                    downloadUrl={data.factor_maps[activeLayer].class_thumb_url || data.factor_maps[activeLayer].thumb_url}
                    colors={SUSCEPTIBILITY_COLORS}
                    labels={["Very Low (1)", "Low (2)", "Moderate (3)", "High (4)", "Very High (5)"]}
                  />
                )}
              </div>
            </TabsContent>

            {/* Report */}
            {getReportPayload() && (
              <TabsContent value="report" className="flex-1 space-y-4">
                <div className="bg-card border rounded-lg p-8 flex flex-col items-center justify-center text-center space-y-4 max-w-2xl mx-auto mt-8">
                  <FileText className="w-16 h-16 text-muted-foreground" />
                  <h2 className="text-2xl font-bold">Comprehensive Analysis Report</h2>
                  <p className="text-muted-foreground">
                    Download a detailed PDF report containing all generated maps, 
                    factor weightings, consistency ratios, and statistical breakdowns 
                    for {data.district}.
                  </p>
                  <div className="pt-4">
                    <ReportDownloadButton payload={getReportPayload()!} />
                  </div>
                </div>
              </TabsContent>
            )}
          </Tabs>
        )}
      ''' + content[end_idx:]

with open('c:/Users/user/Documents/blacportal/artifacts/geoportal/src/pages/FloodPage.tsx', 'w', encoding='utf-8') as f:
    f.write(new_content)

print('Success')
