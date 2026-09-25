with open('backend/main.py', 'a', encoding='utf-8') as f:
    f.write('''
from gee.earthwork import get_earthwork_3d_surface

@app.post("/api/earthwork/surface3d", tags=["analysis"])
def api_earthwork_surface3d(req: EarthworkAdvancedRequest):
    _require_gee()
    try:
        pts = get_earthwork_3d_surface(
            polygon_coords=req.polygon,
            target_elevation=req.target_elevation,
            slope_grade=req.slope_grade,
            slope_angle=req.slope_angle,
            topsoil_depth=req.topsoil_depth,
            batter_ratio=req.batter_ratio,
            custom_dem_id=req.custom_dem_id
        )
        return {"points": pts}
    except Exception as exc:
        logger.exception("3D surface computation failed")
        raise HTTPException(500, str(exc)) from exc
''')
print('Added 3D API endpoint.')
