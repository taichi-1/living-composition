"""Convert Andrzejewski .mat dataset to compositions.json for the frontend."""

import json
import re
import sys
from pathlib import Path
from urllib.parse import quote

import numpy as np
import scipy.io

COLOR_MAP = {1: "#FFFFFF", 2: "#DD0100", 3: "#FAC901", 4: "#0000D6", 5: "#000000"}

# Human-readable titles and metadata for known paintings
METADATA = {
    "CompositionWithRedBlueYellowAndWhite31939": {
        "title": "Composition with Red, Blue, Yellow and White III",
        "year": 1939,
    },
    "CompositionWithBlueAndYellow1932": {
        "title": "Composition with Blue and Yellow",
        "year": 1932,
    },
    "Composition1936": {"title": "Composition", "year": 1936},
    "CompositionWithRedAndBlue1936": {
        "title": "Composition with Red and Blue",
        "year": 1936,
    },
    "CompositionWithLargeBlue1928": {
        "title": "Composition with Large Blue Plane",
        "year": 1928,
    },
    "CompositionWithYellowBlueAndRed1937": {
        "title": "Composition with Yellow, Blue and Red",
        "year": 1937,
    },
    "CompositionWithRedYellowAndBlue1927": {
        "title": "Composition with Red, Yellow and Blue",
        "year": 1927,
    },
    "CompositionWithRedYellowAndBlue1928": {
        "title": "Composition with Red, Yellow and Blue",
        "year": 1928,
    },
    "Composition2RedBlueAndYellow1930": {
        "title": "Composition II in Red, Blue, and Yellow",
        "year": 1930,
    },
    "CompositionWithYellowPatch1930": {
        "title": "Composition with Yellow Patch",
        "year": 1930,
    },
    "CompositionWithRedBlackBlueAndYellow1928": {
        "title": "Composition with Red, Black, Blue and Yellow",
        "year": 1928,
    },
}


def extract_year(name: str) -> int | None:
    """Extract year from painting name. Handles '...1936', '...1921A', '...1939-'."""
    # Find all 4-digit sequences that look like plausible Mondrian years (1900-1950)
    matches = re.findall(r"(19[0-4]\d)", name)
    return int(matches[0]) if matches else None


def make_title(name: str) -> str:
    """Convert camelCase name to human-readable title."""
    if name in METADATA:
        return METADATA[name]["title"]
    # Remove year patterns like "1939-" or "1936" anywhere
    cleaned = re.sub(r"19[0-4]\d-?", "", name)
    # Remove leading "No." numbers (keep them readable)
    # Split camelCase
    words = re.sub(r"([a-z])([A-Z])", r"\1 \2", cleaned)
    words = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1 \2", words)
    words = re.sub(r"(\d)([A-Z])", r"\1 \2", words)
    # Clean up number prefixes like "Composition2" -> "Composition II"
    words = re.sub(r"Composition\s*2\b", "Composition II", words)
    words = re.sub(r"Composition\s*1\b", "Composition I", words)
    return words.strip()


def convert_painting(name: str, rep: np.ndarray) -> dict:
    """Convert a single painting's MATLAB representation to our JSON format."""
    xmax = int(rep["xmax"][0][0])
    ymax = int(rep["ymax"][0][0])
    v_pts = rep["v_pts"][0].astype(float)
    h_pts = rep["h_pts"][0].astype(float)
    v_thick = rep["v_thick"].flatten().astype(float)
    h_thick = rep["h_thick"].flatten().astype(float)
    v_ext = rep["v_ext"]  # (N, 2) indices into h_pts (1-based)
    h_ext = rep["h_ext"]  # (M, 2) indices into v_pts (1-based)
    rects = rep["rect"]  # (R, 4) [v_start, v_end, h_start, h_end] (1-based)
    rect_colors = rep["rect_colors"][0]

    year = METADATA.get(name, {}).get("year") or extract_year(name)
    title = make_title(name)

    # Normalize line positions to 0-1
    v_norm = ((v_pts - 1) / (xmax - 1)).tolist()
    h_norm = ((h_pts - 1) / (ymax - 1)).tolist()

    # Average visible line width (exclude 0-thickness boundary lines)
    visible_v = v_thick[v_thick > 0]
    visible_h = h_thick[h_thick > 0]
    all_thick = np.concatenate([visible_v, visible_h]) if len(visible_v) + len(visible_h) > 0 else np.array([6.0])
    avg_line_width = float(np.mean(all_thick)) / max(xmax, ymax)

    # Build lines with extent info
    lines_v = []
    for i in range(len(v_pts)):
        thick = float(v_thick[i])
        if thick == 0:
            continue  # boundary edge, not a drawn line
        ext = v_ext[i]  # [h_start_idx, h_end_idx] (1-based into h_pts)
        lines_v.append({
            "pos": v_norm[i],
            "from": h_norm[int(ext[0]) - 1],
            "to": h_norm[int(ext[1]) - 1],
        })

    lines_h = []
    for i in range(len(h_pts)):
        thick = float(h_thick[i])
        if thick == 0:
            continue
        ext = h_ext[i]
        lines_h.append({
            "pos": h_norm[i],
            "from": v_norm[int(ext[0]) - 1],
            "to": v_norm[int(ext[1]) - 1],
        })

    # Build rectangles
    rectangles = []
    for j in range(rects.shape[0]):
        vi0, vi1, hi0, hi1 = rects[j]  # 1-based indices
        x0 = v_norm[int(vi0) - 1]
        x1 = v_norm[int(vi1) - 1]
        y0 = h_norm[int(hi0) - 1]
        y1 = h_norm[int(hi1) - 1]
        color_code = int(rect_colors[j])
        rectangles.append({
            "x": round(x0, 6),
            "y": round(y0, 6),
            "w": round(x1 - x0, 6),
            "h": round(y1 - y0, 6),
            "color": COLOR_MAP.get(color_code, "#FFFFFF"),
        })

    # Wikimedia Commons search URL
    search_query = f"Mondrian {title}"
    if year:
        search_query += f" {year}"
    url = f"https://commons.wikimedia.org/w/index.php?search={quote(search_query)}&ns0=1&ns6=1"

    return {
        "id": re.sub(r"[^a-zA-Z0-9]", "_", name).lower(),
        "title": title,
        "year": year,
        "url": url,
        "aspectRatio": round(xmax / ymax, 4),
        "lineWidth": round(avg_line_width, 5),
        "lines": {
            "vertical": [{"pos": round(l["pos"], 6), "from": round(l["from"], 6), "to": round(l["to"], 6)} for l in lines_v],
            "horizontal": [{"pos": round(l["pos"], 6), "from": round(l["from"], 6), "to": round(l["to"], 6)} for l in lines_h],
        },
        "rectangles": rectangles,
    }


def main():
    mat_path = Path(__file__).parent.parent.parent / "data" / "MondriansAndTransatlantics.mat"
    if not mat_path.exists():
        # Also check /tmp fallback
        mat_path = Path("/tmp/mondrian_data/MondrianData/MondriansAndTransatlantics.mat")
    if not mat_path.exists():
        print(f"Error: .mat file not found. Place it at analysis/data/MondriansAndTransatlantics.mat")
        sys.exit(1)

    data = scipy.io.loadmat(str(mat_path))
    names = data["names"][0]
    labels = data["labels"][0]
    reps = data["reps"][0]

    compositions = []
    for i in range(len(names)):
        if labels[i] != 1:  # Skip transatlantic sketches
            continue
        name = str(names[i][0])
        comp = convert_painting(name, reps[i])
        compositions.append(comp)

    # Sort by year
    compositions.sort(key=lambda c: c["year"] or 0)

    output_path = Path(__file__).parent.parent.parent.parent / "app" / "data" / "compositions.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(compositions, f, indent=2)

    print(f"Converted {len(compositions)} paintings → {output_path}")
    for c in compositions:
        n_v = len(c["lines"]["vertical"])
        n_h = len(c["lines"]["horizontal"])
        n_colored = sum(1 for r in c["rectangles"] if r["color"] != "#FFFFFF")
        print(f"  {c['year']} {c['title']}: {n_v}v + {n_h}h lines, {n_colored} colored rects")


if __name__ == "__main__":
    main()
