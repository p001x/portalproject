import re
import shutil

with open('artifacts/geoportal/src/pages/BiomassPage_backup.tsx', 'r', encoding='utf-16') as f:
    code = f.read()

# Add Resizable imports
if 'ResizablePanelGroup' not in code:
    code = code.replace(
        'import { StudyAreaSelector } from "@/components/StudyAreaSelector";',
        'import { StudyAreaSelector } from "@/components/StudyAreaSelector";\nimport { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";'
    )

# Find export function BiomassPage()
start_idx = code.find('export function BiomassPage()')
# Find the return ( inside it
return_idx = code.find('  return (', start_idx)

old_return = code[return_idx:]

new_return = """  return (
    <ResizablePanelGroup direction="horizontal" className="h-full items-stretch">
      {/* Sidebar */}
      <ResizablePanel defaultSize={25} minSize={20} maxSize={40}>
        <aside className="h-full w-full md:border-b md:border-b-0 md:border-r bg-card flex flex-col gap-5 p-5 md:overflow-y-auto">
          <div className="flex items-center gap-2 text-primary font-semibold text-lg">
            <Flame className="w-5 h-5" />
            Biomass Tracker
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Monitor forest cover change and analyze biomass depletion risk zones.
          </p>

          <StudyAreaSelector value={aoi} onChange={setAoi} />

          <div className="space-y-1">
            <Label>Analysis Buffer (km)</Label>
            <p className="text-[11px] text-muted-foreground leading-relaxed mb-2">
              Search radius from settlements to detect extraction activity.
            </p>
            <div className="flex justify-between items-center p-2 rounded-lg border bg-muted/30 text-sm">
              <span className="font-medium text-muted-foreground">Radius</span>
              <span className="font-bold text-primary">{bufferKm} km</span>
            </div>
            <Slider value={[bufferKm]} min={1} max={10} step={0.5} onValueChange={(v) => setBufferKm(v[0])} className="py-4" />
          </div>

          <div className="mt-auto pt-4 flex gap-2">
            <Button onClick={runAnalysis} disabled={isPending} className="w-full gap-2">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {isPending ? "Processing..." : "Generate Analysis"}
            </Button>
          </div>
        </aside>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={75}>
        <div className="h-full flex flex-col relative bg-muted/10">
          {error ? (
            <div className="h-full flex flex-col items-center justify-center text-destructive p-8 text-center">
              <Info className="w-10 h-10 mb-4" />
              <p className="text-lg font-semibold mb-2">Analysis Failed</p>
              <p className="text-sm opacity-80 max-w-md">{error.message}</p>
            </div>
          ) : isPending && !anyData ? (
            <div className="h-full flex flex-col items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
              <p className="text-sm font-medium text-muted-foreground">Running Analysis in Earth Engine...</p>
            </div>
          ) : anyData ? (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
              <div className="border-b px-4 py-2 bg-background flex items-center justify-between shrink-0">
                <TabsList className="bg-muted">
                  <TabsTrigger value="map">Risk Map</TabsTrigger>
                  <TabsTrigger value="statistics">Dashboard</TabsTrigger>
                  <TabsTrigger value="factors">Factors</TabsTrigger>
                  <TabsTrigger value="static-maps">Static Maps</TabsTrigger>
                  <TabsTrigger value="report">Report</TabsTrigger>
                </TabsList>
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  Data Ready
                </div>
              </div>

              <div className="flex-1 relative overflow-hidden">
                <TabsContent value="map" className="h-full w-full m-0 p-0 border-0 data-[state=active]:flex flex-col">
                  <div className="flex-1 relative">
                    <DistrictMap
                      tileUrl={mapData.tile_url}
                      center={mapData.center}
                      bbox={mapData.bbox}
                      title="Biomass Depletion Risk"
                      legend={RISK_LEGEND}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="statistics" className="h-full w-full m-0 p-4 sm:p-6 overflow-y-auto">
                  <div className="max-w-5xl mx-auto space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="bg-card rounded-xl border p-4 shadow-sm">
                        <div className="text-sm font-medium text-muted-foreground mb-1">Total Standing Biomass</div>
                        <div className="text-2xl font-bold">{statsData.stats["Total Standing Biomass (Tonnes)"]?.toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground mt-1">Tonnes</div>
                      </div>
                      <div className="bg-card rounded-xl border p-4 shadow-sm">
                        <div className="text-sm font-medium text-muted-foreground mb-1">Mean Depletion Risk</div>
                        <div className="text-2xl font-bold text-orange-500">{statsData.stats["Mean Depletion Risk"]}</div>
                        <div className="text-xs text-muted-foreground mt-1">/ 100 average risk score</div>
                      </div>
                      <div className="bg-card rounded-xl border p-4 shadow-sm">
                        <div className="text-sm font-medium text-muted-foreground mb-1">Estimated Biomass Lost</div>
                        <div className="text-2xl font-bold text-red-500">{statsData.stats["Estimated Biomass Lost (Tonnes)"]?.toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground mt-1">Tonnes recently depleted</div>
                      </div>
                      <div className="bg-card rounded-xl border p-4 shadow-sm">
                        <div className="text-sm font-medium text-muted-foreground mb-1">Depletion Runway</div>
                        <div className="text-2xl font-bold">{statsData.stats["Depletion Runway (Years)"] === 999 ? "\u221e" : statsData.stats["Depletion Runway (Years)"]}</div>
                        <div className="text-xs text-muted-foreground mt-1">Years</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      <div className="lg:col-span-2 bg-card rounded-xl border p-6 shadow-sm">
                        <h3 className="text-lg font-semibold mb-6">Commercial Energy Balance</h3>
                        <div className="flex flex-col md:flex-row items-center gap-8">
                          <div className="flex flex-col items-center justify-center w-32 h-32 rounded-full border-4 border-muted relative">
                            <span className={`text-sm font-bold text-center px-2 ${statsData.stats["Commercial Energy Status"]?.includes('CRITICAL') ? 'text-destructive' : statsData.stats["Commercial Energy Status"] === 'SUSTAINABLE SURPLUS' ? 'text-emerald-500' : 'text-orange-500'}`}>
                              {statsData.stats["Commercial Energy Status"]}
                            </span>
                          </div>
                          
                          <div className="flex-1 w-full space-y-4">
                            <div>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="font-medium">Annual Fuelwood Demand</span>
                                <span className="text-muted-foreground">{statsData.stats["Annual Fuelwood Demand (Tonnes/yr)"]?.toLocaleString()} T/yr</span>
                              </div>
                              <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-orange-500" style={{ width: `${Math.min(100, (statsData.stats["Annual Fuelwood Demand (Tonnes/yr)"] / Math.max(statsData.stats["Annual Fuelwood Demand (Tonnes/yr)"], statsData.stats["Sustainable Annual Yield (Tonnes/yr)"])) * 100)}%` }} />
                              </div>
                            </div>
                            <div>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="font-medium">Sustainable Annual Yield</span>
                                <span className="text-muted-foreground">{statsData.stats["Sustainable Annual Yield (Tonnes/yr)"]?.toLocaleString()} T/yr</span>
                              </div>
                              <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, (statsData.stats["Sustainable Annual Yield (Tonnes/yr)"] / Math.max(statsData.stats["Annual Fuelwood Demand (Tonnes/yr)"], statsData.stats["Sustainable Annual Yield (Tonnes/yr)"])) * 100)}%` }} />
                              </div>
                            </div>
                            <div className="pt-4 border-t flex justify-between items-center">
                              <span className="text-sm font-medium">Net Biomass Deficit</span>
                              <span className="text-lg font-bold">{statsData.stats["Net Biomass Deficit (Tonnes/yr)"]?.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">T/yr</span></span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="bg-card rounded-xl border p-6 shadow-sm">
                        <h3 className="text-lg font-semibold mb-6">Risk Distribution</h3>
                        <div className="space-y-4">
                          {Object.entries(anyData.class_areas_km2).map(([cls, area], i) => {
                            const total = Object.values(anyData.class_areas_km2).reduce((a, b) => (a as number) + (b as number), 0) as number;
                            const pct = total > 0 ? ((area as number) / total) * 100 : 0;
                            return (
                              <div key={cls} className="space-y-1">
                                <div className="flex justify-between text-sm">
                                  <span className="font-medium">{cls}</span>
                                  <span className="text-muted-foreground">{pct.toFixed(1)}%</span>
                                </div>
                                <div className="h-2 rounded-full bg-muted overflow-hidden">
                                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: CLASS_COLOR_LIST[i] }} />
                                </div>
                                <div className="text-[10px] text-muted-foreground text-right">{(area as number).toFixed(1)} km\u00b2</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="factors" className="h-full w-full m-0 p-4 sm:p-6 overflow-y-auto">
                  <div className="max-w-6xl mx-auto">
                    <div className="mb-6">
                      <h2 className="text-xl font-bold">Biomass Depletion Factors</h2>
                      <p className="text-sm text-muted-foreground mt-1">Preview, customize, and export individual factor maps.</p>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {mapData?.factor_maps && Object.entries(mapData.factor_maps).map(([key, factor]: [string, any]) => (
                        <InteractiveFactorMapCard 
                          key={key} 
                          factorKey={key} 
                          factor={factor} 
                          aoiConfig={aoi}
                          bufferKm={bufferKm}
                          yearStart={2019}
                          yearEnd={2023}
                        />
                      ))}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="static-maps" className="h-full w-full m-0 p-4 sm:p-6 overflow-y-auto">
                  <div className="max-w-6xl mx-auto">
                    <div className="mb-6">
                      <h2 className="text-xl font-bold">Static Maps</h2>
                      <p className="text-sm text-muted-foreground mt-1">Print-ready static maps with scalebars and legends.</p>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      <div className="border rounded-xl p-4 space-y-4 bg-card shadow-sm">
                        <h4 className="font-semibold text-sm">Final Depletion Risk Map</h4>
                        <div className="relative border rounded-lg bg-muted/20 aspect-square overflow-hidden">
                          <img src={mapData?.thumb_url} alt="Final Map" className="w-full h-full object-cover" />
                          <div className="absolute bottom-3 right-3 drop-shadow-md">
                            <SmallNorthArrow />
                          </div>
                        </div>
                      </div>
                      {mapData?.factor_maps && Object.entries(mapData.factor_maps).map(([key, factor]: [string, any]) => (
                        <StaticMapCard 
                          key={key} 
                          factorKey={key} 
                          factor={factor} 
                          analysisDate={new Date().toLocaleDateString()}
                        />
                      ))}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="report" className="h-full w-full m-0 p-6 overflow-y-auto flex items-center justify-center">
                  <div className="max-w-xl w-full">
                    <div className="bg-card border rounded-2xl p-10 shadow-sm text-center space-y-6">
                      <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto">
                        <FileText className="w-8 h-8" />
                      </div>
                      <div>
                        <h2 className="font-bold text-2xl">Biomass Depletion Report</h2>
                        <p className="text-muted-foreground font-medium mt-2">{effectiveDistrictName}</p>
                        <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-4">
                          Download a comprehensive PDF report including all statistics, class area breakdowns, and high-resolution maps.
                        </p>
                      </div>
                      
                      <div className="pt-4 flex justify-center">
                        <ReportDownloadButton 
                          aoi={aoi}
                          moduleName="Firewood/Biomass Depletion Tracker"
                          dateRange="2019 - 2023"
                          stats={statsData?.stats || {}}
                          classAreas={anyData?.class_areas_km2 || {}}
                          district={effectiveDistrictName}
                        />
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <div className="text-center space-y-4">
                <MapIcon className="w-12 h-12 mx-auto opacity-20" />
                <p className="font-medium text-lg">Ready to analyze</p>
                <p className="text-sm max-w-xs mx-auto">Configure your study area on the left and click Generate Analysis.</p>
              </div>
            </div>
          )}
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
"""

code = code.replace(old_return, new_return)

with open('artifacts/geoportal/src/pages/BiomassPage.tsx', 'w', encoding='utf-8') as f:
    f.write(code)
