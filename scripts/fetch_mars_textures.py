#!/usr/bin/env python3
"""
Fetches and stitches zoom-level 2 (2048x1024 equirectangular) NASA Mars Trek
Viking MDIM2.1 color mosaic and MGS MOLA shaded relief tiles into local bundled
textures (`public/textures/mars_albedo.jpg` and `public/textures/mars_bump.jpg`).
"""

from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path
import urllib.request

import numpy as np
from PIL import Image, ImageOps

ZOOM = 2
COLS = 8
ROWS = 4
TILE_SIZE = 256

VIKING_URL = (
    "https://trek.nasa.gov/tiles/Mars/EQ/"
    "Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg"
)
MOLA_URL = (
    "https://trek.nasa.gov/tiles/Mars/EQ/"
    "Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg"
)


def fetch_tile(args):
    url_tpl, x, y = args
    url = url_tpl.format(z=ZOOM, y=y, x=x)
    req = urllib.request.Request(url, headers={"User-Agent": "ARES-V/1.0"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = resp.read()
    img = Image.open(BytesIO(data)).convert("RGB")
    return x, y, img


def stitch_mosaic(url_tpl):
    canvas = Image.new("RGB", (COLS * TILE_SIZE, ROWS * TILE_SIZE))
    tasks = [(url_tpl, x, y) for y in range(ROWS) for x in range(COLS)]
    with ThreadPoolExecutor(max_workers=8) as pool:
        for x, y, tile in pool.map(fetch_tile, tasks):
            canvas.paste(tile, (x * TILE_SIZE, y * TILE_SIZE))
    return canvas


def mola_clrshade_to_height(mola_img):
    """
    Convert NASA MOLA ClrShade (hue-encoded elevation + shaded relief) into a
    high-contrast grayscale elevation/bump map (0 = basins, 255 = Olympus/Tharsis peaks).
    """
    arr = np.asarray(mola_img, dtype=np.float32) / 255.0
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]

    cmax = np.maximum(np.maximum(r, g), b)
    cmin = np.minimum(np.minimum(r, g), b)
    delta = cmax - cmin

    # Compute HSV Hue in degrees [0, 360)
    hue = np.zeros_like(cmax)
    nonzero = delta > 1e-5
    r_max = nonzero & (cmax == r)
    g_max = nonzero & (cmax == g)
    b_max = nonzero & (cmax == b)

    hue[r_max] = 60.0 * (((g[r_max] - b[r_max]) / delta[r_max]) % 6.0)
    hue[g_max] = 60.0 * (((b[g_max] - r[g_max]) / delta[g_max]) + 2.0)
    hue[b_max] = 60.0 * (((r[b_max] - g[b_max]) / delta[b_max]) + 4.0)

    # MOLA ClrShade wraps high peaks around magenta/pink (>300 deg) or bright white (low sat, high val)
    hue_wrapped = np.where(hue > 290.0, hue - 360.0, hue)
    # Map hue from +260 (deep blue basin -> 0.0) up to -30 (high red/magenta peak -> 1.0)
    elev_from_hue = np.clip((260.0 - hue_wrapped) / 290.0, 0.0, 1.0)

    # Bright desaturated white/cream summit pixels (Tharsis / Olympus Mons) -> ~1.0
    sat = np.where(cmax > 1e-5, delta / cmax, 0.0)
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    white_peak_mask = np.clip((1.0 - sat) * lum * 1.4, 0.0, 1.0)
    elev = np.maximum(elev_from_hue, white_peak_mask)

    # Blend shaded relief luminance detail so crater rims and canyon walls remain sharp
    relief_detail = (lum - 0.5) * 0.22
    height = np.clip(elev * 0.85 + 0.08 + relief_detail, 0.0, 1.0)

    gray = Image.fromarray((height * 255.0).astype(np.uint8), mode="L")
    return ImageOps.autocontrast(gray, cutoff=0.5)


def main():
    out_dir = Path(__file__).resolve().parent.parent / "public" / "textures"
    out_dir.mkdir(parents=True, exist_ok=True)

    print("Fetching NASA Viking MDIM2.1 color mosaic (32 tiles)...")
    albedo = stitch_mosaic(VIKING_URL)
    albedo_path = out_dir / "mars_albedo.jpg"
    albedo.save(albedo_path, format="JPEG", quality=92, optimize=True)
    print(f"Saved {albedo_path} ({albedo_path.stat().st_size} bytes)")

    print("Fetching NASA MGS MOLA ClrShade relief mosaic (32 tiles)...")
    mola = stitch_mosaic(MOLA_URL)
    bump = mola_clrshade_to_height(mola)
    bump_path = out_dir / "mars_bump.jpg"
    bump.save(bump_path, format="JPEG", quality=92, optimize=True)
    print(f"Saved {bump_path} ({bump_path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
