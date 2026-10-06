import json
from celery_app import celery_app

from gee.ndvi import compute_ndvi
from gee.lst import compute_lst
from gee.rusle import compute_rusle
from gee.slope import compute_slope
from gee.landfill import compute_landfill
from gee.landslide import compute_landslide_susceptibility
from gee.drought import compute_agricultural_drought
from gee.flood import compute_flood_susceptibility
from gee.air_pollution import compute_air_pollution
from gee.habitat import compute_habitat_suitability
from gee.irrigation import compute_irrigation_map
from gee.water_harvesting import compute_water_harvesting
from gee.supervised_classify import compute_classification

@celery_app.task(name='compute_ndvi_task')
def compute_ndvi_task(aoi_config, start_date, end_date, n_classes):
    return compute_ndvi(aoi_config, start_date, end_date, n_classes)

@celery_app.task(name='compute_lst_task')
def compute_lst_task(aoi_config, start_date, end_date, n_classes):
    return compute_lst(aoi_config, start_date, end_date, n_classes)

@celery_app.task(name='compute_rusle_task')
def compute_rusle_task(aoi_config, year, n_classes, rev_r, rev_k, rev_ls, rev_c, rev_p):
    return compute_rusle(aoi_config, year, n_classes, rev_r, rev_k, rev_ls, rev_c, rev_p)

@celery_app.task(name='compute_slope_task')
def compute_slope_task(aoi_config, n_classes):
    return compute_slope(aoi_config, n_classes)

@celery_app.task(name='compute_landfill_task')
def compute_landfill_task(aoi_config, n_classes, rev_riv, rev_res, rev_slp, rev_rd, rev_lulc, weights):
    return compute_landfill(aoi_config, n_classes, rev_riv, rev_res, rev_slp, rev_rd, rev_lulc, weights)

@celery_app.task(name='compute_landslide_task')
def compute_landslide_task(aoi_config, start_year, end_year, n_classes, rev_slp, rev_rf, rev_lith, rev_soil, rev_lc, rev_twi, rev_dist):
    return compute_landslide_susceptibility(aoi_config, start_year, end_year, n_classes, rev_slp, rev_rf, rev_lith, rev_soil, rev_lc, rev_twi, rev_dist)

@celery_app.task(name='compute_drought_task')
def compute_drought_task(aoi_config, year, n_classes, rev_sm, rev_rf, rev_ndvi, rev_vci, rev_lst, rev_cdd, rev_evi):
    return compute_agricultural_drought(
        aoi_config, year, n_classes,
        rev_sm=rev_sm, rev_rf=rev_rf, rev_ndvi=rev_ndvi, rev_vci=rev_vci,
        rev_lst=rev_lst, rev_cdd=rev_cdd, rev_evi=rev_evi
    )

@celery_app.task(name='compute_flood_task')
def compute_flood_task(aoi_config, start_year, end_year, n_classes, rev_rf, rev_twi, rev_lulc, rev_elev, rev_slp, rev_riv, rev_rd, rev_soil, rev_drain, rev_ndvi, weights):
    return compute_flood_susceptibility(aoi_config, start_year, end_year, n_classes, rev_rf, rev_twi, rev_lulc, rev_elev, rev_slp, rev_riv, rev_rd, rev_soil, rev_drain, rev_ndvi, weights)

@celery_app.task(name='compute_air_pollution_task')
def compute_air_pollution_task(aoi_config, start_date, end_date, n_classes):
    return compute_air_pollution(aoi_config, start_date, end_date, n_classes)

@celery_app.task(name='compute_habitat_task')
def compute_habitat_task(aoi_config, n_classes, rev_lulc, rev_elev, rev_slp, rev_riv, rev_rd, rev_pop, weights):
    return compute_habitat_suitability(aoi_config, n_classes, rev_lulc, rev_elev, rev_slp, rev_riv, rev_rd, rev_pop, weights)

@celery_app.task(name='compute_irrigation_task')
def compute_irrigation_task(aoi_config, start_date, end_date, planting_date, crop_type, n_classes, method, custom_labels):
    return compute_irrigation_map(aoi_config, start_date, end_date, planting_date, crop_type, n_classes, method, custom_labels)

@celery_app.task(name='compute_water_harvesting_task')
def compute_water_harvesting_task(aoi_config, year):
    return compute_water_harvesting(aoi_config, year)

@celery_app.task(name='compute_classification_task')
def compute_classification_task(aoi_config, start_date, end_date, training_samples, classifier_type):
    return compute_classification(aoi_config, start_date, end_date, training_samples, classifier_type)
