import ee

def interpolate_idw(points: ee.FeatureCollection, property_name: str, aoi: ee.Geometry, range_val: int = 50000) -> ee.Image:
    """
    Interpolate point data using Inverse Distance Weighting (IDW).
    
    Args:
        points: ee.FeatureCollection containing the point data.
        property_name: The name of the property to interpolate (e.g., 'rainfall_mm').
        aoi: The Area of Interest geometry to clip the resulting image.
        range_val: The maximum distance to search for points (in meters).
        
        ee.Image representing the interpolated surface.
    """
    # IDW in Earth Engine requires global mean and stdDev
    stats = points.reduceColumns(
        reducer=ee.Reducer.mean().combine(ee.Reducer.stdDev(), sharedInputs=True),
        selectors=[property_name]
    )
    mean_val = ee.Number(stats.get('mean'))
    std_val = ee.Number(stats.get('stdDev'))
    
    return points.inverseDistance(
        range=range_val,
        propertyName=property_name,
        mean=mean_val,
        stdDev=std_val
    ).clip(aoi)

def interpolate_kriging(points: ee.FeatureCollection, property_name: str, aoi: ee.Geometry, shape: str = "exponential", range_val: int = 50000, sill: float = 1.0, nugget: float = 0.1) -> ee.Image:
    """
    Interpolate point data using Kriging.
    
    Args:
        points: ee.FeatureCollection containing the point data.
        property_name: The name of the property to interpolate.
        aoi: The Area of Interest geometry.
        shape: Semi-variogram model shape ('exponential', 'gaussian', or 'spherical').
        range_val: Range parameter of the semi-variogram (meters).
        sill: Sill parameter of the semi-variogram.
        nugget: Nugget parameter of the semi-variogram.
        
    Returns:
        ee.Image representing the Kriging interpolated surface.
    """
    return points.kriging(
        propertyName=property_name,
        shape=shape,
        range=range_val,
        sill=sill,
        nugget=nugget,
        maxDistance=range_val
    ).clip(aoi)

def interpolate_raster_via_points(image: ee.Image, aoi: ee.Geometry, scale: int, method: str = "idw", num_points: int = 150) -> ee.Image:
    """
    Simulates ground stations by sampling a raster and then interpolating the points 
    using IDW or Kriging to create a realistic interpolated surface.
    """
    # Sample the raster at random points to create "virtual stations"
    points = image.sample(
        region=aoi,
        scale=scale * 5,
        numPixels=num_points,
        geometries=True
    )
    
    # The property name is the first band's name
    band_name = image.bandNames().get(0)
    
    if method == "kriging":
        return interpolate_kriging(points, band_name, aoi)
    else:
        return interpolate_idw(points, band_name, aoi)
