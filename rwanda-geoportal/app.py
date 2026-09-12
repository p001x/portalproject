import streamlit as st
from utils.style import apply_style

st.set_page_config(
    page_title="GEOPORTAL ANALYSIS",
    page_icon="assets/logo.png",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.logo("assets/logo.png")

apply_style()

home_page = st.Page("app_home.py", title="Overview", icon=":material/space_dashboard:", default=True)

# 1. Agriculture & Water
agri_water_pages = [
    st.Page("pages/1_NDVI.py", title="NDVI", icon=":material/eco:"),
]

# 2. Risk & Disasters
risk_disaster_pages = [
    st.Page("pages/7_Landslide.py", title="Landslide", icon=":material/landslide:"),
    st.Page("pages/3_RUSLE.py", title="RUSLE", icon=":material/rainy:"),
    st.Page("pages/6_AirPollution.py", title="Air Pollution", icon=":material/air:"),
]

# 3. Urban & Environment
urban_env_pages = [
    st.Page("pages/9_UHI.py", title="UHI", icon=":material/location_city:"),
    st.Page("pages/5_Landfill.py", title="Landfill", icon=":material/delete:"),
]

# 4. Core Spatial Analysis
core_spatial_pages = [
    st.Page("pages/2_LST.py", title="LST", icon=":material/device_thermostat:"),
    st.Page("pages/4_Slope.py", title="Slope", icon=":material/terrain:"),
]

# 5. Data & Digitization
data_pages = [
    st.Page("pages/8_RARE_DATA.py", title="RARE DATA Hub", icon=":material/database:"),
    st.Page("pages/10_Sample_Digitization.py", title="Sample Digitization", icon=":material/draw:"),
]

nav = st.navigation({
    "": [home_page],
    "AGRICULTURE & WATER": agri_water_pages,
    "RISK & DISASTERS": risk_disaster_pages,
    "URBAN & ENVIRONMENT": urban_env_pages,
    "CORE SPATIAL": core_spatial_pages,
    "DATA & DIGITIZATION": data_pages,
})

nav.run()
