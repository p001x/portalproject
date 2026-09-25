# Rwanda GeoPortal & Spatial Analytics Engine — Project Progress & State Checkpoint

> **Date Saved:** September 25, 2026  
> **Repository:** `p001x/portalproject` (Branch: `main`)  
> **Status:** Operational & Fully Saved

---

## 1. Executive Summary

The **Rwanda GeoPortal** (BlacPortal) is an enterprise-grade Earth Observation (EO) and geospatial analytics web application. It combines high-performance cloud computing (Google Earth Engine) with local geospatial modeling and modern interactive cartography.

The application has been migrated from legacy Streamlit scripts into a production-grade dual-tier architecture:
- **Frontend:** React 18, TypeScript, Vite, TailwindCSS, Lucide Icons, Leaflet / React-Leaflet, and Three.js for 3D terrain visualization.
- **Backend:** FastAPI (Python), Google Earth Engine (GEE) Python API, NumPy, SciPy, Rasterio, Shapely, ReportLab (automated PDF cartographic reporting), and SQLite.

---

## 2. System Architecture & Running the Project

### A. Backend Server (`FastAPI`)
- **Directory:** `backend/`
- **Entry Point:** `backend/main.py`
- **Dependencies:** Managed via `pyproject.toml` or `requirements.txt`
- **Command to Run:**
  ```powershell
  python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
  ```
- **Key Backend Modules:**
  - `backend/gee/earthwork.py`: Comprehensive cut/fill calculation, multiple geological strata, mass haul diagrams, and depth optimization.
  - `backend/gee/habitat.py`: Habitat suitability modeling, raster Euclidean distance to vector features, IDW interpolation, and multi-criteria evaluation.
  - `backend/gee/change_detection.py`: Multi-temporal bi-date difference analysis, thresholding, and transition matrix calculation.
  - `backend/gee/lst.py` & `backend/gee/uhi.py`: Land surface temperature and urban heat island indexing using Landsat thermal data.
  - `backend/gee/accessibility.py`: Travel time calculation, friction surfaces, and healthcare/market reachability.
  - `backend/gee/interpolate.py`: Inverse Distance Weighting (IDW) interpolation engine.
  - `backend/gee/slope.py`: SRTM/Copernicus DEM slope, aspect, and elevation profiling.
  - `backend/reports/cartography.py` & `report_builder.py`: Automated PDF map generation with custom legends, north arrows, and spatial metrics.

### B. Frontend Web Application (`React + Vite`)
- **Directory:** `artifacts/geoportal/`
- **Entry Point:** `artifacts/geoportal/src/App.tsx`
- **Command to Run:**
  ```powershell
  cd artifacts/geoportal
  npm install   # If dependencies need refreshing
  npm run dev
  ```
- **Local Dev URL:** `http://localhost:5173` (proxied to API on port 8000)

---

## 3. Modules Implemented & Current Status

| Module | Route / Page | Capabilities & Features | Status |
| :--- | :--- | :--- | :--- |
| **Earthwork Pro** | `/earthwork` | Cut & Fill volume computation, 3 Strata (Topsoil, Weathered, Hard Rock), Bulking & Shrinkage factors, Mass Haul Logistics diagram, Zero Net Balance Depth solver, and 3D Topographic Mesh Viewer (`earthwork_3d.html`). | **Complete & Verified** |
| **Habitat Suitability** | `/habitat` | Weighted overlay multi-criteria analysis (MCE), proximity to roads/rivers/forests, IDW point interpolation, customizable weight sliders, and suitability classification. | **Complete & Verified** |
| **LST & Urban Heat Island** | `/lst`, `/uhi` | Thermal infrared band processing, emissivity correction, hot spot detection, district-level statistics, and thermal profile charting. | **Complete & Verified** |
| **Change Detection** | `/change-detection` | Pre vs. Post composite comparison (NDVI/NDBI/Spectral), change thresholding, gain/loss area calculation, and side-by-side swipe comparison. | **Complete & Verified** |
| **Slope & Topography** | `/slope` | DEM elevation profiling, slope angle (degrees & percentage), aspect classification, and terrain hazard evaluation. | **Complete & Verified** |
| **Soil Erosion (RUSLE)** | `/rusle` | R (Rainfall), K (Soil), LS (Topography), C (Cover), P (Practice) factor integration with annual soil loss (t/ha/yr) estimation. | **Complete & Verified** |
| **Disasters (Flood & Landslide)**| `/flood`, `/landslide` | Topographic wetness index, precipitation intensity, slope stability modeling, and high-risk zone delineation. | **Complete & Verified** |
| **Drought Severity** | `/drought` | Vegetation Condition Index (VCI), Temperature Condition Index (TCI), and Vegetation Health Index (VHI). | **Complete & Verified** |
| **Human & Built Environment** | `/accessibility`, `/landfill`, `/air-pollution` | Travel time cost-distance mapping, multi-criteria landfill site selection, Sentinel-5P air quality concentrations (NO2, CO, SO2). | **Complete & Verified** |
| **Water Resources** | `/irrigation`, `/water-harvesting`, `/well-scope` | Potential groundwater zones, runoff coefficient, and rooftop rainwater collection sizing. | **Complete & Verified** |
| **Sample Digitization & GeoVault** | `/digitize`, `/rare-data` | On-screen feature vectorization, attribute editing, GeoJSON export, and external spatial dataset harvesting. | **Complete & Verified** |
| **GIS Academy** | `/academy` | Interactive video course viewer with multi-video playlists, progress tracking, and persistent bookmarking. | **Complete & Verified** |

---

## 4. Key Improvements in Current Working Copy

1. **Earthwork 3D Viewer & Calculation Engine:**
   - Implemented `Earthwork3DViewer.tsx` and `earthwork_3d.html` providing 3D visual excavation surfaces.
   - Strata layer breakdowns with separate excavation unit costs and bulking factors.
2. **Habitat Proximity & Interpolation:**
   - Robust vector distance computation without memory or boundary overflow in GEE.
   - IDW spatial interpolation pipeline with configurable power exponents.
3. **Cartography & Reporting:**
   - PDF export via ReportLab supporting vector scale bars, district bounding boxes, and metadata tables.
4. **UI/UX & Accessibility Polish:**
   - Dark/light theme consistency, high contrast text for map overlays, and accessible typography.
5. **Legacy Cleanup:**
   - Deprecated and removed legacy Streamlit files (`rwanda-geoportal/`) to avoid confusion and eliminate bloat.

---

## 5. What to Do When You Return

When you resume development, simply:
1. **Verify your local environment:**
   - Start backend: `python -m uvicorn backend.main:app --reload`
   - Start frontend: `cd artifacts/geoportal && npm run dev`
2. **Continue building features:**
   - Any planned future features can build directly on top of the clean React components in `artifacts/geoportal/src/pages/` and endpoints in `backend/main.py`.
3. **All work is committed into Git:**
   - Check `git log` or `git status` to see the checkpoint commit.
