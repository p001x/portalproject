$pagesDir = "c:\Users\user\Documents\blacportal\artifacts\geoportal\src\pages"

$modules = @(
    "AccessibilityPage.tsx", "AirPollutionPage.tsx", "BiomassPage.tsx", 
    "ChangeDetectionPage.tsx", "DroughtPage.tsx", "FloodPage.tsx", 
    "HabitatSuitabilityPage.tsx", "IrrigationPage.tsx", "LSTPage.tsx", 
    "LandfillPage.tsx", "LandslidePage.tsx", "MicroScalePage.tsx", 
    "NDVIPage.tsx", "RUSLEPage.tsx", "SlopePage.tsx", "UHIPage.tsx", 
    "WaterHarvestingPage.tsx", "WellScopePage.tsx"
)

foreach ($file in $modules) {
    $filepath = Join-Path $pagesDir $file
    if (-not (Test-Path $filepath)) { continue }

    $content = Get-Content $filepath -Raw

    if ($content -notmatch "ResizablePanelGroup") {
        $importStmt = "import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from `"@/components/ui/resizable`";`r`n"
        if ($content -match "import { api") {
            $content = $content -replace "import { api", "$importStmt`import { api"
        } else {
            $content = $importStmt + $content
        }
    }

    $content = $content -replace '(?s)<div className="flex h-full">\s*\{\/\* ── Controls sidebar ─────────────────────────────────────── \*\/\}\s*<aside className="w-64 [^>]*?bg-card flex flex-col gap-5 p-5 overflow-y-auto">',
'<ResizablePanelGroup direction="horizontal" className="h-full w-full">
      {/* ── Controls sidebar ─────────────────────────────────────── */}
      <ResizablePanel defaultSize={25} minSize={20} maxSize={40} className="bg-card flex flex-col gap-5 p-5 overflow-y-auto border-r">'

    $content = $content -replace '(?s)<div className="flex h-full">\s*\{\/\* ── Controls sidebar ─────────────────────────────────────── \*\/\}\s*<aside className="w-72 [^>]*?bg-card flex flex-col gap-5 p-5 overflow-y-auto">',
'<ResizablePanelGroup direction="horizontal" className="h-full w-full">
      {/* ── Controls sidebar ─────────────────────────────────────── */}
      <ResizablePanel defaultSize={30} minSize={20} maxSize={40} className="bg-card flex flex-col gap-5 p-5 overflow-y-auto border-r">'

    $content = $content -replace '(?s)</aside>\s*(?:\{\/\* ── Results.*? \*\/\})?\s*<main className="flex-1 overflow-y-auto p-6">',
'</ResizablePanel>

      <ResizableHandle withHandle />

      {/* ── Results ──────────────────────────────────────────────── */}
      <ResizablePanel defaultSize={75} className="overflow-y-auto p-6">'

    $content = $content -replace '(?s)</main>\s*</div>\s*\);\s*\}',
'</ResizablePanel>
    </ResizablePanelGroup>
  );
}'

    Set-Content -Path $filepath -Value $content -Encoding UTF8
    Write-Host "Refactored $file"
}
