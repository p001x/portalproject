import ee

# Initialize Earth Engine
ee.Initialize(project='ee-test')

geometry_buffered = ee.Geometry.Point([37.6, 55.7]).buffer(500) # Moscow (Russia)
start_year = 2023
end_year = 2023
season_start = f"{start_year}-03-01"
season_end = f"{end_year}-06-30"

era5_precip_col = ee.ImageCollection("ECMWF/ERA5/DAILY").select("total_precipitation")
era5_current = (
    era5_precip_col.filterBounds(geometry_buffered)
    .filterDate(season_start, season_end)
    .sum().multiply(1000).rename("RF_CUMUL")
)

print("ERA5 Daily bands:", era5_current.bandNames().getInfo())

chirps_col = ee.ImageCollection("UCSB-CHG/CHIRPS/PENTAD")
chirps_current = (
    chirps_col.filterBounds(geometry_buffered)
    .filterDate(season_start, season_end)
    .sum().rename("RF_CUMUL")
)

print("CHIRPS PENTAD bands:", chirps_current.bandNames().getInfo())
