const fs = require('fs');
const path = require('path');

const filepath = path.join(__dirname, 'src', 'pages', 'SampleDigitizationPage.tsx');
let content = fs.readFileSync(filepath, 'utf8');

// Normalize CRLF to LF for matching
const isCRLF = content.includes('\r\n');
if (isCRLF) {
  content = content.replace(/\r\n/g, '\n');
}

const target = `              <div className="space-y-1">
                <Label>Override Class Label (Optional)</Label>
                <input
                  value={importClassLabel}
                  onChange={(e) => setImportClassLabel(e.target.value)}
                  placeholder="e.g. Forest, Wetland"
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              </div>
            </div>

                  className="gap-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs px-1"
                >
                  {ingestUrlMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  Push to GEE
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>`;

const replacement = `              <div className="space-y-1">
                <Label>Override Class Label (Optional)</Label>
                <input
                  value={importClassLabel}
                  onChange={(e) => setImportClassLabel(e.target.value)}
                  placeholder="e.g. Forest, Wetland"
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
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
                  const tileUrl = \`https://geoportal-api-ygzi.onrender.com/api/native/imagery/tiles/{z}/{x}/{y}?url=\${encodeURIComponent(rawUrl)}&gee_token=\${getGeeToken() || ""}\`;
                  setNativePreviewUrl(tileUrl);
                  setClassificationSource("native_cog");
                  setCustomAssetId(rawUrl);
                  setActiveTab("map");
                  fetch(\`https://geoportal-api-ygzi.onrender.com/api/native/imagery/bounds?url=\${encodeURIComponent(rawUrl)}&gee_token=\${getGeeToken() || ""}\`)
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
                        description: \`Imported \${res.imported_count || "vector"} features under class '\${label}'.\`,
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
        </TabsContent>`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  if (isCRLF) {
    content = content.replace(/\n/g, '\r\n');
  }
  fs.writeFileSync(filepath, content, 'utf8');
  console.log('PATCH_APPLIED_SUCCESSFULLY');
} else {
  console.log('TARGET_STRING_NOT_MATCHED');
}
