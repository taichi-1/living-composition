"""
Extract Mondrian composition data from painting images.

Pipeline:
1. Load image, resize to working size
2. Detect painting region (remove frame/wall)
3. Detect black lines via dark pixel projection
4. Build grid and classify cell colors
5. Output composition JSON
"""

import cv2
import numpy as np
import json
import sys
import os
import argparse
import requests


PALETTE_HEX = {
    "cream":  "#F2EDE3",
    "red":    "#CC2A1E",
    "yellow": "#F5C621",
    "blue":   "#1B3D8C",
    "black":  "#1A1A1A",
    "gray":   "#8C8C8C",
}

WORK_SIZE = 1000  # resize longest edge to this


def load_image(source):
    """Load image from URL or file path."""
    if source.startswith("http"):
        headers = {
            "User-Agent": "LivingComposition/1.0 (https://github.com; art research)",
        }
        resp = requests.get(source, headers=headers, timeout=30)
        resp.raise_for_status()
        arr = np.frombuffer(resp.content, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    else:
        img = cv2.imread(source)
    if img is None:
        raise ValueError(f"Could not load image: {source}")

    # Resize to working size
    h, w = img.shape[:2]
    scale = WORK_SIZE / max(h, w)
    if scale < 1:
        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    return img


def find_painting_rect(img, debug=False):
    """Find the painting rectangle within the image (exclude frame/wall)."""
    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # The painting area has relatively uniform brightness/color compared to frame
    # Strategy: find the largest axis-aligned rectangle with consistent content

    # Edge detection
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    edges = cv2.Canny(blurred, 50, 150)

    # Dilate to connect edge segments
    kernel = np.ones((3, 3), np.uint8)
    edges = cv2.dilate(edges, kernel, iterations=1)

    # Find contours
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if contours:
        # Find largest contour
        largest = max(contours, key=cv2.contourArea)
        if cv2.contourArea(largest) > 0.2 * h * w:
            x, y, cw, ch = cv2.boundingRect(largest)
            # Inset slightly to remove border pixels
            m = 3
            x, y, cw, ch = x + m, y + m, cw - 2*m, ch - 2*m
            if cw > 50 and ch > 50:
                if debug:
                    print(f"  Detected painting rect: ({x},{y}) {cw}x{ch}")
                return img[y:y+ch, x:x+cw]

    # Fallback: scan from edges to find where content starts
    # Look for first significant color change from edge
    return _scan_crop(img, gray)


def _scan_crop(img, gray):
    """Fallback: scan from edges to find painting bounds."""
    h, w = img.shape[:2]

    # For each edge, find where the painting content begins
    # by looking for a consistent strip of non-background pixels

    def find_edge(vals, from_end=False):
        """Find where a 1D profile transitions to painting content."""
        if from_end:
            vals = vals[::-1]
        # Look for stable region (low variance in sliding window)
        win = max(5, len(vals) // 20)
        for i in range(0, len(vals) - win, 2):
            chunk = vals[i:i+win]
            if np.std(chunk) > 30:  # Found interesting content
                result = max(0, i - 2)
                return len(vals) - result if from_end else result
        return 0 if not from_end else len(vals)

    # Sample multiple scan lines and take the median
    left_edges, right_edges, top_edges, bot_edges = [], [], [], []
    for frac in [0.2, 0.4, 0.6, 0.8]:
        row = int(frac * h)
        left_edges.append(find_edge(gray[row, :]))
        right_edges.append(find_edge(gray[row, :], from_end=True))
        col = int(frac * w)
        top_edges.append(find_edge(gray[:, col]))
        bot_edges.append(find_edge(gray[:, col], from_end=True))

    x1 = int(np.median(left_edges))
    x2 = int(np.median(right_edges))
    y1 = int(np.median(top_edges))
    y2 = int(np.median(bot_edges))

    if x2 - x1 > 50 and y2 - y1 > 50:
        return img[y1:y2, x1:x2]
    return img


def get_dark_mask(img, threshold=60):
    """Get mask of dark (line) pixels. No saturation filter — photos have color bleed."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    _, mask = cv2.threshold(gray, threshold, 255, cv2.THRESH_BINARY_INV)
    return mask


def detect_lines(img, debug=False):
    """Detect vertical and horizontal lines using projection profiles."""
    h, w = img.shape[:2]
    dark = get_dark_mask(img, threshold=60)

    # Clean up noise with small morphological opening
    kernel = np.ones((3, 3), np.uint8)
    dark = cv2.morphologyEx(dark, cv2.MORPH_OPEN, kernel)

    # === Vertical lines ===
    # Project columns: count dark pixels per column
    v_proj = np.sum(dark > 0, axis=0).astype(float)
    # A vertical line should have darkness spanning a good chunk of height
    v_threshold = h * 0.2
    v_positions = _extract_peaks(v_proj, v_threshold, min_gap=w * 0.03)

    # === Horizontal lines ===
    h_proj = np.sum(dark > 0, axis=1).astype(float)
    h_threshold = w * 0.2
    h_positions = _extract_peaks(h_proj, h_threshold, min_gap=h * 0.03)

    # Determine extent (from, to) for each line
    vertical = []
    for pos in v_positions:
        fr, to = _line_extent_v(dark, pos, h, w)
        vertical.append({
            "pos": round(pos / w, 4),
            "from": round(fr / h, 4),
            "to": round(to / h, 4),
        })

    horizontal = []
    for pos in h_positions:
        fr, to = _line_extent_h(dark, pos, h, w)
        horizontal.append({
            "pos": round(pos / h, 4),
            "from": round(fr / w, 4),
            "to": round(to / w, 4),
        })

    if debug:
        dbg = img.copy()
        for l in vertical:
            x = int(l["pos"] * w)
            cv2.line(dbg, (x, int(l["from"]*h)), (x, int(l["to"]*h)), (0, 255, 0), 2)
        for l in horizontal:
            y = int(l["pos"] * h)
            cv2.line(dbg, (int(l["from"]*w), y), (int(l["to"]*w), y), (0, 0, 255), 2)
        cv2.imwrite("debug_lines.png", dbg)
        cv2.imwrite("debug_dark.png", dark)
        print(f"  Debug images saved: debug_lines.png, debug_dark.png")

    return vertical, horizontal


def _extract_peaks(profile, threshold, min_gap=10):
    """Find peak positions in a 1D profile above threshold."""
    above = profile > threshold
    positions = []
    in_peak = False
    start = 0
    total = len(profile)

    for i in range(total):
        if above[i] and not in_peak:
            start = i
            in_peak = True
        elif not above[i] and in_peak:
            # Peak center weighted by projection values
            segment = profile[start:i]
            center = start + np.average(np.arange(len(segment)), weights=segment)
            center = int(round(center))
            # Skip peaks too close to edges (< 3% or > 97%)
            if 0.03 * total < center < 0.97 * total:
                positions.append(center)
            in_peak = False

    if in_peak:
        segment = profile[start:]
        center = start + np.average(np.arange(len(segment)), weights=segment + 0.001)
        center = int(round(center))
        if 0.03 * total < center < 0.97 * total:
            positions.append(center)

    # Merge peaks closer than min_gap
    merged = []
    for pos in sorted(positions):
        if merged and pos - merged[-1] < min_gap:
            merged[-1] = (merged[-1] + pos) // 2
        else:
            merged.append(pos)

    return merged


def _line_extent_v(dark, x, h, w):
    """Find vertical extent of a line at column x."""
    half = 4
    strip = dark[:, max(0, x-half):min(w, x+half)]
    col = np.any(strip > 0, axis=1)
    nz = np.where(col)[0]
    if len(nz) == 0:
        return (0, h)
    fr, to = nz[0], nz[-1]
    if fr < h * 0.05:
        fr = 0
    if to > h * 0.95:
        to = h
    return (fr, to)


def _line_extent_h(dark, y, h, w):
    """Find horizontal extent of a line at row y."""
    half = 4
    strip = dark[max(0, y-half):min(h, y+half), :]
    row = np.any(strip > 0, axis=0)
    nz = np.where(row)[0]
    if len(nz) == 0:
        return (0, w)
    fr, to = nz[0], nz[-1]
    if fr < w * 0.05:
        fr = 0
    if to > w * 0.95:
        to = w
    return (fr, to)


def estimate_line_width(img, v_lines, h_lines):
    """Estimate average line width as fraction of image size."""
    h, w = img.shape[:2]
    dark = get_dark_mask(img)
    widths = []

    for line in v_lines:
        x = int(line["pos"] * w)
        col_strip = dark[:, max(0,x-20):min(w,x+20)]
        per_row = np.sum(col_strip > 0, axis=1)
        active = per_row[per_row > 0]
        if len(active) > 0:
            widths.append(np.median(active))

    for line in h_lines:
        y = int(line["pos"] * h)
        row_strip = dark[max(0,y-20):min(h,y+20), :]
        per_col = np.sum(row_strip > 0, axis=0)
        active = per_col[per_col > 0]
        if len(active) > 0:
            widths.append(np.median(active))

    if widths:
        return round(np.median(widths) / max(w, h), 4)
    return 0.008


def detect_rectangles(img, v_lines, h_lines):
    """Build grid from lines and classify each cell's color."""
    h, w = img.shape[:2]
    x_bounds = [0] + sorted([l["pos"] for l in v_lines]) + [1]
    y_bounds = [0] + sorted([l["pos"] for l in h_lines]) + [1]

    rectangles = []
    for i in range(len(x_bounds) - 1):
        for j in range(len(y_bounds) - 1):
            x1, x2 = x_bounds[i], x_bounds[i+1]
            y1, y2 = y_bounds[j], y_bounds[j+1]

            # Sample center 60% of cell to avoid line pixels
            margin_x = (x2 - x1) * 0.2
            margin_y = (y2 - y1) * 0.2
            sx1 = int((x1 + margin_x) * w)
            sx2 = int((x2 - margin_x) * w)
            sy1 = int((y1 + margin_y) * h)
            sy2 = int((y2 - margin_y) * h)

            if sx2 > sx1 and sy2 > sy1:
                cell = img[sy1:sy2, sx1:sx2]
                color = classify_color(cell)
            else:
                color = PALETTE_HEX["cream"]

            rectangles.append({
                "x": round(x1, 4),
                "y": round(y1, 4),
                "w": round(x2 - x1, 4),
                "h": round(y2 - y1, 4),
                "color": color,
            })

    return rectangles


def classify_color(cell):
    """Classify a cell's dominant color to the nearest palette entry."""
    if cell.size == 0:
        return PALETTE_HEX["cream"]

    avg_bgr = np.mean(cell.reshape(-1, 3), axis=0)
    avg_hsv = cv2.cvtColor(np.uint8([[avg_bgr]]), cv2.COLOR_BGR2HSV)[0][0]
    hue, sat, val = int(avg_hsv[0]), int(avg_hsv[1]), int(avg_hsv[2])

    # Decision tree based on HSV
    if val < 60:
        return PALETTE_HEX["black"]

    if sat < 25:
        if val > 170:
            return PALETTE_HEX["cream"]
        if val < 100:
            return PALETTE_HEX["black"]
        return PALETTE_HEX["gray"]

    if sat < 50:
        if val > 170:
            return PALETTE_HEX["cream"]
        return PALETTE_HEX["gray"]

    # Saturated → classify by hue
    if hue < 10 or hue > 165:
        return PALETTE_HEX["red"]
    if 10 <= hue <= 35:
        return PALETTE_HEX["yellow"]
    if 90 <= hue <= 140:
        return PALETTE_HEX["blue"]

    # Orange-ish → could be yellow or red
    if 35 < hue < 90:
        return PALETTE_HEX["yellow"] if hue < 50 else PALETTE_HEX["cream"]

    return PALETTE_HEX["cream"]


def extract_composition(source, title="", year=None, width_cm=None, height_cm=None,
                        diamond=False, url="", museum="", debug=False):
    """Full pipeline: image → composition JSON."""
    print(f"Loading: {source[:80]}...")
    img = load_image(source)
    orig_h, orig_w = img.shape[:2]
    print(f"  Working size: {orig_w}x{orig_h}")

    # Crop to painting
    img = find_painting_rect(img, debug=debug)
    h, w = img.shape[:2]
    print(f"  Painting region: {w}x{h}")

    if debug:
        cv2.imwrite("debug_cropped.png", img)

    # Detect lines
    v_lines, h_lines = detect_lines(img, debug=debug)
    print(f"  Lines: {len(v_lines)}V + {len(h_lines)}H")

    # Estimate line width
    lw = estimate_line_width(img, v_lines, h_lines)
    print(f"  Line width: {lw}")

    # Detect rectangles
    rects = detect_rectangles(img, v_lines, h_lines)
    colored = [r for r in rects if r["color"] != PALETTE_HEX["cream"]]
    print(f"  Rectangles: {len(rects)} total, {len(colored)} colored")
    for r in colored:
        print(f"    {r['color']} at ({r['x']:.2f},{r['y']:.2f}) {r['w']:.2f}x{r['h']:.2f}")

    # Build ID
    comp_id = title.lower()
    for ch in ",.;:'\"()!/":
        comp_id = comp_id.replace(ch, "")
    comp_id = "_".join(comp_id.split())[:60]
    if year:
        comp_id += f"_{year}"

    aspect_ratio = round((width_cm / height_cm) if width_cm and height_cm else (w / h), 4)

    return {
        "id": comp_id or f"comp_{year or 'unknown'}",
        "title": title,
        "year": year,
        "width": width_cm or round(w * 0.05, 1),
        "height": height_cm or round(h * 0.05, 1),
        "aspectRatio": aspect_ratio,
        "lineWidth": max(0.005, min(0.02, lw)),
        "diamond": diamond,
        "url": url,
        "museum": museum,
        "lines": {
            "vertical": sorted(v_lines, key=lambda l: l["pos"]),
            "horizontal": sorted(h_lines, key=lambda l: l["pos"]),
        },
        "rectangles": rects,
    }


# --- Batch processing ---

COMPOSITIONS_TO_EXTRACT = [
    {
        "image": "https://upload.wikimedia.org/wikipedia/commons/a/a4/Piet_Mondriaan%2C_1930_-_Mondrian_Composition_II_in_Red%2C_Blue%2C_and_Yellow.jpg",
        "title": "Composition II in Red, Blue, and Yellow",
        "year": 1930,
        "width": 46, "height": 46,
        "url": "https://www.kunsthaus.ch/en/collection/paintings/",
        "museum": "Kunsthaus Zürich",
    },
    {
        "image": "https://upload.wikimedia.org/wikipedia/commons/3/36/Tableau_I%2C_by_Piet_Mondriaan.jpg",
        "title": "Composition with Red and Blue",
        "year": 1933,
        "width": 41.2, "height": 33.3,
        "url": "https://www.moma.org/collection/works/80153",
        "museum": "MoMA",
    },
    {
        "image": "https://upload.wikimedia.org/wikipedia/commons/c/c1/Piet_Mondrian_-_Composition_C_%28No.III%29_with_Red%2C_Yellow_and_Blue%2C_1935.jpg",
        "title": "Composition C (No. III) with Red, Yellow and Blue",
        "year": 1935,
        "width": 56.2, "height": 55.1,
        "url": "https://www.tate.org.uk/art/artworks/mondrian-composition-c-no-iii-with-red-yellow-and-blue-l00097",
        "museum": "Tate",
    },
    {
        "image": "https://upload.wikimedia.org/wikipedia/commons/a/ac/Piet_Mondrian_-_Composition_No._III%2C_with_red%2C_blue%2C_yellow_and_black%2C_1929.jpg",
        "title": "Composition No. III, with Red, Blue, Yellow, and Black",
        "year": 1929,
        "width": 50.2, "height": 50,
        "url": "",
        "museum": "Private Collection",
    },
    {
        "image": "https://upload.wikimedia.org/wikipedia/commons/d/db/Mondrian_-_Composition_in_White%2C_Black%2C_and_Red_Paris%2C_1936.jpg",
        "title": "Composition in White, Black, and Red",
        "year": 1936,
        "width": 104.1, "height": 102.2,
        "url": "https://www.moma.org/collection/works/78310",
        "museum": "MoMA",
    },
    {
        "image": "https://upload.wikimedia.org/wikipedia/commons/5/57/Mondrian_-_Composition_%28No._1%29_Gray-Red%2C_1935.jpg",
        "title": "Composition (No. 1) Gray-Red",
        "year": 1935,
        "width": 57.5, "height": 55.6,
        "url": "https://www.artic.edu/artworks/65821/composition-no-1-gray-red",
        "museum": "Art Institute of Chicago",
    },
    {
        "image": "https://upload.wikimedia.org/wikipedia/commons/b/b5/Mondrian_-_Composition_in_Red%2C_Blue%2C_and_Yellow%2C_1937-42.jpg",
        "title": "Composition in Red, Blue, and Yellow",
        "year": 1937,
        "width": 60.3, "height": 55.4,
        "url": "https://www.moma.org/collection/works/80160",
        "museum": "MoMA",
    },
    {
        "image": "https://upload.wikimedia.org/wikipedia/commons/b/b5/Mondrian_-_Composition_B_%28No.II%29_with_Red%2C_1935.jpg",
        "title": "Composition B (No. II) with Red",
        "year": 1935,
        "width": 80.3, "height": 63.3,
        "url": "https://www.tate.org.uk/art/artworks/mondrian-composition-b-no-ii-with-red-t07560",
        "museum": "Tate",
    },
    {
        "image": "https://upload.wikimedia.org/wikipedia/commons/2/20/Mondrian_-_Trafalgar_Square%2C_1939-43.jpg",
        "title": "Trafalgar Square",
        "year": 1939,
        "width": 145.2, "height": 120,
        "url": "https://www.moma.org/collection/works/79879",
        "museum": "MoMA",
    },
]


def batch_extract(debug=False):
    """Extract all compositions in the batch list."""
    results = []
    for entry in COMPOSITIONS_TO_EXTRACT:
        try:
            comp = extract_composition(
                entry["image"],
                title=entry["title"],
                year=entry["year"],
                width_cm=entry.get("width"),
                height_cm=entry.get("height"),
                diamond=entry.get("diamond", False),
                url=entry.get("url", ""),
                museum=entry.get("museum", ""),
                debug=debug,
            )
            results.append(comp)
            print(f"  ✓ {entry['title']}")
        except Exception as e:
            print(f"  ✗ {entry['title']}: {e}")
        print()
    return results


def main():
    parser = argparse.ArgumentParser(description="Extract Mondrian composition from image")
    parser.add_argument("source", nargs="?", help="Image URL or file path")
    parser.add_argument("--title", default="", help="Composition title")
    parser.add_argument("--year", type=int, default=None)
    parser.add_argument("--width", type=float, default=None, help="Width in cm")
    parser.add_argument("--height", type=float, default=None, help="Height in cm")
    parser.add_argument("--diamond", action="store_true")
    parser.add_argument("--url", default="")
    parser.add_argument("--museum", default="")
    parser.add_argument("--debug", action="store_true")
    parser.add_argument("--output", "-o", default=None)
    parser.add_argument("--batch", action="store_true", help="Extract all predefined compositions")
    args = parser.parse_args()

    if args.batch:
        results = batch_extract(debug=args.debug)
        output = json.dumps(results, indent=2, ensure_ascii=False)
        if args.output:
            with open(args.output, "w") as f:
                f.write(output)
            print(f"Saved {len(results)} compositions to {args.output}")
        else:
            print(output)
        return

    if not args.source:
        parser.error("source required (or use --batch)")

    comp = extract_composition(
        args.source, title=args.title, year=args.year,
        width_cm=args.width, height_cm=args.height,
        diamond=args.diamond, url=args.url, museum=args.museum,
        debug=args.debug,
    )

    output = json.dumps(comp, indent=2, ensure_ascii=False)
    if args.output:
        with open(args.output, "w") as f:
            f.write(output)
        print(f"Saved to {args.output}")
    else:
        print(output)


if __name__ == "__main__":
    main()
