import os

filepath = r"c:\Users\user\Documents\blacportal\artifacts\geoportal\src\pages\SampleDigitizationPage.tsx"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

target = """              </div>
            </div>

                  className="gap-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs px-1"
                >
                  {ingestUrlMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  Push to GEE
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>"""

replacement = """              <div className="grid grid-cols-2 gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => previewDatasetMut.mutate()}
                  disabled={previewDatasetMut.isPending || !selectedDatasetId}
                  className="gap-1.5 border-cyan-500/40 text-cyan-400 hover:bg-cyan-950/40 text-xs px-1"
                >
                  {previewDatasetMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                  Preview Overlay
                </Button>
                
                <Button
                  onClick={() => importDatasetMut.mutate()}
                  disabled={importDatasetMut.isPending || !selectedDatasetId}
                  className="gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs px-1"
                >
                  {importDatasetMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  Push Features
                </Button>
              </div>
            </div>

            {/* Universal Spatial Data Harvester Card */}
            <div className="md:col-span-2">
              <DatasetHarvester
                defaultClassLabel={importClassLabel || classLabel || "Agriculture"}
                onPreviewRaster={(rawUrl) => {
                  const tileUrl = `https://geoportal-api-ygzi.onrender.com/api/native/imagery/tiles/{z}/{x}/{y}?url=${encodeURIComponent(rawUrl)}&gee_token=${getGeeToken() || ""}`;
                  setNativePreviewUrl(tileUrl);
                  setClassificationSource("native_cog");
                  setCustomAssetId(rawUrl);
                  setActiveTab("map");
                  fetch(`https://geoportal-api-ygzi.onrender.com/api/native/imagery/bounds?url=${encodeURIComponent(rawUrl)}&gee_token=${getGeeToken() || ""}`)
                    .then((r) => r.json())
                    .then((bData) => {
                      if (bData.bbox && bData.bbox.length === 4) setActiveBbox(bData.bbox);
                    })
                    .catch(() => {});
                }}
                onPreviewGeoJSON={(geojson) => {
                  setPreviewGeoJSON(geojson);
                  setNativePreviewUrl(null);
                  setActiveTab("map");
                  try {
                    const bbox = turf.bbox(geojson);
                    if (bbox && bbox.length === 4) setActiveBbox(bbox);
                  } catch {}
                }}
                onImportVectorSamples={(url, label) => {
                  api.samples
                    .ingestUrl({ url, class_label: label || "Harvested_Class" })
                    .then((res) => {
                      qc.invalidateQueries({ queryKey: ["samples"] });
                      toast({
                        title: "Samples Imported!",
                        description: `Imported ${res.imported_count || "vector"} features under class '${label}'.`,
                      });
                    })
                    .catch((err) => {
                      toast({
                        variant: "destructive",
                        title: "Vector Ingest Failed",
                        description: err.message,
                      });
                    });
                }}
              />
            </div>
          </div>
        </TabsContent>"""

if target in content:
    content = content.replace(target, replacement, 1)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)
    print("SUCCESS")
else:
    print("TARGET NOT FOUND")
