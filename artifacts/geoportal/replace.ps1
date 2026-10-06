$lines = Get-Content c:\Users\user\Documents\blacportal\artifacts\geoportal\src\pages\WellScopePage.tsx -Encoding UTF8
$out = @()
for ($i=0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]
    if ($line -match '<h2 className="font-semibold text-lg">Professional Cartography</h2>') {
        $out += '                   <div>'
        $out += '                     <h2 className="font-semibold text-lg mb-4">Final Groundwater Suitability Map</h2>'
    } elseif ($line -match '^\s*\)\s*:\s*<div className="text-muted-foreground">Static maps unavailable</div>}\s*$') {
        $out += $line
        if ($lines[$i+1] -match '</TabsContent>') {
            $out += '                   </div>'
            $out += '                   {mapData && ('
            $out += '                     <div>'
            $out += '                       <h2 className="font-semibold text-lg mb-4 mt-8 pt-8 border-t border-border">Factor Maps (Standardized)</h2>'
            $out += '                       <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">'
            $out += '                         {FACTOR_KEYS.map((k) => ('
            $out += '                           <MapExportControls'
            $out += '                              key={k}'
            $out += '                              district={effectiveDistrictName}'
            $out += '                              title={mapData.factor_maps[k].label}'
            $out += '                              tileUrl={mapData.factor_maps[k].tile_url}'
            $out += '                              thumbUrl={mapData.factor_maps[k].thumb_url}'
            $out += '                              legend={['
            $out += '                                { color: ''#d73027'', label: ''Very Low (1)'' },'
            $out += '                                { color: ''#fc8d59'', label: ''Low (2)'' },'
            $out += '                                { color: ''#fee08b'', label: ''Moderate (3)'' },'
            $out += '                                { color: ''#d9ef8b'', label: ''High (4)'' },'
            $out += '                                { color: ''#1a9850'', label: ''Very High (5)'' }'
            $out += '                              ]}'
            $out += '                              classAreas={{}}'
            $out += '                           />'
            $out += '                         ))}'
            $out += '                       </div>'
            $out += '                     </div>'
            $out += '                   )}'
        }
    } else {
        if ($line -match 'TabsContent value="static-maps"') {
            $line = $line -replace 'space-y-4', 'space-y-8'
        }
        $out += $line
    }
}
[IO.File]::WriteAllLines("c:\Users\user\Documents\blacportal\artifacts\geoportal\src\pages\WellScopePage.tsx", $out, [System.Text.Encoding]::UTF8)