#!/usr/bin/env python3
"""
ARES-V HiRISE DTM & Orthophoto Asset Preparation Utility.

Crops a 1024x1024 patch around target coordinates from a NASA HiRISE DTM
(DTEEC_*.IMG / .tif) and optional orthophoto (ESP_*.JP2 / .tif), normalizes
elevation to a 16-bit grayscale heightmap PNG, exports albedo.jpg, and writes
real vertical scale metadata (meta.json) into public/terrain/{zoneId}/.

Usage:
    python scripts/prep_hirise.py \
        --dtm path/to/DTEEC_045994_1985_046060_1985_U01.IMG \
        --ortho path/to/ESP_045994_1985_RED.JP2 \
        --zone jezero \
        --size 1024
"""

import argparse
import json
from pathlib import Path


def _require_geo_libs():
    try:
        import numpy as np
        import rasterio
        from rasterio.enums import Resampling
        from rasterio.warp import transform
        from rasterio.windows import Window
    except ImportError as exc:
        raise SystemExit(
            f"[ARES-V] Missing required geospatial dependency ({exc.name}). "
            "Install with: pip install rasterio numpy"
        ) from exc
    return np, rasterio, Resampling, transform, Window


def compute_center_pixel(src, lat=None, lon=None, row=None, col=None):
    """Determine crop center (row, col) from explicit pixel coords, geographic lat/lon, or raster center."""
    _, _, _, transform, _ = _require_geo_libs()
    if row is not None and col is not None:
        return int(row), int(col)

    if lat is not None and lon is not None and src.crs is not None:
        # Convert geographic lon/lat into dataset CRS coordinates
        xs, ys = transform("EPSG:4326", src.crs, [lon], [lat])
        r, c = src.index(xs[0], ys[0])
        return int(r), int(c)

    return src.height // 2, src.width // 2


def compute_clamped_window(center_row, center_col, size, max_height, max_width):
    """Return a bounded rasterio Window of dimensions (size, size) clamped to dataset bounds."""
    _, _, _, _, Window = _require_geo_libs()
    crop_w = min(size, max_width)
    crop_h = min(size, max_height)

    col_off = max(0, min(max_width - crop_w, center_col - crop_w // 2))
    row_off = max(0, min(max_height - crop_h, center_row - crop_h // 2))

    return Window(col_off=col_off, row_off=row_off, width=crop_w, height=crop_h)


def process_dtm(dtm_path, out_dir, size, lat=None, lon=None, row=None, col=None):
    """Read HiRISE DTM, crop patch, normalize to 16-bit PNG, and return bounds + metadata."""
    np, rasterio, _, _, _ = _require_geo_libs()
    with rasterio.open(dtm_path) as src:
        c_row, c_col = compute_center_pixel(src, lat=lat, lon=lon, row=row, col=col)
        window = compute_clamped_window(c_row, c_col, size, src.height, src.width)
        elev = src.read(1, window=window).astype(np.float64)
        nodata = src.nodata
        dtm_bounds = src.window_bounds(window)
        dtm_crs = src.crs

    if nodata is not None:
        valid_mask = (elev != nodata) & np.isfinite(elev)
    else:
        # HiRISE PDS DTMs commonly use -3.4028226550889045e+38 for nodata
        valid_mask = np.isfinite(elev) & (np.abs(elev) < 1e20)

    if not np.any(valid_mask):
        raise ValueError("Selected DTM crop window contains no valid elevation pixels.")

    min_elev = float(np.min(elev[valid_mask]))
    max_elev = float(np.max(elev[valid_mask]))
    elev_scale = max(0.01, max_elev - min_elev)

    # Fill nodata pixels with minimum valid elevation before normalizing
    clean_elev = np.where(valid_mask, elev, min_elev)
    norm = np.clip((clean_elev - min_elev) / elev_scale, 0.0, 1.0)
    height_u16 = np.round(norm * 65535.0).astype(np.uint16)

    out_png = out_dir / "heightmap.png"
    with rasterio.open(
        out_png,
        "w",
        driver="PNG",
        height=height_u16.shape[0],
        width=height_u16.shape[1],
        count=1,
        dtype="uint16",
    ) as dst:
        dst.write(height_u16, 1)

    meta = {
        "elevationScaleMeters": round(elev_scale, 3),
        "minElevationMeters": round(min_elev, 3),
        "maxElevationMeters": round(max_elev, 3),
        "cropSize": int(height_u16.shape[0]),
    }

    meta_path = out_dir / "meta.json"
    meta_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")

    return meta, dtm_bounds, dtm_crs, height_u16.shape


def process_ortho(ortho_path, out_dir, target_shape, dtm_bounds, dtm_crs):
    """Crop/resample HiRISE orthophoto aligned to DTM bounds and save as 8-bit albedo.jpg."""
    np, rasterio, Resampling, _, _ = _require_geo_libs()
    target_h, target_w = target_shape

    with rasterio.open(ortho_path) as src:
        # Derive window from DTM bounds when CRS matches; otherwise crop centered patch
        if src.crs is not None and dtm_crs is not None and src.crs == dtm_crs:
            window = src.window(*dtm_bounds)
        else:
            c_row, c_col = src.height // 2, src.width // 2
            window = compute_clamped_window(c_row, c_col, max(target_h, target_w), src.height, src.width)

        band_count = min(3, src.count)
        data = src.read(
            list(range(1, band_count + 1)),
            window=window,
            out_shape=(band_count, target_h, target_w),
            resampling=Resampling.bilinear,
        ).astype(np.float64)

        nodata = src.nodata

    # Contrast-stretch percentile (1% - 99%) to 8-bit JPEG
    out_bands = []
    for b in range(band_count):
        arr = data[b]
        valid = np.isfinite(arr)
        if nodata is not None:
            valid &= arr != nodata
        if np.any(valid):
            lo, hi = np.percentile(arr[valid], (1.0, 99.0))
            span = max(1e-6, hi - lo)
            scaled = np.clip((arr - lo) / span, 0.0, 1.0) * 255.0
        else:
            scaled = np.zeros_like(arr)
        out_bands.append(scaled.astype(np.uint8))

    rgb = np.stack(out_bands, axis=0)
    out_jpg = out_dir / "albedo.jpg"
    with rasterio.open(
        out_jpg,
        "w",
        driver="JPEG",
        height=target_h,
        width=target_w,
        count=band_count,
        dtype="uint8",
        quality=90,
    ) as dst:
        dst.write(rgb)


def main():
    parser = argparse.ArgumentParser(
        description="Crop NASA HiRISE DTM & orthophoto assets into ARES-V terrain patches."
    )
    parser.add_argument("--dtm", required=True, help="Path to HiRISE DTM GeoTIFF or PDS .IMG file")
    parser.add_argument("--ortho", default=None, help="Optional path to HiRISE orthophoto (.JP2 / .tif)")
    parser.add_argument(
        "--zone",
        required=True,
        choices=["jezero", "gale", "arcadia"],
        help="Target ARES-V landing zone ID",
    )
    parser.add_argument("--lat", type=float, default=None, help="Target center latitude (deg)")
    parser.add_argument("--lon", type=float, default=None, help="Target center longitude (deg)")
    parser.add_argument("--row", type=int, default=None, help="Explicit center pixel row")
    parser.add_argument("--col", type=int, default=None, help="Explicit center pixel column")
    parser.add_argument("--size", type=int, default=1024, help="Square crop size in pixels (default: 1024)")
    parser.add_argument(
        "--out-dir",
        default="public/terrain",
        help="Base output directory (default: public/terrain)",
    )

    args = parser.parse_args()
    zone_dir = Path(args.out_dir) / args.zone
    zone_dir.mkdir(parents=True, exist_ok=True)

    meta, dtm_bounds, dtm_crs, shape = process_dtm(
        args.dtm,
        zone_dir,
        size=args.size,
        lat=args.lat,
        lon=args.lon,
        row=args.row,
        col=args.col,
    )
    print(f"[ARES-V] Wrote {zone_dir / 'heightmap.png'} & meta.json: {meta}")

    if args.ortho:
        process_ortho(args.ortho, zone_dir, shape, dtm_bounds, dtm_crs)
        print(f"[ARES-V] Wrote {zone_dir / 'albedo.jpg'}")


if __name__ == "__main__":
    main()
