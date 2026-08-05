import os
import json
import ee
import streamlit as st


def _load_key_json() -> str:
    key_json = os.environ.get("GEE_SERVICE_ACCOUNT_KEY", "").strip()
    if len(key_json) > 100 and key_json.startswith("{"):
        return key_json

    try:
        val = str(st.secrets.get("GEE_SERVICE_ACCOUNT_KEY", "")).strip()
        if len(val) > 100 and val.startswith("{"):
            return val
    except Exception:
        pass

    key_file_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "backend", "gee_key.json"))
    if os.path.exists(key_file_path):
        with open(key_file_path, "r", encoding="utf-8") as f:
            val = f.read().strip()
            if len(val) > 100 and val.startswith("{"):
                return val

    return key_json


def _try_init(key_json: str):
    key_data = json.loads(key_json)
    credentials = ee.ServiceAccountCredentials(
        email=key_data["client_email"],
        key_data=key_json,
    )
    
    target_project = key_data.get("project_id", "ee-petersonyang87")
    ee.Initialize(credentials, project=target_project)
    
    roots = ee.data.getAssetRoots()
    print(f"Verified GEE initialization. Account: {key_data['client_email']}, Project: {target_project}, Roots: {roots}")
    
    return key_data


@st.cache_resource
def _gee_resource():
    """Pure GEE initialisation — no Streamlit commands. Raises RuntimeError on failure."""
    key_json = _load_key_json()

    if not key_json:
        raise RuntimeError(
            "GEE_SERVICE_ACCOUNT_KEY is not set. "
            "Add the full JSON contents of your Google Cloud service account key as a Replit Secret."
        )

    if not key_json.startswith("{"):
        raise RuntimeError(
            f"GEE_SERVICE_ACCOUNT_KEY does not look like JSON "
            f"(starts with: {key_json[:40]!r}). "
            "Paste the *entire* contents of the downloaded .json key file."
        )

    try:
        key_data = json.loads(key_json)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"GEE_SERVICE_ACCOUNT_KEY is not valid JSON: {exc}") from exc

    try:
        _try_init(key_json)
        return True
    except Exception as exc:
        raise RuntimeError(
            f"{exc}\n\nService account: {key_data.get('client_email', 'unknown')}\n\n"
            "Make sure this service account has Earth Engine access at "
            "https://code.earthengine.google.com/register"
        ) from exc


def initialize_gee():
    """Call at the top of each page. Shows a clear error and stops if GEE is unavailable."""
    try:
        _gee_resource()
    except Exception as exc:
        st.error(f"**GEE initialization failed:** {exc}")
        st.stop()
