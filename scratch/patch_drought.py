import json

with open("backend/gee/drought.py", "r", encoding="utf-8") as f:
    code = f.read()

# 1. Update _build_drought_images
code = code.replace(
'''def _build_drought_images(
    aoi_config: dict, start_year: int, end_year: int,
    season: str = "season_b", start_month: int = None, end_month: int = None,
    start_date: str = None, end_date: str = None,
    reverse_sm: bool = False, reverse_rf: bool = False, reverse_ndvi: bool = False,
    reverse_vci: bool = False, reverse_lst: bool = False, reverse_cdd: bool = False, reverse_evi: bool = False
):''',
'''def _build_drought_images(
    aoi_config: dict, start_year: int, end_year: int,
    season: str = "season_b", start_month: int = None, end_month: int = None,
    start_date: str = None, end_date: str = None,
    reverse_sm: bool = False, reverse_rf: bool = False, reverse_ndvi: bool = False,
    reverse_vci: bool = False, reverse_lst: bool = False, reverse_cdd: bool = False, reverse_evi: bool = False,
    weights: dict = None
):'''
)

code = code.replace(
'''        result_tuple = _build_drought_images_core(
            aoi_config, start_year, end_year, season, start_month, end_month, start_date, end_date,
            reverse_sm, reverse_rf, reverse_ndvi, reverse_vci, reverse_lst, reverse_cdd, reverse_evi
        )''',
'''        result_tuple = _build_drought_images_core(
            aoi_config, start_year, end_year, season, start_month, end_month, start_date, end_date,
            reverse_sm, reverse_rf, reverse_ndvi, reverse_vci, reverse_lst, reverse_cdd, reverse_evi, weights
        )'''
)

# 2. Update _build_drought_images_core
code = code.replace(
'''def _build_drought_images_core(
    aoi_config: dict, start_year: int, end_year: int,
    season: str = "season_b", start_month: int = None, end_month: int = None,
    start_date: str = None, end_date: str = None,
    reverse_sm: bool = False, reverse_rf: bool = False, reverse_ndvi: bool = False,
    reverse_vci: bool = False, reverse_lst: bool = False, reverse_cdd: bool = False, reverse_evi: bool = False
):''',
'''def _build_drought_images_core(
    aoi_config: dict, start_year: int, end_year: int,
    season: str = "season_b", start_month: int = None, end_month: int = None,
    start_date: str = None, end_date: str = None,
    reverse_sm: bool = False, reverse_rf: bool = False, reverse_ndvi: bool = False,
    reverse_vci: bool = False, reverse_lst: bool = False, reverse_cdd: bool = False, reverse_evi: bool = False,
    weights: dict = None
):'''
)

code = code.replace(
'''    # AHP Weights combination
    dvi_raw = (
        sm_norm.multiply(WEIGHTS["sm"])
        .add(rf_norm.multiply(WEIGHTS["rf"]))
        .add(ndvi_norm.multiply(WEIGHTS["ndvi"]))
        .add(vci_norm.multiply(WEIGHTS["vci"]))
        .add(lst_norm.multiply(WEIGHTS["lst"]))
        .add(cdd_norm.multiply(WEIGHTS["cdd"]))
        .add(evi_norm.multiply(WEIGHTS["evi"]))
        .clamp(0, 1)
        .rename("DVI")
    )''',
'''    # AHP Weights combination
    w_dict = weights or DEFAULT_WEIGHTS
    
    dvi_raw = (
        sm_norm.multiply(w_dict.get("sm", DEFAULT_WEIGHTS["sm"]))
        .add(rf_norm.multiply(w_dict.get("rf", DEFAULT_WEIGHTS["rf"])))
        .add(ndvi_norm.multiply(w_dict.get("ndvi", DEFAULT_WEIGHTS["ndvi"])))
        .add(vci_norm.multiply(w_dict.get("vci", DEFAULT_WEIGHTS["vci"])))
        .add(lst_norm.multiply(w_dict.get("lst", DEFAULT_WEIGHTS["lst"])))
        .add(cdd_norm.multiply(w_dict.get("cdd", DEFAULT_WEIGHTS["cdd"])))
        .add(evi_norm.multiply(w_dict.get("evi", DEFAULT_WEIGHTS["evi"])))
        .clamp(0, 1)
        .rename("DVI")
    )'''
)

code = code.replace(
'''    return aoi, geometry, dvi, vci, sm_current, rf_pci, lst_current, dry_periods, ndvi_current, season_info, water_mask''',
'''    return aoi, geometry, dvi, vci, sm_current, rf_pci, lst_current, dry_periods, ndvi_current, season_info, water_mask, evi_current, sm_norm, rf_norm, ndvi_norm, vci_norm, lst_norm, cdd_norm, evi_norm'''
)

with open("backend/gee/drought.py", "w", encoding="utf-8") as f:
    f.write(code)

print("Patching phase 1 complete.")
