"""Export reviewed element animation frames for the browser renderer.

Only keys listed in ``accepted.json`` are written. Specs, physics and the
figure geometry stay in Python: each frame carries the joint positions that
``figure.Pose.joints`` computed (front view, spread arms and camera turns
included) plus the few flags the drawing needs, and the apparatus is exported
as the SVG that ``scenes.py`` draws. The browser only paints them, so the two
can never drift apart.
"""

import json
import math
import re
from pathlib import Path

from engine2 import FPS
from run_spec import build, headroom

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
OUTPUT_ROOT = ROOT / "src/modules/element-library/data"
FORMAT_VERSION = 2
MAX_BYTES = 40 * 1024
JOINTS = (
    "pelvis", "mid", "neck", "head",
    "shn", "eln", "han", "shf", "elf", "haf",
    "hipn", "knn", "ann", "ton", "hipf", "knf", "anf", "tof",
)
# frame layout: 2 * len(JOINTS) joint coordinates (px, rounded), then FLAGS. Coordinates of every
# frame after the first are stored as the difference from the previous frame ("jointEncoding": "delta").
FLAGS = ("front", "arch", "farLayer", "behind", "twistRing", "twistTotal", "torso", "frontAmount")
COLOURS = {
    "#c7d0e3": ".35",   # supports, floor and mats
    "#6f7da0": ".6",    # pommel handles
}


def scene_svg(scene):
    """The apparatus as drawn by scenes.py, recoloured to the page ink (currentColor)."""
    drawing = scene.draw("x")
    drawing = drawing.replace('url(#xm)', 'currentColor')
    for colour, opacity in COLOURS.items():
        drawing = drawing.replace(f'fill="{colour}"', f'fill="currentColor" fill-opacity="{opacity}"')
        drawing = drawing.replace(f'stroke="{colour}"', f'stroke="currentColor" stroke-opacity="{opacity}"')
    leftover = set(re.findall(r'(?:fill|stroke)="(#[0-9a-fA-F]{3,6}|url\([^)]*\))"', drawing))
    if leftover:
        raise ValueError(f"scene {scene.kind} has colours the exporter does not map: {sorted(leftover)}")
    return drawing


def close(a, b):
    return abs(a[0] - b[0]) < 6 and abs(a[1] - b[1]) < 6


def encode_frame(pose, pelvis, meta):
    joints = pose.joints(pelvis)
    coords = []
    for name in JOINTS:
        x, y = joints[name]
        coords += [round(x), round(y)]
    front = bool(pose.front)
    arch = (not front) and abs(getattr(pose, "arch", 0)) > 2
    far_layer = front or not (close(pose.arm_n, pose.arm_f) and close(pose.leg_n, pose.leg_f))
    behind = math.sin(math.radians(getattr(pose, "yaw", 0))) < -0.05
    twist_ring = bool(meta.get("twist") or meta.get("twistShow"))
    twist_total = round(meta.get("twistTotal", 0)) if twist_ring else 0
    front_amount = round(100 * max(0.0, min(1.0, float(pose.front))))
    return coords + [int(front), int(arch), int(far_layer), int(behind), int(twist_ring), twist_total,
                     round(pose.torso), front_amount]


def encode_spec(spec, edition):
    scene, timeline, _ = build(spec)
    absolute = [encode_frame(pose, pelvis, meta) for pose, pelvis, meta in timeline.frames]
    count = 2 * len(JOINTS)
    frames = [absolute[0]] + [
        [a - b for a, b in zip(cur[:count], prev[:count])] + cur[count:]
        for prev, cur in zip(absolute, absolute[1:])
    ]
    yaw_frames = any(getattr(pose, "yaw", 0) for pose, _, _ in timeline.frames)
    poster = spec.get("poster", {})
    last = len(frames) - 1
    main = poster.get("main", len(frames) // 2)
    ghosts = poster.get("ghosts", [])
    if not 0 <= main <= last or any(not 0 <= g <= last for g in ghosts):
        raise ValueError(f"{spec['elementKey']}: poster frames outside 0..{last}")
    return {
        "formatVersion": FORMAT_VERSION,
        "edition": edition,
        "elementKey": spec["elementKey"],
        "scene": spec["scene"],
        "fps": FPS,
        "size": [scene.w, scene.h],
        "floorY": scene.floor_y,
        "headroom": headroom(timeline),
        "floorBand": bool(yaw_frames and scene.kind in ("floor", "pommel_horse")),
        "sceneSvg": scene_svg(scene),
        "rings": [scene.at("rings")[0]] if scene.kind == "rings" else None,
        "joints": list(JOINTS),
        "jointEncoding": "delta",
        "flags": list(FLAGS),
        "poster": {"main": main, "ghosts": ghosts},
        "frames": frames,
    }


def main():
    accepted_path = HERE / "accepted.json"
    if not accepted_path.exists():
        accepted_path.write_text("{}\n", encoding="utf-8")
    accepted = json.loads(accepted_path.read_text(encoding="utf-8"))
    if not isinstance(accepted, dict):
        raise ValueError("accepted.json must be an object of edition to element-key lists")
    for edition, keys in accepted.items():
        if not isinstance(edition, str) or not edition or any(part in (".", "..") for part in Path(edition).parts) or Path(edition).is_absolute():
            raise ValueError(f"invalid edition path: {edition!r}")
        if any(char not in "abcdefghijklmnopqrstuvwxyz0123456789-" for char in edition):
            raise ValueError(f"invalid edition name: {edition!r}")
        if not isinstance(keys, list) or any(not isinstance(key, str) for key in keys):
            raise ValueError(f"accepted.json entry {edition!r} must be a list of element keys")
        if len(keys) != len(set(keys)):
            raise ValueError(f"accepted.json entry {edition!r} contains duplicate keys")
        for key in keys:
            if not key or key[0] < "a" or key[0] > "z" or any(char not in "abcdefghijklmnopqrstuvwxyz0123456789_" for char in key):
                raise ValueError(f"invalid element key: {key!r}")
            spec_path = HERE / "specs" / edition / f"{key}.json"
            if not spec_path.is_file():
                raise FileNotFoundError(f"accepted animation has no spec: {spec_path}")
            spec = json.loads(spec_path.read_text(encoding="utf-8"))
            if spec.get("elementKey") != key:
                raise ValueError(f"spec key mismatch: {spec_path}")
            data = encode_spec(spec, edition)
            output = json.dumps(data, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
            if len(output) + 1 >= MAX_BYTES:
                raise ValueError(f"{edition}/{key} is {len(output) + 1} bytes; limit is < {MAX_BYTES}")
            target = OUTPUT_ROOT / edition / "animaciones" / f"{key}.json"
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(output + b"\n")
            print(f"{edition}/{key}: {len(output)} bytes")


if __name__ == "__main__":
    main()
