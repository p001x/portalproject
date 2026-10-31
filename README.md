# SPETRO Geoportal — Planetary Geospatial Analytics & Earth Observation

[![Live Deployment](https://img.shields.io/badge/Live%20Platform-geoportal.spetro.workers.dev-blue?style=for-the-badge&logo=cloudflare)](https://geoportal.spetro.workers.dev)
[![Hugging Face Datasets](https://img.shields.io/badge/Hugging%20Face-blacportal--datasets-yellow?style=for-the-badge&logo=huggingface)](https://huggingface.co/datasets/petersstore/blacportal-datasets)
[![Python FastAPI](https://img.shields.io/badge/Backend-FastAPI%20%7C%20GEE-green?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com)
[![React Vite](https://img.shields.io/badge/Frontend-React%2018%20%7C%20Vite-61dafb?style=for-the-badge&logo=react)](https://vitejs.dev)

**SPETRO Geoportal** is an enterprise-grade Earth Observation (EO) and spatial data analysis platform designed for environmental intelligence, satellite remote sensing, multi-criteria spatial decision support, and geospatial repository management.

🌐 **Official Web Platform:** [https://geoportal.spetro.workers.dev](https://geoportal.spetro.workers.dev)  
📦 **Geospatial Data Repository:** [https://huggingface.co/datasets/petersstore/blacportal-datasets](https://huggingface.co/datasets/petersstore/blacportal-datasets)

---

## 🛰️ Core Capabilities & Modules

1. **Earth Observation & Google Earth Engine Integration**
   - High-throughput analysis using Landsat 8/9, Sentinel-2, MODIS, and SRTM elevation models.
   - Cloud masking, optical compositing, and vegetation index computations (NDVI, NDWI, EVI, NDBI).

2. **Land Surface Temperature (LST) & Urban Heat Island (UHI)**
   - Radiative transfer modeling and split-window algorithms applied to thermal infrared sensors.
   - Spatio-temporal temperature anomaly mapping and thermal comfort assessment.

3. **Soil Erosion Risk Modeling (RUSLE)**
   - Automated Revised Universal Soil Loss Equation (RUSLE) computation:
     - Rainfall erosivity ($R$), Soil erodibility ($K$), Slope length and steepness ($LS$), Cover management ($C$), and Support practice ($P$).
   - Basin-level and administrative sector soil loss risk quantification (tons/ha/yr).

4. **Multi-Criteria Evaluation (MCE) & Habitat Suitability**
   - Analytic Hierarchy Process (AHP) driven suitability modeling for wildlife habitats, agriculture, and infrastructure siting.
   - Environmental constraint exclusion and weighted raster overlays.

5. **Rare & Open Geospatial Dataset Repository**
   - Direct integration with Hugging Face Datasets repository (`petersstore/blacportal-datasets`).
   - High-performance streaming uploads and CDN distribution for large GeoTIFF, Shapefile, GeoJSON, NetCDF, and CSV data callsets up to 50 GB.

6. **Accessibility & Network Proximity Analysis**
   - Cost-distance friction surface modeling and travel-time isochrone calculation.
   - Facility allocation and catchment zone evaluation across regional road and health networks.

---

## 🏗️ Technical Architecture

* **Frontend:** React 18, Vite, Tailwind CSS, Leaflet / MapLibre GL, Lucide Icons.
* **Backend:** FastAPI, Python 3.11, Google Earth Engine API, GeoPandas, Rasterio, Shapely, PyKrige, SciPy.
* **Edge & Cloud Distribution:** Cloudflare Workers (Global CDN & Edge routing), Hugging Face Hub (Storage & Model Distribution), Render (FastAPI Cloud Container).

---

## 📄 License & Attribution

Developed by **SPETRO Systems**. All rights reserved.  
For inquiries, documentation, and spatial data partnerships, visit [geoportal.spetro.workers.dev](https://geoportal.spetro.workers.dev).
