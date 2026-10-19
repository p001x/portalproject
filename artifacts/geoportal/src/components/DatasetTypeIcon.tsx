/**
 * DatasetTypeIcon — Real-world ArcGIS Pro Catalog pane–style icons
 * for the RARE DATA — Dataset Repository.
 *
 * Each file type gets a distinct, hand-crafted SVG icon that mirrors
 * what you'd see in ArcGIS Pro's Catalog view, plus an optional
 * status overlay badge (green ✓ = ready, red ! = error, spinner = processing).
 */

interface DatasetTypeIconProps {
  fileType: string;
  status?: string;
  /** px size — default 28 */
  size?: number;
  className?: string;
}

/* ── Raster / GeoTIFF Icon ───────────────────────────────────────────
   ArcGIS Pro style: amber/yellow checkerboard grid representing pixels */
function RasterIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Background plate */}
      <rect x="2" y="4" width="28" height="24" rx="3" fill="#78350f" opacity="0.15" />
      <rect x="2" y="4" width="28" height="24" rx="3" stroke="#b45309" strokeWidth="1.2" />
      {/* Grid lines — checkerboard */}
      <rect x="5" y="7" width="6" height="5" rx="0.5" fill="#f59e0b" />
      <rect x="13" y="7" width="6" height="5" rx="0.5" fill="#fbbf24" opacity="0.6" />
      <rect x="21" y="7" width="6" height="5" rx="0.5" fill="#f59e0b" />
      <rect x="5" y="14" width="6" height="5" rx="0.5" fill="#fbbf24" opacity="0.6" />
      <rect x="13" y="14" width="6" height="5" rx="0.5" fill="#f59e0b" />
      <rect x="21" y="14" width="6" height="5" rx="0.5" fill="#fbbf24" opacity="0.6" />
      <rect x="5" y="21" width="6" height="5" rx="0.5" fill="#f59e0b" />
      <rect x="13" y="21" width="6" height="5" rx="0.5" fill="#fbbf24" opacity="0.6" />
      <rect x="21" y="21" width="6" height="5" rx="0.5" fill="#f59e0b" />
    </svg>
  );
}

/* ── Shapefile Icon ──────────────────────────────────────────────────
   ArcGIS Pro style: green polygon with vertex handles */
function ShapefileIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Background plate */}
      <rect x="2" y="4" width="28" height="24" rx="3" fill="#064e3b" opacity="0.15" />
      <rect x="2" y="4" width="28" height="24" rx="3" stroke="#059669" strokeWidth="1.2" />
      {/* Polygon shape */}
      <polygon points="16,7 26,13 24,25 8,25 6,13" fill="#10b981" opacity="0.35" stroke="#059669" strokeWidth="1.5" strokeLinejoin="round" />
      {/* Vertex handles — small squares like ArcGIS edit mode */}
      <rect x="14.5" y="5.5" width="3" height="3" rx="0.5" fill="#34d399" stroke="#059669" strokeWidth="0.6" />
      <rect x="24.5" y="11.5" width="3" height="3" rx="0.5" fill="#34d399" stroke="#059669" strokeWidth="0.6" />
      <rect x="22.5" y="23.5" width="3" height="3" rx="0.5" fill="#34d399" stroke="#059669" strokeWidth="0.6" />
      <rect x="6.5" y="23.5" width="3" height="3" rx="0.5" fill="#34d399" stroke="#059669" strokeWidth="0.6" />
      <rect x="4.5" y="11.5" width="3" height="3" rx="0.5" fill="#34d399" stroke="#059669" strokeWidth="0.6" />
    </svg>
  );
}

/* ── CSV / Table Icon ────────────────────────────────────────────────
   ArcGIS Pro style: spreadsheet grid with header row */
function CsvIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Background plate */}
      <rect x="2" y="4" width="28" height="24" rx="3" fill="#064e3b" opacity="0.1" />
      <rect x="2" y="4" width="28" height="24" rx="3" stroke="#059669" strokeWidth="1.2" />
      {/* Header row */}
      <rect x="4" y="6" width="24" height="4" rx="1" fill="#059669" />
      {/* Data rows */}
      <rect x="4" y="12" width="7" height="3" rx="0.5" fill="#6ee7b7" opacity="0.7" />
      <rect x="12.5" y="12" width="7" height="3" rx="0.5" fill="#6ee7b7" opacity="0.5" />
      <rect x="21" y="12" width="7" height="3" rx="0.5" fill="#6ee7b7" opacity="0.7" />
      <rect x="4" y="17" width="7" height="3" rx="0.5" fill="#6ee7b7" opacity="0.5" />
      <rect x="12.5" y="17" width="7" height="3" rx="0.5" fill="#6ee7b7" opacity="0.7" />
      <rect x="21" y="17" width="7" height="3" rx="0.5" fill="#6ee7b7" opacity="0.5" />
      <rect x="4" y="22" width="7" height="3" rx="0.5" fill="#6ee7b7" opacity="0.7" />
      <rect x="12.5" y="22" width="7" height="3" rx="0.5" fill="#6ee7b7" opacity="0.5" />
      <rect x="21" y="22" width="7" height="3" rx="0.5" fill="#6ee7b7" opacity="0.7" />
    </svg>
  );
}

/* ── GeoJSON Icon ────────────────────────────────────────────────────
   ArcGIS Pro style: blue feature class with {} JSON braces overlay */
function GeoJsonIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Background plate */}
      <rect x="2" y="4" width="28" height="24" rx="3" fill="#164e63" opacity="0.15" />
      <rect x="2" y="4" width="28" height="24" rx="3" stroke="#0891b2" strokeWidth="1.2" />
      {/* Map/feature shape */}
      <polygon points="10,8 22,8 26,16 20,26 12,26 6,16" fill="#06b6d4" opacity="0.25" stroke="#0891b2" strokeWidth="1.2" strokeLinejoin="round" />
      {/* JSON braces */}
      <text x="9" y="21" fontSize="12" fontWeight="bold" fill="#22d3ee" fontFamily="monospace" opacity="0.9">{"{"}</text>
      <text x="20" y="21" fontSize="12" fontWeight="bold" fill="#22d3ee" fontFamily="monospace" opacity="0.9">{"}"}</text>
      {/* Center dot — feature point */}
      <circle cx="16" cy="16" r="2.5" fill="#06b6d4" stroke="#0e7490" strokeWidth="0.8" />
    </svg>
  );
}

/* ── Geodatabase (.gdb) Icon ─────────────────────────────────────────
   ArcGIS Pro style: database cylinder in dark blue */
function GeodatabaseIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Cylinder body */}
      <ellipse cx="16" cy="10" rx="11" ry="4" fill="#3b82f6" opacity="0.3" stroke="#2563eb" strokeWidth="1.2" />
      <rect x="5" y="10" width="22" height="14" fill="#3b82f6" opacity="0.15" />
      <line x1="5" y1="10" x2="5" y2="24" stroke="#2563eb" strokeWidth="1.2" />
      <line x1="27" y1="10" x2="27" y2="24" stroke="#2563eb" strokeWidth="1.2" />
      <ellipse cx="16" cy="24" rx="11" ry="4" fill="#3b82f6" opacity="0.2" stroke="#2563eb" strokeWidth="1.2" />
      {/* Middle ring */}
      <ellipse cx="16" cy="17" rx="11" ry="3" fill="none" stroke="#2563eb" strokeWidth="0.6" opacity="0.5" />
    </svg>
  );
}

/* ── Generic / Other file Icon ───────────────────────────────────────
   ArcGIS Pro style: document page with folded corner */
function GenericFileIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Page body */}
      <path d="M6 5 H22 L26 9 V27 H6 Z" fill="#a855f7" opacity="0.15" stroke="#9333ea" strokeWidth="1.2" strokeLinejoin="round" />
      {/* Folded corner */}
      <path d="M22 5 L22 9 H26" fill="#a855f7" opacity="0.3" stroke="#9333ea" strokeWidth="1" strokeLinejoin="round" />
      {/* Text lines */}
      <rect x="9" y="13" width="14" height="1.5" rx="0.5" fill="#a855f7" opacity="0.5" />
      <rect x="9" y="17" width="10" height="1.5" rx="0.5" fill="#a855f7" opacity="0.4" />
      <rect x="9" y="21" width="12" height="1.5" rx="0.5" fill="#a855f7" opacity="0.3" />
    </svg>
  );
}

/* ── KML / KMZ Icon ──────────────────────────────────────────────────
   Google Earth style: globe with pin */
function KmlIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="4" width="28" height="24" rx="3" fill="#1e3a5f" opacity="0.15" />
      <rect x="2" y="4" width="28" height="24" rx="3" stroke="#3b82f6" strokeWidth="1.2" />
      <circle cx="16" cy="16" r="8" fill="#60a5fa" opacity="0.2" stroke="#3b82f6" strokeWidth="1.2" />
      {/* Latitude lines */}
      <ellipse cx="16" cy="16" rx="8" ry="3" fill="none" stroke="#3b82f6" strokeWidth="0.6" opacity="0.5" />
      <line x1="16" y1="8" x2="16" y2="24" stroke="#3b82f6" strokeWidth="0.6" opacity="0.5" />
      {/* Pin */}
      <circle cx="20" cy="12" r="2" fill="#ef4444" stroke="#dc2626" strokeWidth="0.8" />
    </svg>
  );
}

/* ── Status overlay badge ────────────────────────────────────────────
   Small corner badge: green check, red exclamation, or spinner */
function StatusOverlay({ status, size }: { status: string; size: number }) {
  const badgeSize = Math.max(10, size * 0.4);
  const offset = size - badgeSize + 1;

  if (status === "ready" || status === "ok") {
    return (
      <svg
        width={badgeSize}
        height={badgeSize}
        viewBox="0 0 12 12"
        className="absolute"
        style={{ right: -2, bottom: -2 }}
      >
        <circle cx="6" cy="6" r="5.5" fill="#059669" stroke="#022c22" strokeWidth="0.8" />
        <path d="M3.5 6 L5.2 8 L8.5 4.5" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (status === "error") {
    return (
      <svg
        width={badgeSize}
        height={badgeSize}
        viewBox="0 0 12 12"
        className="absolute"
        style={{ right: -2, bottom: -2 }}
      >
        <circle cx="6" cy="6" r="5.5" fill="#dc2626" stroke="#450a0a" strokeWidth="0.8" />
        <text x="6" y="9" textAnchor="middle" fontSize="9" fontWeight="bold" fill="white">!</text>
      </svg>
    );
  }

  if (status === "processing" || status === "uploading") {
    return (
      <svg
        width={badgeSize}
        height={badgeSize}
        viewBox="0 0 12 12"
        className="absolute animate-spin"
        style={{ right: -2, bottom: -2, animationDuration: "1.5s" }}
      >
        <circle cx="6" cy="6" r="5" fill="#1e293b" stroke="#475569" strokeWidth="0.8" />
        <path d="M6 1.5 A4.5 4.5 0 0 1 10.5 6" stroke="#60a5fa" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      </svg>
    );
  }

  return null;
}

/* ── Main Export: DatasetTypeIcon ─────────────────────────────────── */
export function DatasetTypeIcon({ fileType, status, size = 28, className }: DatasetTypeIconProps) {
  const ft = fileType.toLowerCase().trim();

  const getIcon = () => {
    switch (ft) {
      case "tiff":
      case "tif":
      case "geotiff":
      case "raster":
      case "img":
        return <RasterIcon size={size} />;
      case "shapefile":
      case "shp":
      case "gpkg":
      case "geopackage":
        return <ShapefileIcon size={size} />;
      case "csv":
      case "xlsx":
      case "xls":
      case "table":
      case "tsv":
        return <CsvIcon size={size} />;
      case "geojson":
      case "json":
      case "topojson":
        return <GeoJsonIcon size={size} />;
      case "gdb":
      case "geodatabase":
      case "fgdb":
        return <GeodatabaseIcon size={size} />;
      case "kml":
      case "kmz":
        return <KmlIcon size={size} />;
      default:
        return <GenericFileIcon size={size} />;
    }
  };

  return (
    <div className={`relative inline-flex shrink-0 ${className ?? ""}`} style={{ width: size, height: size }}>
      {getIcon()}
      {status && <StatusOverlay status={status} size={size} />}
    </div>
  );
}
