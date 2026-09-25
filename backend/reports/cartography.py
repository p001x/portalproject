import io
import hashlib
import functools
import numpy as np
import matplotlib
matplotlib.use('Agg')  # Required for server-side rendering without a GUI
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib_scalebar.scalebar import ScaleBar
import PIL.Image

# ── Colour helpers ────────────────────────────────────────────────────────────

def hex_to_rgb(h: str) -> tuple:
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))


@functools.lru_cache(maxsize=32)
def _build_gradient(hex_tuple: tuple, n_steps: int = 256) -> np.ndarray:
    """Build a gradient array; cached so identical palettes are free."""
    import matplotlib.colors as mcolors
    cmap = mcolors.LinearSegmentedColormap.from_list("custom", list(hex_tuple))
    return (cmap(np.linspace(0, 1, n_steps))[:, :3] * 255).astype(np.float32)


def recolor_continuous(img_array: np.ndarray,
                       orig_hexes: list[str],
                       new_hexes: list[str]) -> np.ndarray:
    if tuple(orig_hexes) == tuple(new_hexes):
        return img_array

    orig_grad = _build_gradient(tuple(orig_hexes))
    new_grad  = _build_gradient(tuple(new_hexes))
    out    = img_array.copy()
    pixels = out[..., :3].astype(np.float32)

    A_sq = np.sum(pixels ** 2, axis=-1, keepdims=True)
    B_sq = np.sum(orig_grad ** 2, axis=-1)
    AB   = np.dot(pixels, orig_grad.T)
    dist_sq = A_sq + B_sq - 2 * AB
    
    closest_idx = np.argmin(dist_sq, axis=-1)
    min_dist_sq = np.min(dist_sq, axis=-1)
    
    # Only recolor pixels that are reasonably close to the original gradient
    # Threshold of 1000 allows for some compression artifacts but protects water (#08306b) etc.
    mask = min_dist_sq < 1000
    out[mask, :3] = new_grad[closest_idx[mask]].astype(np.uint8)
    return out


def recolor_image(img_array: np.ndarray,
                  original_hexes: list[str],
                  new_hexes: list[str]) -> np.ndarray:
    if len(original_hexes) != len(new_hexes):
        return img_array
    out = img_array.copy()
    for o_hex, n_hex in zip(original_hexes, new_hexes):
        o_rgb = np.array(hex_to_rgb(o_hex))
        n_rgb = np.array(hex_to_rgb(n_hex))
        dist  = np.linalg.norm(out[..., :3].astype(np.float32) - o_rgb, axis=-1)
        out[dist < 20, :3] = n_rgb
    return out


# ── Cartographic elements ─────────────────────────────────────────────────────

def get_lon_formatter(span: float):
    def format_lon(x, pos):
        val = abs(x)
        deg = int(val)
        rem = (val - deg) * 60
        minutes = int(rem)
        seconds = int(round((rem - minutes) * 60))
        if seconds == 60:
            minutes += 1
            seconds = 0
        if minutes == 60:
            deg += 1
            minutes = 0
        dir_str = "E" if x >= 0 else "W"
        if span < 0.08:
            return f"{deg}°{minutes:02d}'{seconds:02d}\"{dir_str}"
        return f"{deg}°{minutes:02d}'{dir_str}"
    return format_lon


def get_lat_formatter(span: float):
    def format_lat(y, pos):
        val = abs(y)
        deg = int(val)
        rem = (val - deg) * 60
        minutes = int(rem)
        seconds = int(round((rem - minutes) * 60))
        if seconds == 60:
            minutes += 1
            seconds = 0
        if minutes == 60:
            deg += 1
            minutes = 0
        dir_str = "N" if y >= 0 else "S"
        if span < 0.08:
            return f"{deg}°{minutes:02d}'{seconds:02d}\"{dir_str}"
        return f"{deg}°{minutes:02d}'{dir_str}"
    return format_lat


def add_north_arrow(ax, position: str = 'top right'):
    """Draw a classic publication-grade dual-facet (black/white) cartographic North Arrow."""
    pos_dict = {
        'top right': (0.93, 0.88),
        'top left': (0.07, 0.88),
        'bottom right': (0.93, 0.15),
        'bottom left': (0.07, 0.15),
    }
    cx, cy = pos_dict.get(position, (0.93, 0.88))

    # Semi-transparent backing shield for 100% legibility on any terrain
    badge = mpatches.FancyBboxPatch(
        (cx - 0.042, cy - 0.085), 0.084, 0.165,
        boxstyle="round,pad=0.01,rounding_size=0.02",
        transform=ax.transAxes,
        facecolor='white', edgecolor='#cbd5e1', linewidth=0.8,
        alpha=0.92, zorder=10
    )
    ax.add_patch(badge)

    # 'N' label
    ax.text(cx, cy + 0.052, 'N', transform=ax.transAxes,
            fontsize=10.5, fontweight='bold', fontfamily='sans-serif',
            ha='center', va='center', color='#0f172a', zorder=13)

    # Dual-tone cartographic needle
    w, h = 0.024, 0.055
    left_pts = [
        [cx, cy + h],            # Tip
        [cx - w, cy - h * 0.7],  # Left wing
        [cx, cy - h * 0.25],     # Inner center
    ]
    left_poly = mpatches.Polygon(left_pts, transform=ax.transAxes,
                                facecolor='#0f172a', edgecolor='#0f172a', linewidth=0.7, zorder=12)
    ax.add_patch(left_poly)

    right_pts = [
        [cx, cy + h],            # Tip
        [cx + w, cy - h * 0.7],  # Right wing
        [cx, cy - h * 0.25],     # Inner center
    ]
    right_poly = mpatches.Polygon(right_pts, transform=ax.transAxes,
                                 facecolor='#f8fafc', edgecolor='#0f172a', linewidth=0.7, zorder=12)
    ax.add_patch(right_poly)


def add_scalebar(ax, y_center: float, position: str = 'lower left'):
    """Add a scientifically accurate scale bar calibrated to horizontal meters at given latitude."""
    dx_meters = 111320.0 * np.cos(np.radians(y_center)) if abs(y_center) < 89 else 111320.0
    loc_str = position if position in ('lower left', 'lower right', 'upper left', 'upper right', 'lower center') else 'lower left'
    scalebar = ScaleBar(
        dx_meters, 'm', length_fraction=0.22,
        location=loc_str,
        rotation='horizontal-only',
        font_properties={'size': 8, 'weight': 'bold'},
        box_alpha=0.9, box_color='white', border_pad=0.4, color='#0f172a'
    )
    ax.add_artist(scalebar)


# Known continuous palettes for title-based lookup
_KNOWN_PALETTES: dict[str, list[str]] = {
    "A — Annual Soil Loss":        ["#1a9641", "#a6d96a", "#ffffbf", "#fdae61", "#d7191c"],
    "R — Rainfall Erosivity":      ["#ffffcc", "#a1dab4", "#41b6c4", "#2c7fb8", "#253494"],
    "K — Soil Erodibility":        ["#ffffe5", "#fff7bc", "#fee391", "#fec44f", "#fe9929",
                                    "#ec7014", "#cc4c02", "#8c2d04"],
    "LS — Topographic Factor":     ["#f7fcf5", "#e5f5e0", "#c7e9c0", "#a1d99b", "#74c476",
                                    "#41ab5d", "#238b45", "#005a32"],
    "C — Cover Management":        ["#005a32", "#238b45", "#74c476", "#c7e9c0", "#fee391",
                                    "#fec44f", "#fe9929", "#ec7014", "#8c2d04"],
    "P — Support Practice":        ["#1a9641", "#a6d96a", "#ffffbf", "#fdae61", "#d7191c"],
    "Aspect":                      ["#d7191c", "#fdae61", "#ffffbf", "#abdda4", "#2b83ba", "#d7191c"],
    "Flood_Susceptibility":        ["#1a9850", "#91cf60", "#fee08b", "#fc8d59", "#d73027"],
    "Habitat Suitability":         ["#d7191c", "#fdae61", "#ffffbf", "#a6d96a", "#1a9641"],
    "Crane Habitat Suitability":   ["#d7191c", "#fdae61", "#ffffbf", "#a6d96a", "#1a9641"],
}


# ── Main public function ──────────────────────────────────────────────────────

import json

@functools.lru_cache(maxsize=32)
def _cached_cartography(
    png_bytes: bytes,
    aoi_name: str,
    title: str,
    bbox_json: str,
    class_areas_json: str,
    override_palette_json: str,
    show_frame: bool,
    show_grid: bool,
    show_legend: bool,
    show_scale: bool,
    show_compass: bool,
    show_title: bool,
    size_multiplier: float,
    legend_pos: str,
    scale_pos: str,
    north_arrow_pos: str,
    output_format: str,
    proposed_facilities_json: str,
) -> bytes:
    bbox = json.loads(bbox_json) if bbox_json else None
    proposed_facilities = json.loads(proposed_facilities_json) if proposed_facilities_json else None
    class_areas = json.loads(class_areas_json) if class_areas_json else None
    override_palette = json.loads(override_palette_json) if override_palette_json else None

    # 1. Load image
    img       = PIL.Image.open(io.BytesIO(png_bytes)).convert("RGBA")
    img_array = np.array(img)

    is_categorical = bool(class_areas)
    orig_pal: list[str] | None = None

    # 2. Palette resolution
    orig_pal = _KNOWN_PALETTES.get(title)
    if orig_pal is None:
        title_lower = title.lower()
        if "flood" in title_lower:
            orig_pal = _KNOWN_PALETTES["Flood_Susceptibility"]
        elif "lst" in title_lower or "temperature" in title_lower or "heat" in title_lower:
            if is_categorical and len(class_areas) == 6:
                orig_pal = ["#08306b", "#313695", "#74add1", "#fee090", "#f46d43", "#a50026"]
            else:
                orig_pal = ["#313695", "#74add1", "#fee090", "#f46d43", "#a50026"]
        elif "ndvi" in title_lower or "vegetation" in title_lower:
            if is_categorical and len(class_areas) == 5:
                orig_pal = ["#d73027", "#fc8d59", "#fee08b", "#91cf60", "#1a9850"]
            else:
                orig_pal = ["#4575b4", "#d73027", "#fc8d59", "#fee08b", "#91cf60", "#1a9850"]
        elif "dvi" in title_lower or "drought" in title_lower:
            orig_pal = ["#1a9850", "#d9ef8b", "#fee08b", "#f46d43", "#a50026"]
        elif "no2" in title_lower or "air quality" in title_lower:
            orig_pal = ["#000004", "#3b0f70", "#8c2981", "#de4968", "#fe9f6d", "#fcfdbf"]
        elif "change" in title_lower:
            if "ndbi" in title_lower:
                orig_pal = ["#2166ac", "#67a9cf", "#f7f7f7", "#f4a582", "#b2182b"]
            elif "ndwi" in title_lower:
                orig_pal = ["#8c510a", "#d8b365", "#f5f5f5", "#80cdc1", "#01665e"]
            elif "bsi" in title_lower:
                orig_pal = ["#1a9850", "#91cf60", "#ffffbf", "#fee08b", "#d73027"]
            else:
                orig_pal = ["#d73027", "#f46d43", "#fee08b", "#d9ef8b", "#1a9850"]
        elif "precipitation" in title_lower or "rain" in title_lower:
            orig_pal = ["#f7fbff", "#c6dbef", "#6baed6", "#2171b5", "#08306b"]
        elif "habitat" in title_lower or "suitability" in title_lower or "crane" in title_lower or "factor" in title_lower:
            orig_pal = ["#d7191c", "#fdae61", "#ffffbf", "#a6d96a", "#1a9641"]
        elif "lsi" in title_lower or "landslide" in title_lower:
            orig_pal = ["#1a9850", "#91cf60", "#fee08b", "#fc8d59", "#d73027"]
        elif "slope" in title_lower or "terrain" in title_lower:
            orig_pal = ["#1a9850", "#91cf60", "#fee08b", "#fc8d59", "#d73027"]
        elif is_categorical:
            try:
                from gee.classify_utils import class_palette
                orig_pal = class_palette(len(class_areas))
            except Exception:
                orig_pal = None
        else:
            orig_pal = ["#000000", "#ffffff"]

    # 3. Palette recolour (only when user picked a custom theme)
    if override_palette and orig_pal and len(orig_pal) > 0:
        img_array = recolor_continuous(img_array, orig_pal, override_palette)

    # 4. Extent and projection details
    extent = bbox  # [xmin, xmax, ymin, ymax]
    lon_span = abs(extent[1] - extent[0]) if extent else 1.0
    lat_span = abs(extent[3] - extent[2]) if extent else 1.0
    y_center = ((extent[2] + extent[3]) / 2.0) if extent else 0.0

    # 5. Build figure with publication aspect ratio
    fig = plt.figure(figsize=(8.2, 6.4), facecolor='white')
    ax  = fig.add_subplot(111)

    # 6. Plot image & setup graticules
    if extent:
        ax.imshow(img_array, extent=extent, aspect='auto')
        if show_frame:
            import matplotlib.ticker as ticker
            ax.xaxis.set_major_locator(ticker.MaxNLocator(nbins=5, steps=[1, 2, 5, 10]))
            ax.yaxis.set_major_locator(ticker.MaxNLocator(nbins=5, steps=[1, 2, 5, 10]))
            ax.xaxis.set_major_formatter(ticker.FuncFormatter(get_lon_formatter(lon_span)))
            ax.yaxis.set_major_formatter(ticker.FuncFormatter(get_lat_formatter(lat_span)))
            ax.tick_params(
                bottom=True, labelbottom=True,
                left=True, labelleft=True,
                top=True, labeltop=False,
                right=True, labelright=False,
                labelsize=8, colors='#1e293b', direction='out', length=4, width=0.8
            )
        else:
            ax.set_xticks([])
            ax.set_yticks([])
    else:
        ax.imshow(img_array, aspect='auto')
        ax.set_xticks([])
        ax.set_yticks([])

    if proposed_facilities and extent:
        lons = [fac[1] for fac in proposed_facilities]
        lats = [fac[0] for fac in proposed_facilities]
        ax.scatter(lons, lats, color='#a855f7', marker='^', s=120, edgecolors='#0f172a', linewidths=1.2, zorder=15, label='Proposed Facility')

    # 7. Marginalia & Titles
    if show_title and title:
        district_label = f"{aoi_name.strip()} District" if (aoi_name and not aoi_name.lower().endswith("district")) else (aoi_name or "Study Area")
        ax.set_title(f"{title.upper()}\n", fontsize=11.5, fontweight='bold', color='#0f172a', pad=12)
        fig.text(0.5, 0.94, f"{district_label} • Geographic Information System & Earth Observation Analysis",
                 fontsize=8.5, color='#475569', ha='center', fontfamily='sans-serif', fontweight='medium')

    if show_compass:
        add_north_arrow(ax, position=north_arrow_pos)

    if show_scale and extent:
        add_scalebar(ax, y_center, position=scale_pos)

    if show_grid:
        ax.grid(True, linestyle=':', alpha=0.45, color='#64748b', linewidth=0.75, zorder=5)

    for spine in ax.spines.values():
        spine.set_edgecolor('#0f172a')
        spine.set_linewidth(1.3)
        if not show_frame:
            spine.set_visible(False)

    # 8. Legend Generation
    if is_categorical and show_legend:
        final_pal = override_palette if override_palette else orig_pal
        patches = []
        total_area = sum(v for v in class_areas.values() if isinstance(v, (int, float)) and v > 0)

        for i, (cls_name, val) in enumerate(class_areas.items()):
            color = (final_pal[i] if final_pal and i < len(final_pal) else "#cccccc")
            clean_name = str(cls_name)
            if isinstance(val, (int, float)) and val > 0 and total_area > 0:
                pct = (val / total_area) * 100
                lbl = f"{clean_name} ({val:,.1f} km² • {pct:.1f}%)"
            else:
                lbl = clean_name

            patches.append(mpatches.Patch(
                facecolor=color, edgecolor='#475569', linewidth=0.6, label=lbl))

        if proposed_facilities:
            import matplotlib.lines as mlines
            patches.append(mlines.Line2D([0], [0], marker='^', color='w', markerfacecolor='#a855f7', markersize=9, markeredgecolor='#0f172a', label='Proposed Facility'))

        legend_title = title.strip()
        if legend_title.upper().endswith(" MAP"):
            legend_title = legend_title[:-4].strip()

        norm_pos = legend_pos.lower().strip()
        if norm_pos in ('outside right', 'center left', 'right'):
            leg = ax.legend(
                handles=patches, loc='center left', bbox_to_anchor=(1.02, 0.5),
                title=legend_title, title_fontsize=9, fontsize=8,
                frameon=True, facecolor='#f8fafc', edgecolor='#cbd5e1', framealpha=0.96,
                fancybox=True, handleheight=1.2, handlelength=1.3, borderpad=0.7, labelspacing=0.5
            )
            leg.get_title().set_fontweight('bold')
        elif norm_pos in ('lower center', 'bottom'):
            leg = ax.legend(
                handles=patches, loc='upper center', bbox_to_anchor=(0.5, -0.09),
                title=legend_title, title_fontsize=9, fontsize=8, ncol=min(3, len(class_areas)),
                frameon=True, facecolor='#f8fafc', edgecolor='#cbd5e1', framealpha=0.96,
                fancybox=True, handleheight=1.2, handlelength=1.3, borderpad=0.6
            )
            leg.get_title().set_fontweight('bold')
        else:
            leg = ax.legend(
                handles=patches, loc=legend_pos,
                title=legend_title, title_fontsize=9, fontsize=8,
                frameon=True, facecolor='white', edgecolor='#cbd5e1', framealpha=0.94,
                fancybox=True, handleheight=1.2, handlelength=1.3, borderpad=0.6, labelspacing=0.5
            )
            leg.get_title().set_fontweight('bold')

    elif not is_categorical and show_legend:
        final_pal = override_palette if override_palette else orig_pal
        if final_pal:
            import matplotlib as mpl
            cmap = mpl.colors.LinearSegmentedColormap.from_list("custom_cmap", final_pal)
            norm = mpl.colors.Normalize(vmin=0, vmax=1)
            sm = mpl.cm.ScalarMappable(norm=norm, cmap=cmap)
            sm.set_array([])

            legend_title = title.strip()
            if legend_title.upper().endswith(" MAP"):
                legend_title = legend_title[:-4].strip()

            norm_pos = legend_pos.lower().strip()
            if norm_pos in ('lower center', 'bottom'):
                cax = ax.inset_axes([0.15, -0.14, 0.7, 0.035])
                cb = fig.colorbar(sm, cax=cax, orientation='horizontal')
                cb.outline.set_edgecolor('#94a3b8')
                cb.outline.set_linewidth(0.8)
                cb.set_ticks([0, 0.25, 0.5, 0.75, 1.0])
                cb.set_ticklabels(['Very Low', 'Low', 'Moderate', 'High', 'Very High'])
                cb.ax.tick_params(labelsize=7.5, color='#475569')
                cax.set_title(legend_title, fontsize=8.5, fontweight='bold', pad=5, color='#0f172a')
            else:
                cax = ax.inset_axes([1.03, 0.15, 0.035, 0.7])
                cb = fig.colorbar(sm, cax=cax, orientation='vertical')
                cb.outline.set_edgecolor('#94a3b8')
                cb.outline.set_linewidth(0.8)
                cb.set_ticks([0, 0.25, 0.5, 0.75, 1.0])
                cb.set_ticklabels(['Very Low', 'Low', 'Moderate', 'High', 'Very High'])
                cb.ax.tick_params(labelsize=7.5, color='#475569')
                cax.set_title(legend_title, fontsize=8.5, fontweight='bold', pad=8, color='#0f172a')

    # Footer attribution
    footer_text = f"Datum: WGS 84 • Coordinate System: Geographic • Engine: Antigravity Cartography • Source: Sentinel / Copernicus / GEE"
    fig.text(0.02, 0.012, footer_text, fontsize=7, color='#64748b', fontfamily='sans-serif')

    # 9. Save output with tight bounding box to prevent clipping
    out_buf = io.BytesIO()
    fmt_upper = (output_format or 'PNG').upper()
    dpi_val = int(120 * size_multiplier)

    if fmt_upper in ('JPG', 'JPEG'):
        fig.savefig(out_buf, format='jpeg', dpi=dpi_val, facecolor='white', bbox_inches='tight', pad_inches=0.15)
    elif fmt_upper in ('TIF', 'TIFF'):
        temp_buf = io.BytesIO()
        fig.savefig(temp_buf, format='png', dpi=dpi_val, facecolor='white', bbox_inches='tight', pad_inches=0.15)
        plt.close(fig)
        temp_buf.seek(0)
        img_tiff = PIL.Image.open(temp_buf)
        img_tiff.save(out_buf, format='TIFF')
        return out_buf.getvalue()
    else:
        fig.savefig(out_buf, format='png', dpi=dpi_val, facecolor='white', bbox_inches='tight', pad_inches=0.15)

    plt.close(fig)
    return out_buf.getvalue()


def enhance_map_cartography(
    png_bytes: bytes,
    aoi_name: str,
    title: str,
    bbox: list[float] = None,
    class_areas: dict = None,
    override_palette: list[str] = None,
    show_frame: bool = True,
    show_grid: bool = False,
    show_legend: bool = True,
    show_scale: bool = True,
    show_compass: bool = True,
    show_title: bool = True,
    size_multiplier: float = 1.0,
    legend_pos: str = 'center left',
    scale_pos: str = 'lower left',
    north_arrow_pos: str = 'top right',
    output_format: str = 'PNG',
    proposed_facilities: list = None,
) -> io.BytesIO:
    """
    Wrap a raw GEE thumbnail PNG into a publication-grade professional cartographic layout.
    Supports PNG, JPG, and TIF formats matching the user template style.
    """
    bbox_json = json.dumps(bbox) if bbox else ""
    class_areas_json = json.dumps(class_areas) if class_areas else ""
    override_palette_json = json.dumps(override_palette) if override_palette else ""
    proposed_facilities_json = json.dumps(proposed_facilities) if proposed_facilities else ""

    cached_bytes = _cached_cartography(
        png_bytes, aoi_name, title, bbox_json, class_areas_json, override_palette_json,
        show_frame, show_grid, show_legend, show_scale, show_compass, show_title, size_multiplier,
        legend_pos, scale_pos, north_arrow_pos, output_format, proposed_facilities_json
    )
    return io.BytesIO(cached_bytes)


