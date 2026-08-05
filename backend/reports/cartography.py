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
    orig_grad = _build_gradient(tuple(orig_hexes))
    new_grad  = _build_gradient(tuple(new_hexes))
    out    = img_array.copy()
    pixels = out[..., :3].astype(np.float32)

    A_sq = np.sum(pixels ** 2, axis=-1, keepdims=True)
    B_sq = np.sum(orig_grad ** 2, axis=-1)
    AB   = np.dot(pixels, orig_grad.T)
    closest_idx = np.argmin(A_sq + B_sq - 2 * AB, axis=-1)
    out[..., :3] = new_grad[closest_idx].astype(np.uint8)
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

def format_lon(x, pos):
    val = abs(x)
    deg = int(val)
    minutes = int(round((val - deg) * 60))
    if minutes == 60:
        deg += 1
        minutes = 0
    dir_str = "E" if x >= 0 else "W"
    return f"{deg}°{minutes:02d}'{dir_str}"


def format_lat(y, pos):
    val = abs(y)
    deg = int(val)
    minutes = int(round((val - deg) * 60))
    if minutes == 60:
        deg += 1
        minutes = 0
    dir_str = "N" if y >= 0 else "S"
    return f"{deg}°{minutes:02d}'{dir_str}"


def add_north_arrow(ax, position: str = 'top right'):
    """Draw a sharp solid black North Arrow polygon matching user template symbol."""
    pos_dict = {
        'top right': (0.91, 0.85),
        'top left': (0.09, 0.85),
        'bottom right': (0.91, 0.16),
        'bottom left': (0.09, 0.16),
    }
    cx, cy = pos_dict.get(position, (0.91, 0.85))

    # 'N' font label centered above arrow
    ax.text(cx, cy + 0.075, 'N', transform=ax.transAxes,
            fontsize=16, fontweight='bold', fontfamily='serif',
            ha='center', va='center', color='black', zorder=12)

    # Sharp solid black arrowhead polygon matching Image 1 & 2
    w, h = 0.035, 0.08
    poly_pts = [
        [cx, cy + h],            # Top sharp tip
        [cx + w, cy - h],        # Bottom right tip
        [cx, cy - h * 0.45],     # Inner bottom notch
        [cx - w, cy - h]         # Bottom left tip
    ]
    arrow_poly = mpatches.Polygon(poly_pts, transform=ax.transAxes, facecolor='black', edgecolor='black', zorder=10)
    ax.add_patch(arrow_poly)


def add_scalebar(ax, _y_center: float, position: str = 'lower left'):
    scalebar = ScaleBar(111000, 'm', length_fraction=0.25,
                        location=position,
                        font_properties={'size': 8, 'weight': 'bold'},
                        box_alpha=0.0, border_pad=0.5, color='black')
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
) -> bytes:
    bbox = json.loads(bbox_json) if bbox_json else None
    class_areas = json.loads(class_areas_json) if class_areas_json else None
    override_palette = json.loads(override_palette_json) if override_palette_json else None

    # 1. Load image
    img       = PIL.Image.open(io.BytesIO(png_bytes)).convert("RGBA")
    img_array = np.array(img)

    is_categorical = bool(class_areas)
    orig_pal: list[str] | None = None

    # 2. Palette recolour (only when the user actually picked a custom theme)
    if override_palette:
        if is_categorical:
            try:
                from gee.classify_utils import class_palette
                orig_pal = class_palette(len(class_areas))
            except Exception:
                orig_pal = None
        else:
            orig_pal = _KNOWN_PALETTES.get(title)
            if orig_pal is None:
                title_lower = title.lower()
                if "flood" in title_lower:
                    orig_pal = _KNOWN_PALETTES["Flood_Susceptibility"]
                elif "lst" in title_lower or "temperature" in title_lower or "heat" in title_lower:
                    orig_pal = ["#313695", "#74add1", "#fee090", "#f46d43", "#a50026"]
                elif "ndvi" in title_lower or "vegetation" in title_lower:
                    orig_pal = ["#d73027", "#fc8d59", "#fee08b", "#91cf60", "#1a9850"]
                elif "dvi" in title_lower or "drought" in title_lower:
                    orig_pal = ["#1a9850", "#d9ef8b", "#fee08b", "#f46d43", "#a50026"]
                elif "no2" in title_lower or "air quality" in title_lower:
                    orig_pal = ["#000004", "#3b0f70", "#8c2981", "#de4968", "#fe9f6d", "#fcfdbf"]
                elif "lsi" in title_lower or "landslide" in title_lower:
                    orig_pal = ["#1a9850", "#91cf60", "#fee08b", "#fc8d59", "#d73027"]
                elif "ndbi" in title_lower:
                    orig_pal = ["#1a9850", "#d9ef8b", "#fee08b", "#f46d43", "#a50026"]
                elif "slope" in title_lower or "terrain" in title_lower:
                    orig_pal = ["#1a9850", "#91cf60", "#fee08b", "#fc8d59", "#d73027"]
                else:
                    orig_pal = ["#000000", "#ffffff"]


        if orig_pal and len(orig_pal) > 0:
            img_array = recolor_continuous(img_array, orig_pal, override_palette)
    else:
        if is_categorical:
            try:
                from gee.classify_utils import class_palette
                orig_pal = class_palette(len(class_areas))
            except Exception:
                orig_pal = None

    # 3. Get geographic extent from static table
    extent  = bbox  # [xmin, xmax, ymin, ymax]
    y_center = ((extent[2] + extent[3]) / 2.0) if extent else 0.0

    # 4. Build figure with clean aspect ratio
    fig = plt.figure(figsize=(8, 6.5), facecolor='white')
    ax  = fig.add_subplot(111)

    # 5. Plot image & setup graticules
    if extent:
        ax.imshow(img_array, extent=extent, aspect='auto')
        if show_frame:
            import matplotlib.ticker as ticker
            ax.xaxis.set_major_formatter(ticker.FuncFormatter(format_lon))
            ax.yaxis.set_major_formatter(ticker.FuncFormatter(format_lat))
            ax.tick_params(top=True, labeltop=True, right=True, labelright=True,
                           bottom=True, labelbottom=True, left=True, labelleft=True,
                           labelsize=8, colors='#1a1a2e', direction='out', length=3.5)
        else:
            ax.set_xticks([])
            ax.set_yticks([])
    else:
        ax.imshow(img_array, aspect='auto')
        ax.set_xticks([])
        ax.set_yticks([])

    # 6. Cartographic elements
    if show_title and title:
        ax.set_title(title, fontsize=13, fontweight='bold', color='#1a1a2e', pad=12)
    if show_compass:
        add_north_arrow(ax, position=north_arrow_pos)
    if show_scale and extent:
        add_scalebar(ax, y_center, position=scale_pos)

    if show_grid:
        ax.grid(True, linestyle='--', alpha=0.4, color='gray')

    for spine in ax.spines.values():
        spine.set_edgecolor('#1a1a2e')
        spine.set_linewidth(1.2)
        if not show_frame:
            spine.set_visible(False)

    # 7. Legend (matching template: clean color blocks + uppercase labels)
    if is_categorical and show_legend:
        final_pal = override_palette if override_palette else orig_pal
        patches = []
        for i, cls_name in enumerate(class_areas.keys()):
            color = (final_pal[i] if final_pal and i < len(final_pal) else "#cccccc")
            lbl_upper = str(cls_name).upper()
            patches.append(mpatches.Patch(
                facecolor=color, edgecolor='none', label=lbl_upper))
        
        legend_title = title.upper()
        if " MAP" in legend_title:
            legend_title = legend_title.replace(" MAP", "")

        if legend_pos == 'center left':
            ax.legend(handles=patches, loc='center left', bbox_to_anchor=(1.01, 0.5),
                      title=legend_title, title_fontsize=9, fontsize=8,
                      frameon=False, handleheight=1.4, handlelength=1.4)
            fig.subplots_adjust(right=0.74)
        elif legend_pos == 'lower center':
            ax.legend(handles=patches, loc='upper center', bbox_to_anchor=(0.5, -0.1),
                      title=legend_title, title_fontsize=9, fontsize=8, ncol=min(4, len(class_areas)),
                      frameon=False, handleheight=1.4, handlelength=1.4)
            fig.subplots_adjust(bottom=0.2)
        else:
            ax.legend(handles=patches, loc=legend_pos,
                      title=legend_title, title_fontsize=9, fontsize=8,
                      frameon=True, facecolor='white', edgecolor='none', framealpha=0.9,
                      handleheight=1.4, handlelength=1.4)
            fig.subplots_adjust(right=0.96)
    elif not is_categorical and show_legend:
        final_pal = override_palette if override_palette else orig_pal
        if final_pal:
            import matplotlib as mpl
            cmap = mpl.colors.LinearSegmentedColormap.from_list("custom_cmap", final_pal)
            norm = mpl.colors.Normalize(vmin=0, vmax=1)
            sm = mpl.cm.ScalarMappable(norm=norm, cmap=cmap)
            sm.set_array([])
            
            legend_title = title.upper()
            if " MAP" in legend_title:
                legend_title = legend_title.replace(" MAP", "")

            if legend_pos == 'center left':
                cax = ax.inset_axes([1.05, 0.25, 0.04, 0.5])
                cb = fig.colorbar(sm, cax=cax, orientation='vertical')
                cb.set_ticks([0, 1])
                cb.set_ticklabels(['LOW', 'HIGH'])
                cax.set_title(legend_title, fontsize=9, pad=10)
                fig.subplots_adjust(right=0.8)
            elif legend_pos == 'lower center':
                cax = ax.inset_axes([0.25, -0.15, 0.5, 0.04])
                cb = fig.colorbar(sm, cax=cax, orientation='horizontal')
                cb.set_ticks([0, 1])
                cb.set_ticklabels(['LOW', 'HIGH'])
                cax.set_title(legend_title, fontsize=9, pad=10)
                fig.subplots_adjust(bottom=0.25)
            else:
                cax = ax.inset_axes([1.05, 0.05, 0.04, 0.4])
                cb = fig.colorbar(sm, cax=cax, orientation='vertical')
                cb.set_ticks([0, 1])
                cb.set_ticklabels(['LOW', 'HIGH'])
                cax.set_title(legend_title, fontsize=9, pad=10)
                fig.subplots_adjust(right=0.85)
        else:
            fig.subplots_adjust(right=0.96)
    else:
        fig.subplots_adjust(right=0.96)

    # 8. Save output according to requested format
    out_buf = io.BytesIO()
    fmt_upper = (output_format or 'PNG').upper()

    if fmt_upper in ('JPG', 'JPEG'):
        fig.savefig(out_buf, format='jpeg', dpi=96 * size_multiplier, facecolor='white', pad_inches=0.15)
    elif fmt_upper in ('TIF', 'TIFF'):
        temp_buf = io.BytesIO()
        fig.savefig(temp_buf, format='png', dpi=96 * size_multiplier, facecolor='white', pad_inches=0.15)
        plt.close(fig)
        temp_buf.seek(0)
        img_tiff = PIL.Image.open(temp_buf)
        img_tiff.save(out_buf, format='TIFF')
        return out_buf.getvalue()
    else:
        fig.savefig(out_buf, format='png', dpi=96 * size_multiplier, facecolor='white', pad_inches=0.15)

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
    legend_pos: str = 'lower right',
    scale_pos: str = 'lower left',
    north_arrow_pos: str = 'top right',
    output_format: str = 'PNG',
) -> io.BytesIO:
    """
    Wrap a raw GEE thumbnail PNG into a professional cartographic layout.
    Supports PNG, JPG, and TIF formats matching the user template style.
    """
    bbox_json = json.dumps(bbox) if bbox else ""
    # Use sort_keys=True for class_areas to ensure stable cache keys!
    class_areas_json = json.dumps(class_areas, sort_keys=True) if class_areas else ""
    override_palette_json = json.dumps(override_palette) if override_palette else ""

    cached_bytes = _cached_cartography(
        png_bytes, aoi_name, title, bbox_json, class_areas_json, override_palette_json,
        show_frame, show_grid, show_legend, show_scale, show_compass, show_title, size_multiplier,
        legend_pos, scale_pos, north_arrow_pos, output_format
    )
    return io.BytesIO(cached_bytes)

