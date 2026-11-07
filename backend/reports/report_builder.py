import io
import urllib.request
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, Image as RLImage, KeepTogether
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT

from reports.cartography import enhance_map_cartography

GREEN       = colors.HexColor("#1a9850")
DARK        = colors.HexColor("#1a1a2e")
LIGHT_GREEN = colors.HexColor("#d9ef8b")
LIGHT_GRAY  = colors.HexColor("#f8f9fa")

AGENCY_CONFIGS = {
    "REMA": {
        "name": "RWANDA ENVIRONMENT MANAGEMENT AUTHORITY (REMA)",
        "subtitle": "ENVIRONMENTAL IMPACT & ECOLOGICAL VULNERABILITY DOSSIER",
        "primary": colors.HexColor("#006633"),      # Official Rwanda Green
        "secondary": colors.HexColor("#e8f5e9"),
        "accent": colors.HexColor("#f4b400"),
        "mandate": "Prepared pursuant to Law N°48/2018 of 13/08/2018 on Environment. Official technical assessment for environmental conservation and buffer regulation.",
        "badge": "OFFICIAL REGULATORY DOSSIER",
    },
    "MINEMA": {
        "name": "MINISTRY OF EMERGENCY MANAGEMENT (MINEMA)",
        "subtitle": "MULTI-HAZARD RISK ASSESSMENT & CONTINGENCY PROFILE",
        "primary": colors.HexColor("#c5221f"),      # Official Emergency Alert Red
        "secondary": colors.HexColor("#fce8e6"),
        "accent": colors.HexColor("#e37400"),
        "mandate": "Formulated under the National Disaster Risk Management Policy. Official situational hazard profile for disaster mitigation and emergency preparedness.",
        "badge": "DISASTER CONTINGENCY ADVISORY",
    },
    "RAB": {
        "name": "RWANDA AGRICULTURE & ANIMAL RESOURCES BOARD (RAB)",
        "subtitle": "AGRO-ECOLOGICAL SUITABILITY & SOIL CONSERVATION DOSSIER",
        "primary": colors.HexColor("#2e7d32"),      # Agricultural Emerald
        "secondary": colors.HexColor("#f1f8e9"),
        "accent": colors.HexColor("#fb8c00"),
        "mandate": "Prepared under Strategic Plan for Agriculture Transformation (PSTA 4). Technical guidance for radical terracing, irrigation, and catchment protection.",
        "badge": "AGRICULTURAL POLICY DIRECTIVE",
    },
    "STANDARD": {
        "name": "SPETRO GEOPORTAL ANALYSIS",
        "subtitle": "SATELLITE EARTH OBSERVATION & SPATIAL ANALYTICS REPORT",
        "primary": colors.HexColor("#0f766e"),      # Deep Emerald / Teal
        "secondary": colors.HexColor("#f0fdf4"),
        "accent": colors.HexColor("#059669"),
        "mandate": "Automated Earth Observation analysis computed on-demand via Copernicus Sentinel and USGS Landsat satellite missions powered by SPETRO Spatial Intelligence.",
        "badge": "SPETRO ANALYTICAL DOSSIER",
    },
}

PAGE_W = A4[0] - 4 * cm    # usable width inside 2 cm margins


# ─── helpers ──────────────────────────────────────────────────────────────────

def _styles(primary_color=GREEN):
    s = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "Title", parent=s["Heading1"], fontSize=18, leading=22,
            textColor=DARK, spaceAfter=4, alignment=TA_CENTER, fontName="Helvetica-Bold"
        ),
        "subtitle": ParagraphStyle(
            "Subtitle", parent=s["Normal"], fontSize=10, leading=14,
            textColor=primary_color, spaceAfter=12, alignment=TA_CENTER, fontName="Helvetica-Bold"
        ),
        "badge": ParagraphStyle(
            "Badge", parent=s["Normal"], fontSize=8, leading=10,
            textColor=colors.white, alignment=TA_CENTER, fontName="Helvetica-Bold"
        ),
        "section": ParagraphStyle(
            "Section", parent=s["Heading2"], fontSize=12, leading=16,
            textColor=primary_color, spaceBefore=12, spaceAfter=6, fontName="Helvetica-Bold"
        ),
        "body": ParagraphStyle(
            "Body", parent=s["Normal"], fontSize=9, leading=13,
        ),
        "caption": ParagraphStyle(
            "Caption", parent=s["Normal"], fontSize=8, leading=11,
            textColor=colors.gray, alignment=TA_CENTER, spaceAfter=6,
        ),
        "note": ParagraphStyle(
            "Note", parent=s["Normal"], fontSize=8, leading=11,
            textColor=colors.dimgray,
        ),
    }


def _meta_table(district: str, date_range: str) -> Table:
    data = [
        ["District:",       district],
        ["Analysis Period:", date_range],
        ["Generated:",      datetime.now().strftime("%B %d, %Y at %H:%M UTC")],
        ["Data Source:",    "Google Earth Engine (GEE)"],
    ]
    t = Table(data, colWidths=[4 * cm, 12 * cm])
    t.setStyle(TableStyle([
        ("FONTSIZE",     (0, 0), (-1, -1), 10),
        ("FONTNAME",     (0, 0), (0, -1), "Helvetica-Bold"),
        ("TEXTCOLOR",    (0, 0), (0, -1), DARK),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [LIGHT_GRAY, colors.white]),
        ("TOPPADDING",   (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 4),
        ("LEFTPADDING",  (0, 0), (-1, -1), 6),
    ]))
    return t


def _stats_table(stats: dict, st_styles: dict) -> list:
    data = [["Metric", "Value"]] + [[k, str(v)] for k, v in stats.items()]
    t = Table(data, colWidths=[10 * cm, 6 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, 0), GREEN),
        ("TEXTCOLOR",    (0, 0), (-1, 0), colors.white),
        ("FONTNAME",     (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",     (0, 0), (-1, -1), 10),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [LIGHT_GRAY, colors.white]),
        ("GRID",         (0, 0), (-1, -1), 0.5, colors.lightgrey),
        ("TOPPADDING",   (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 5),
        ("LEFTPADDING",  (0, 0), (-1, -1), 8),
    ]))
    return [Paragraph("Key Statistics", st_styles["section"]), t, Spacer(1, 0.4 * cm)]


def _class_table(class_areas: dict, st_styles: dict) -> list:
    total = sum(class_areas.values()) or 1
    data  = [["Class", "Area (km²)", "% of Total"]]
    for label, area in class_areas.items():
        data.append([label, f"{area:.2f}", f"{area/total*100:.1f}%"])
    data.append(["TOTAL", f"{total:.2f}", "100%"])
    t = Table(data, colWidths=[9 * cm, 4 * cm, 3 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, 0), DARK),
        ("TEXTCOLOR",    (0, 0), (-1, 0), colors.white),
        ("FONTNAME",     (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME",     (0, -1), (-1, -1), "Helvetica-Bold"),
        ("BACKGROUND",   (0, -1), (-1, -1), LIGHT_GREEN),
        ("FONTSIZE",     (0, 0), (-1, -1), 10),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [LIGHT_GRAY, colors.white]),
        ("GRID",         (0, 0), (-1, -1), 0.5, colors.lightgrey),
        ("TOPPADDING",   (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 5),
        ("LEFTPADDING",  (0, 0), (-1, -1), 8),
    ]))
    return [
        Paragraph("Area by Classification (km²)", st_styles["section"]),
        t, Spacer(1, 0.4 * cm),
    ]


def _fetch_image(url: str, timeout: int = 45) -> io.BytesIO | None:
    """Download image from URL → BytesIO (returns None on failure)."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return io.BytesIO(resp.read())
    except Exception:
        return None


def _rl_image(buf: io.BytesIO, width: float, caption: str,
              st_styles: dict) -> list:
    """Wrap a BytesIO PNG → ReportLab Image + caption paragraph."""
    try:
        img = RLImage(buf, width=width, height=width)   # square thumbnails
        return [img, Paragraph(caption, st_styles["caption"])]
    except Exception:
        return [Paragraph(f"[Map unavailable: {caption}]", st_styles["caption"])]


def _executive_briefing(module_name: str, district: str, date_range: str, stats: dict, class_areas: dict, st_styles: dict, primary_color: colors.Color) -> list:
    """Builds a clear, executive-level natural language summary and condition assessment for the PDF."""
    mod_lower = module_name.lower()
    status_label = "SATISFACTORY BASELINE"
    status_color = colors.HexColor("#059669")
    narrative = f"Satellite Earth observation across {district} during {date_range} provides an empirical baseline of surface conditions."
    
    mean_val = None
    for k, v in stats.items():
        if "mean" in k.lower():
            try:
                mean_val = float(v)
                break
            except (ValueError, TypeError):
                pass
                
    total_area = sum(float(v) for v in class_areas.values() if isinstance(v, (int, float))) if class_areas else 0
    dominant_class = ""
    dominant_pct = 0.0
    if class_areas and total_area > 0:
        sorted_classes = sorted([(k, float(v)) for k, v in class_areas.items() if isinstance(v, (int, float))], key=lambda x: x[1], reverse=True)
        if sorted_classes:
            dominant_class = sorted_classes[0][0]
            dominant_pct = (sorted_classes[0][1] / total_area) * 100

    if "ndvi" in mod_lower or "vegetation" in mod_lower:
        if mean_val is not None:
            if mean_val >= 0.60:
                status_label = "OPTIMAL CANOPY & ROBUST BIOMASS"
                status_color = colors.HexColor("#059669")
                narrative = (
                    f"Overall vegetative vigor across {district} is in an optimal ecological state (Mean NDVI: {mean_val:.2f}). "
                    f"Canopy cover reflects active photosynthetic activity with healthy foliage density and minimal physiological moisture stress. "
                    f"The dominant land cover category is '{dominant_class}', representing {dominant_pct:.1f}% of the surveyed landscape."
                )
            elif mean_val >= 0.40:
                status_label = "FAVORABLE / MIXED VEGETATIVE HEALTH"
                status_color = colors.HexColor("#0d9488")
                narrative = (
                    f"Vegetative cover across {district} exhibits moderate to favorable health (Mean NDVI: {mean_val:.2f}). "
                    f"The landscape comprises a balanced mixture of active cropland, agroforestry, and seasonal shrubland. "
                    f"The primary classification is '{dominant_class}' ({dominant_pct:.1f}% of monitored territory)."
                )
            elif mean_val >= 0.25:
                status_label = "MODERATE CANOPY STRESS WATCH"
                status_color = colors.HexColor("#d97706")
                narrative = (
                    f"Satellite monitoring detects localized vegetative stress across {district} (Mean NDVI: {mean_val:.2f}). "
                    f"Observable patches display reduced chlorophyll absorption, likely driven by seasonal dryness or localized soil moisture depletion. "
                    f"Dominant classification '{dominant_class}' covers {dominant_pct:.1f}% of the territory."
                )
            else:
                status_label = "CRITICAL VEGETATION DEFICIT"
                status_color = colors.HexColor("#dc2626")
                narrative = (
                    f"Satellite spectral indices indicate acute vegetative degradation or severe canopy dormancy in {district} (Mean NDVI: {mean_val:.2f}). "
                    f"Large expanses correspond to sparse rangeland or bare agricultural soil requiring targeted soil-moisture interventions."
                )
    elif "drought" in mod_lower:
        status_label = "DROUGHT MONITORING PROFILE"
        status_color = colors.HexColor("#d97706")
        narrative = (
            f"Multi-temporal drought indexing across {district} for {date_range} synthesizes rainfall deficit and vegetative thermal stress. "
            f"Dominant territory classification '{dominant_class}' encompasses {dominant_pct:.1f}% of the total monitored area ({total_area:.2f} km²)."
        )
    elif "rusle" in mod_lower or "erosion" in mod_lower:
        if mean_val is not None:
            if mean_val > 50:
                status_label = "SEVERE SOIL LOSS RISK"
                status_color = colors.HexColor("#dc2626")
                narrative = (
                    f"Watershed modeling estimates severe soil erosion pressure across {district} (Mean soil loss: {mean_val:.2f} t/ha/yr). "
                    f"Steep slope topography combined with intense precipitation exposes topsoil to accelerated detachment. Immediate mechanical terracing is recommended."
                )
            elif mean_val > 25:
                status_label = "ELEVATED EROSION HAZARD"
                status_color = colors.HexColor("#ea580c")
                narrative = (
                    f"Erosion modeling identifies heightened soil loss vulnerability across {district} (Spatial mean: {mean_val:.2f} t/ha/yr). "
                    f"Contour stabilization and agroforestry buffers are advised to protect vulnerable catchment slopes."
                )
            else:
                status_label = "TOLERABLE SOIL LOSS BASELINE"
                status_color = colors.HexColor("#059669")
                narrative = (
                    f"Catchment soil loss rates across {district} remain largely within tolerable conservation thresholds (Mean: {mean_val:.2f} t/ha/yr). "
                    f"Existing vegetative cover and terraced hillsides effectively mitigate severe runoff detachment."
                )
    elif "flood" in mod_lower or "water" in mod_lower:
        status_label = "HYDROLOGICAL & FLOOD PROFILE"
        status_color = colors.HexColor("#0284c7")
        narrative = (
            f"Radar and optical hydrological analysis detects surface water dynamics and inundation footprints across {district}. "
            f"Lowland riverine floodplains and wetland drainage networks are mapped across {total_area:.2f} km²."
        )
    elif "landslide" in mod_lower or "lsi" in mod_lower:
        status_label = "SLOPE STABILITY ASSESSMENT"
        status_color = colors.HexColor("#ea580c")
        narrative = (
            f"Geomorphological slope susceptibility modeling across {district} identifies key terrain failure corridors. "
            f"Precipitation triggers on slopes exceeding 25° demand regular monitoring and vegetative bio-engineering."
        )
    elif "uhi" in mod_lower or "lst" in mod_lower or "heat" in mod_lower:
        status_label = "THERMAL & MICROCLIMATE PROFILE"
        status_color = colors.HexColor("#e11d48")
        narrative = (
            f"Thermal infrared satellite retrieval measures radiometric surface temperatures across {district}. "
            f"Urban impervious surfaces and dense settlements contrast against vegetative cooling corridors."
        )
    else:
        narrative = (
            f"Comprehensive geospatial analytics for {module_name} across {district} ({date_range}). "
            f"Analysis covers {total_area:.2f} km² of territory, with '{dominant_class or 'Predominant'}' as the primary observed class ({dominant_pct:.1f}%)."
        )

    box_data = [
        [Paragraph(f"<b>STATUS: {status_label}</b>", ParagraphStyle("StatH", parent=st_styles["body"], fontSize=9, textColor=status_color, fontName="Helvetica-Bold"))],
        [Paragraph(f"<b>Executive Briefing:</b> {narrative}", st_styles["body"])],
    ]
    if dominant_class:
        box_data.append([
            Paragraph(f"<b>Key Landscape Indicator:</b> Total surveyed area: <b>{total_area:.2f} km²</b> ({total_area*100:,.0f} ha) · Dominant category: <b>{dominant_class}</b> (<b>{dominant_pct:.1f}%</b>)", st_styles["note"])
        ])
        
    t = Table(box_data, colWidths=[PAGE_W])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
        ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#cbd5e1")),
        ("LINEBEFORE", (0, 0), (0, -1), 4, status_color),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ]))
    
    return [
        Paragraph("Executive Summary & Operational Synthesis", st_styles["section"]),
        t,
        Spacer(1, 0.3 * cm)
    ]


def _provenance_table(st_styles: dict) -> list:
    """Adds formal satellite data quality and provenance verification."""
    data = [
        ["Satellite Constellation:", "Copernicus Sentinel-2 MSI (10m) / Sentinel-1 C-SAR / USGS Landsat-8/9"],
        ["Processing Engine:",       "Google Earth Engine (GEE) Automated Cloud Analytics"],
        ["Atmospheric Correction:",   "Surface Reflectance (SR) with Cloud & Shadow QA Masking"],
        ["Coordinate Reference:",     "WGS 84 / Geographic (EPSG:4326)"],
        ["Authority & Platform:",    "SPETRO Spatial Intelligence · Geoportal Analysis Platform"],
    ]
    t = Table(data, colWidths=[5 * cm, 11 * cm])
    t.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, 0), (0, -1), DARK),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [LIGHT_GRAY, colors.white]),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#e2e8f0")),
    ]))
    return [
        Paragraph("Data Quality & Satellite Provenance", st_styles["section"]),
        t,
        Spacer(1, 0.3 * cm),
    ]


def _build_action_matrix(module_name: str, stats: dict, class_areas: dict, agency_template: str, st_styles: dict) -> list:
    """Intelligently generates policy/engineering actions based on analysis metrics."""
    module_lower = module_name.lower()
    actions = []
    
    if "rusle" in module_lower or "erosion" in module_lower:
        mean_erosion = stats.get("Mean Erosion (t/ha/yr)", 0)
        severe_area = class_areas.get("Severe", 0) + class_areas.get("Extreme", 0)
        
        if severe_area > 5 or mean_erosion > 20:
            actions.append(["Construct Radical Terraces on slopes > 16° with deep soil profiles.", "Immediate"])
            actions.append(["Plant Vetiver Grass (Chrysopogon zizanioides) hedgerows along contour lines.", "High"])
        actions.append(["Enforce 10m vegetated buffer strips around stream channels.", "High"])
        actions.append(["Promote agroforestry with Alnus acuminata and Grevillea robusta.", "Medium"])
        
    elif "flood" in module_lower or "water" in module_lower:
        actions.append(["Desilt drainage canals and reinforce retention dykes in low-lying valleys.", "Immediate"])
        actions.append(["Restrict new permanent construction in identified flood plains.", "High"])
        actions.append(["Deploy community early-warning sensors along major riverbanks.", "Medium"])
        
    elif "landslide" in module_lower or "lsi" in module_lower:
        actions.append(["Identify settlements located on high-risk slopes (>30°) for planned resettlement.", "Critical"])
        actions.append(["Establish cut-off drains and sub-surface drainage trenches to divert runoff.", "High"])
        actions.append(["Slope stabilization via deep-rooted bamboo and indigenous vegetation.", "Medium"])
        
    elif "drought" in module_lower or "ndvi" in module_lower or "dvi" in module_lower:
        actions.append(["Prioritize small-scale solar irrigation systems for vulnerable smallholder farms.", "High"])
        actions.append(["Distribute drought-resistant crop seeds (cassava, sorghum, drought-tolerant maize).", "High"])
        actions.append(["Construct community rainwater harvesting ponds (Radier / water pans).", "Medium"])
        
    elif "uhi" in module_lower or "lst" in module_lower or "heat" in module_lower:
        actions.append(["Expand urban green corridors, street tree planting, and pocket parks.", "High"])
        actions.append(["Preserve urban wetland reserves to act as natural evaporative cooling sinks.", "High"])
        actions.append(["Mandate cool roof / reflective materials on commercial and public buildings.", "Medium"])
        
    elif "habitat" in module_lower or "crane" in module_lower:
        actions.append(["Establish protected buffer zones around identified high-suitability wetlands.", "Immediate"])
        actions.append(["Restrict agricultural expansion and pesticide use in 'Very High' suitability areas.", "High"])
        actions.append(["Implement community-led monitoring programs for Grey Crowned Crane nesting sites.", "High"])
        actions.append(["Restore degraded moderate-suitability wetlands to expand potential habitat.", "Medium"])
        
    else:
        actions.append(["Conduct ground-truth verification on high-risk sectors identified by satellite.", "High"])
        actions.append(["Integrate findings into District Development Plan (DDP) environmental annex.", "Medium"])
        
    # Format as a table
    data = [["Recommended Policy & Engineering Actions", "Urgency"]] + actions
    t = Table(data, colWidths=[12 * cm, 4 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, 0), DARK),
        ("TEXTCOLOR",    (0, 0), (-1, 0), colors.white),
        ("FONTNAME",     (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",     (0, 0), (-1, -1), 9),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [LIGHT_GRAY, colors.white]),
        ("GRID",         (0, 0), (-1, -1), 0.5, colors.lightgrey),
        ("TOPPADDING",   (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 6),
        ("LEFTPADDING",  (0, 0), (-1, -1), 8),
    ]))
    return [
        Paragraph("Intervention Action Matrix", st_styles["section"]),
        t, Spacer(1, 0.4 * cm),
    ]


# ─── public API ───────────────────────────────────────────────────────────────

def build_report(
    module_name: str,
    district: str,
    date_range: str,
    stats: dict,
    class_areas: dict,
    extra_notes: str = "",
    maps: list[tuple[str, str]] = None,
    agency_template: str = "STANDARD",
    include_action_matrix: bool = True,
    proposed_facilities: list = None,
    delta_stats: dict = None,
) -> bytes:
    """Generic PDF report for any analysis module (no embedded maps)."""
    buffer = io.BytesIO()
    doc    = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2*cm, bottomMargin=2*cm,
    )
    
    agency_key = agency_template.upper() if agency_template.upper() in AGENCY_CONFIGS else "STANDARD"
    config = AGENCY_CONFIGS[agency_key]
    st_styles = _styles(primary_color=config["primary"])
    story     = []

    story.append(Paragraph(config["name"], st_styles["title"]))
    story.append(Paragraph(config["subtitle"],  st_styles["subtitle"]))
    story.append(Paragraph(config["badge"], st_styles["badge"]))
    story.append(HRFlowable(width="100%", thickness=2, color=config["primary"], spaceAfter=10))
    story.append(_meta_table(district, date_range))
    story.append(Spacer(1, 0.4 * cm))
    story.extend(_executive_briefing(module_name, district, date_range, stats, class_areas, st_styles, config["primary"]))
    story.extend(_stats_table(stats, st_styles))
    if class_areas:
        story.extend(_class_table(class_areas, st_styles))
    if extra_notes:
        story.append(Paragraph("Notes & Interpretation", st_styles["section"]))
        story.append(Paragraph(extra_notes, st_styles["body"]))
        story.append(Spacer(1, 0.3 * cm))
    
    if proposed_facilities and delta_stats:
        story.append(Paragraph("Scenario Planning (Proposed Facilities)", st_styles["section"]))
        scenario_text = (
            f"This analysis includes {len(proposed_facilities)} proposed facility/facilities. "
            f"Compared to the baseline, the proposed facilities resulted in the following impacts: "
        )
        impacts = []
        for k, v in delta_stats.items():
            if v > 0:
                impacts.append(f"{k} increased by {v:,.2f}")
            elif v < 0:
                impacts.append(f"{k} decreased by {abs(v):,.2f}")
            else:
                impacts.append(f"{k} remained unchanged")
                
        scenario_text += ", ".join(impacts) + "."
        story.append(Paragraph(scenario_text, st_styles["body"]))
        story.append(Spacer(1, 0.3 * cm))
    if include_action_matrix:
        story.extend(_build_action_matrix(module_name, stats, class_areas, agency_key, st_styles))

    story.extend(_provenance_table(st_styles))
    if maps:
        story.append(Spacer(1, 0.5 * cm))
        story.append(HRFlowable(width="100%", thickness=1, color=colors.lightgrey))
        story.append(Spacer(1, 0.2 * cm))
        story.append(Paragraph("Maps", st_styles["section"]))
        for item in maps:
            title = item[0]
            url = item[1]
            map_class_areas = item[2] if len(item) > 2 else class_areas
            buf = _fetch_image(url)
            if buf:
                # Enhance the raw thumbnail with cartographic elements
                try:
                    carto_buf = enhance_map_cartography(
                        buf.read(), 
                        district, 
                        title, 
                        class_areas=map_class_areas, 
                        proposed_facilities=proposed_facilities
                    )
                    story.extend(_rl_image(carto_buf, PAGE_W, title, st_styles))
                except Exception as e:
                    # Fallback to raw image if cartography fails
                    buf.seek(0)
                    story.extend(_rl_image(buf, PAGE_W/2, title, st_styles))
            else:
                story.append(Paragraph(f"[Map unavailable: {title}]", st_styles["caption"]))
        story.append(Spacer(1, 0.3 * cm))

    story.append(Spacer(1, 0.5 * cm))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.lightgrey))
    story.append(Spacer(1, 0.2 * cm))
    story.append(Paragraph(config["mandate"], st_styles["note"]))
    story.append(Paragraph(
        "This report was generated automatically by SPETRO Geoportal Analysis. "
        "All analyses are computed on-demand using Google Earth Engine satellite imagery. "
        "Results are for informational purposes and should be validated against ground-truth "
        "data before use in policy or planning decisions.",
        st_styles["note"],
    ))

    doc.build(story)
    buffer.seek(0)
    return buffer.read()


def _rl_image_from_bytes(png_bytes: bytes, width: float, caption: str, st_styles: dict) -> list:
    """Wrap already-in-memory PNG bytes (e.g. matplotlib figures) into a ReportLab flowable."""
    if not png_bytes:
        return [Paragraph(f"[Figure unavailable: {caption}]", st_styles["caption"])]
    try:
        img = RLImage(io.BytesIO(png_bytes), width=width, height=width)
        return [img, Paragraph(caption, st_styles["caption"])]
    except Exception:
        return [Paragraph(f"[Figure unavailable: {caption}]", st_styles["caption"])]


def build_uhi_report(
    district: str,
    date_range: str,
    lst_stats: dict,
    ndbi_stats: dict,
    regression: dict | None,
    bivariate_png: bytes,
    scatter_png: bytes,
    lst_thumb_url: str,
    ndbi_thumb_url: str,
    grid_size: int,
    n_cells_no_data: int,
    extra_notes: str = "",
) -> bytes:
    """
    Urban Heat Island (LST vs NDBI) PDF report with embedded raster maps and
    bivariate/regression figures.

    Layout
    ──────
    Page 1 : title · metadata · LST & NDBI statistics
    Page 2 : LST map · NDBI map (full width each)
    Page 3 : bivariate grid map · regression scatter (2-column) · regression stats
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=2 * cm, rightMargin=2 * cm,
        topMargin=2 * cm, bottomMargin=2 * cm,
    )
    st_styles = _styles()
    story = []

    story.append(Paragraph("SPETRO GEOPORTAL ANALYSIS", st_styles["title"]))
    story.append(Paragraph("Urban Heat Island — LST vs Impervious Surface (NDBI)", st_styles["subtitle"]))
    story.append(HRFlowable(width="100%", thickness=2, color=GREEN, spaceAfter=10))
    story.append(_meta_table(district, date_range))
    story.append(Spacer(1, 0.4 * cm))

    story.append(Paragraph("Land Surface Temperature — Statistics", st_styles["section"]))
    story.append(_stats_table(lst_stats, st_styles)[1])
    story.append(Spacer(1, 0.3 * cm))
    story.append(Paragraph("NDBI (Impervious Surface Proxy) — Statistics", st_styles["section"]))
    story.append(_stats_table(ndbi_stats, st_styles)[1])
    story.append(Spacer(1, 0.4 * cm))

    if extra_notes:
        story.append(Paragraph("Methodology & Notes", st_styles["section"]))
        story.append(Paragraph(extra_notes, st_styles["body"]))
        story.append(Spacer(1, 0.3 * cm))

    story.append(Paragraph("Land Surface Temperature Map", st_styles["section"]))
    lst_buf = _fetch_image(lst_thumb_url)
    if lst_buf:
        try:
            story.append(RLImage(lst_buf, width=PAGE_W, height=PAGE_W * 0.75))
        except Exception:
            pass
    story.append(Paragraph(f"LST (°C) — {district}, {date_range}.", st_styles["caption"]))
    story.append(Spacer(1, 0.4 * cm))

    story.append(Paragraph("Impervious Surface Map (NDBI)", st_styles["section"]))
    ndbi_buf = _fetch_image(ndbi_thumb_url)
    if ndbi_buf:
        try:
            story.append(RLImage(ndbi_buf, width=PAGE_W, height=PAGE_W * 0.75))
        except Exception:
            pass
    story.append(Paragraph(f"NDBI — {district}, {date_range}.", st_styles["caption"]))
    story.append(Spacer(1, 0.4 * cm))

    story.append(Paragraph("Bivariate Classification & Regression", st_styles["section"]))
    story.append(Paragraph(
        f"Zonal means computed over a {grid_size}×{grid_size} grid clipped to the district boundary "
        f"({n_cells_no_data} cell(s) outside the imagery footprint, shown hatched below).",
        st_styles["body"],
    ))
    story.append(Spacer(1, 0.2 * cm))

    col_w = (PAGE_W - 0.5 * cm) / 2
    left_cell = _rl_image_from_bytes(bivariate_png, col_w, "LST × NDBI bivariate classification per grid cell.", st_styles)
    right_cell = _rl_image_from_bytes(scatter_png, col_w, "OLS regression of LST on NDBI.", st_styles)
    row_table = Table([[left_cell, right_cell]], colWidths=[col_w, col_w])
    row_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
    ]))
    story.append(KeepTogether(row_table))
    story.append(Spacer(1, 0.4 * cm))

    if regression:
        reg_data = [
            ["Metric", "Value"],
            ["Slope", str(regression.get("slope"))],
            ["Intercept", str(regression.get("intercept"))],
            ["R²", str(regression.get("r2"))],
            ["p-value", f"{regression.get('p_value'):.4g}" if regression.get("p_value") is not None else "—"],
            ["n (grid cells)", str(regression.get("n"))],
        ]
        reg_table = Table(reg_data, colWidths=[8 * cm, 8 * cm])
        reg_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), GREEN),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [LIGHT_GRAY, colors.white]),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.lightgrey),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ]))
        story.append(Paragraph("Regression Statistics", st_styles["section"]))
        story.append(reg_table)
        story.append(Spacer(1, 0.3 * cm))

    story.append(Spacer(1, 0.3 * cm))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.lightgrey))
    story.append(Spacer(1, 0.2 * cm))
    story.append(Paragraph(
        "This report was generated automatically by SPETRO Geoportal Analysis. "
        "All analyses are computed on-demand using Google Earth Engine satellite imagery. "
        "Results are for informational purposes and should be validated against ground-truth "
        "data before use in policy or planning decisions.",
        st_styles["note"],
    ))

    doc.build(story)
    buffer.seek(0)
    return buffer.read()


def build_rusle_report(
    district: str,
    year: int,
    stats: dict,
    class_areas: dict,
    factor_maps: dict,
    factor_means: dict,
    extra_notes: str = "",
) -> bytes:
    """
    RUSLE-specific PDF report with embedded factor maps.

    Layout
    ──────
    Page 1 : title · metadata · statistics · erosion class table
    Page 2 : methodology notes · final soil loss map (full width)
    Page 3+: factor maps in 2-column grid (R, K, LS, C, P) with captions
    """
    buffer = io.BytesIO()
    doc    = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2*cm, bottomMargin=2*cm,
    )
    st_styles = _styles()
    story     = []

    # ── Cover ──────────────────────────────────────────────────────────────────
    story.append(Paragraph("SPETRO GEOPORTAL ANALYSIS", st_styles["title"]))
    story.append(Paragraph("RUSLE — Soil Erosion Risk Analysis Report", st_styles["subtitle"]))
    story.append(HRFlowable(width="100%", thickness=2, color=GREEN, spaceAfter=10))
    story.append(_meta_table(district, str(year)))
    story.append(Spacer(1, 0.4 * cm))

    # ── Statistics ─────────────────────────────────────────────────────────────
    story.extend(_stats_table(stats, st_styles))

    # ── Classification table ───────────────────────────────────────────────────
    if class_areas:
        story.extend(_class_table(class_areas, st_styles))

    # ── Factor means table ────────────────────────────────────────────────────
    story.append(Paragraph("RUSLE Factor Spatial Means", st_styles["section"]))
    fm_data = [["Factor", "Spatial Mean (district)", "Nyagisozi study ref."]]
    study_refs = {"R": "981.12", "K": "0.0347", "LS": "51.02", "C": "0.178", "P": "0.367"}
    for key in ["R", "K", "LS", "C", "P"]:
        label_match = next((k for k in factor_means if k.startswith(key)), None)
        val  = factor_means.get(label_match, 0) if label_match else 0
        meta = factor_maps.get(key, {})
        fm_data.append([
            f"{key} — {meta.get('label', key).split('—')[-1].strip()}",
            str(val),
            study_refs.get(key, "—"),
        ])
    fm_table = Table(fm_data, colWidths=[8*cm, 4*cm, 4*cm])
    fm_table.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, 0), GREEN),
        ("TEXTCOLOR",    (0, 0), (-1, 0), colors.white),
        ("FONTNAME",     (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",     (0, 0), (-1, -1), 9),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [LIGHT_GRAY, colors.white]),
        ("GRID",         (0, 0), (-1, -1), 0.5, colors.lightgrey),
        ("TOPPADDING",   (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 4),
        ("LEFTPADDING",  (0, 0), (-1, -1), 8),
    ]))
    story.append(fm_table)
    story.append(Spacer(1, 0.4 * cm))

    # ── Methodology notes ──────────────────────────────────────────────────────
    if extra_notes:
        story.append(Paragraph("Methodology & Notes", st_styles["section"]))
        story.append(Paragraph(extra_notes, st_styles["body"]))
        story.append(Spacer(1, 0.3 * cm))

    # ── Final Soil Loss Map (full width) ──────────────────────────────────────
    story.append(Paragraph("Final Soil Loss Map  (A = R × K × LS × C × P)", st_styles["section"]))
    a_meta = factor_maps.get("A", {})
    a_buf  = _fetch_image(a_meta.get("thumb_url", ""))
    if a_buf:
        try:
            img = RLImage(a_buf, width=PAGE_W, height=PAGE_W * 0.65)
            story.append(img)
        except Exception:
            pass
    story.append(Paragraph(
        f"Annual soil loss (t·ha⁻¹·yr⁻¹) — {district} district, {year}. "
        "Colour scale: green = very low (<10) → red = extreme (>200 t/ha/yr).",
        st_styles["caption"],
    ))
    story.append(Spacer(1, 0.4 * cm))

    # ── Factor Maps (2-column grid) ────────────────────────────────────────────
    story.append(Paragraph("Individual RUSLE Factor Maps", st_styles["section"]))
    factor_order = ["R", "K", "LS", "C", "P"]
    col_w   = (PAGE_W - 0.5 * cm) / 2      # two columns with small gap
    img_h   = col_w * 0.85

    for i in range(0, len(factor_order), 2):
        pair = factor_order[i:i+2]
        cells = []
        for key in pair:
            meta = factor_maps.get(key, {})
            buf  = _fetch_image(meta.get("thumb_url", ""))
            cell_story = []
            if buf:
                try:
                    cell_story.append(RLImage(buf, width=col_w, height=img_h))
                except Exception:
                    pass
            cell_story.append(Paragraph(
                f"<b>{meta.get('label', key)}</b><br/>"
                f"{meta.get('description', '')}",
                st_styles["caption"],
            ))
            cells.append(cell_story)

        # pad to 2 columns if odd number
        while len(cells) < 2:
            cells.append([Spacer(1, 1)])

        row_table = Table([cells], colWidths=[col_w, col_w], spaceBefore=6)
        row_table.setStyle(TableStyle([
            ("VALIGN",  (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING",  (0, 0), (-1, -1), 2),
            ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ]))
        story.append(KeepTogether(row_table))
        story.append(Spacer(1, 0.3 * cm))

    # ── Disclaimer ─────────────────────────────────────────────────────────────
    story.append(Spacer(1, 0.5 * cm))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.lightgrey))
    story.append(Spacer(1, 0.2 * cm))
    story.append(Paragraph(
        "This report was generated automatically by SPETRO Geoportal Analysis. "
        "All analyses are computed on-demand using Google Earth Engine satellite imagery. "
        "Results are for informational purposes and should be validated against ground-truth "
        "data before use in policy or planning decisions.",
        st_styles["note"],
    ))

    doc.build(story)
    buffer.seek(0)
    return buffer.read()
