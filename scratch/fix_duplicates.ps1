$PAGES_DIR = "c:\Users\user\Documents\blacportal\artifacts\geoportal\src\pages"
$files = Get-ChildItem -Path $PAGES_DIR -Filter "*.tsx"

foreach ($f in $files) {
    $content = Get-Content $f.FullName -Raw
    if ($content -match 'import DistrictMap from "@/components/DistrictMap";' -and $content -match 'import \{ DistrictMap \} from "@/components/DistrictMap";') {
        $content = $content -replace 'import DistrictMap from "@/components/DistrictMap";\r?\n', ''
        Set-Content -Path $f.FullName -Value $content -NoNewline
        Write-Host "Fixed $($f.Name)"
    }
}
