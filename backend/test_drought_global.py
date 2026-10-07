import ee
from gee.drought import compute_drought_map

def test():
    import gee.auth as auth
    auth.initialize_gee()

    try:
        res = compute_drought_map(
            aoi_config={"type": "world", "name": "World"},
            drought_type="meteorological",
            start_date="2022-01-01",
            end_date="2022-12-31"
        )
        print("Meteo Success:", res)
    except Exception as e:
        print("Meteo Error:", e)

    try:
        res = compute_drought_map(
            aoi_config={"type": "world", "name": "World"},
            drought_type="agricultural",
            start_date="2022-01-01",
            end_date="2022-12-31"
        )
        print("Agri Success:", res)
    except Exception as e:
        print("Agri Error:", e)

    try:
        res = compute_drought_map(
            aoi_config={"type": "world", "name": "World"},
            drought_type="hydrological",
            start_date="2022-01-01",
            end_date="2022-12-31"
        )
        print("Hydro Success:", res)
    except Exception as e:
        print("Hydro Error:", e)


if __name__ == "__main__":
    test()
