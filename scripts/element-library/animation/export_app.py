"""Export reviewed element animation frames for the browser renderer.

Only keys listed in ``accepted.json`` are written. Specs and physics stay in
Python; this file serializes their calculated output without recomputing it in
the browser.
"""

import json
import os
import sys
from pathlib import Path

from engine2 import FPS
from run_spec import build, headroom

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
OUTPUT_ROOT = ROOT / "src/modules/element-library/data"
FORMAT_VERSION = 1
MAX_BYTES = 15 * 1024
ANGLE_STEP = 5
POSITION_STEP = 2
CONTACT_JOINTS = ('', 'han', 'haf', 'ton', 'tof', 'ton', 'hipn', 'hipf', 'pelvis')


def quantize(value, step):
    return int(round(value / step))


def encode_spec(spec, edition):
    scene, timeline, _ = build(spec)
    frames = []
    for pose, pelvis, meta in timeline.frames:
        contact = meta.get('contact')
        contact_joint, contact_point = contact if contact else ('', (0, 0))
        frames.append([
            quantize(pose.torso, ANGLE_STEP),
            quantize(pose.arm_n[0], ANGLE_STEP), quantize(pose.arm_n[1], ANGLE_STEP),
            quantize(pose.arm_f[0], ANGLE_STEP), quantize(pose.arm_f[1], ANGLE_STEP),
            quantize(pose.leg_n[0], ANGLE_STEP), quantize(pose.leg_n[1], ANGLE_STEP),
            quantize(pose.leg_f[0], ANGLE_STEP), quantize(pose.leg_f[1], ANGLE_STEP),
            quantize(pose.head, ANGLE_STEP), quantize(getattr(pose, 'arch', 0), ANGLE_STEP),
            getattr(pose, 'facing', 1), quantize(getattr(pose, 'yaw', 0), ANGLE_STEP),
            {'han': 0, 'haf': 1, 'pelvis': 2, 'ton': 3}.get(getattr(pose, 'yaw_pivot', 'han'), 0), int(bool(pose.front)),
            quantize(pelvis[0], POSITION_STEP), quantize(pelvis[1], POSITION_STEP),
            CONTACT_JOINTS.index(contact_joint) if contact_joint in CONTACT_JOINTS else 0,
            quantize(contact_point[0], POSITION_STEP), quantize(contact_point[1], POSITION_STEP),
            int(meta.get('contact_phase', -1) if meta.get('contact_phase') is not None else -1),
            int(bool(meta.get('twist'))), quantize(meta.get('twistTotal', 0), ANGLE_STEP), int(bool(meta.get('twistShow'))),
            int(
                not (
                    all(abs(a - b) < 6 for a, b in zip(pose.arm_n, pose.arm_f))
                    and all(abs(a - b) < 6 for a, b in zip(pose.leg_n, pose.leg_f))
                ) or bool(pose.front)
            ),
        ])
    return {
        "formatVersion": FORMAT_VERSION,
        "edition": edition,
        "elementKey": spec["elementKey"],
        "scene": spec["scene"],
        "fps": FPS,
        "size": [scene.w, scene.h],
        "floorY": scene.floor_y,
        "headroom": headroom(timeline),
        "floorBand": bool(any(getattr(pose, 'yaw', 0) for pose, _, _ in timeline.frames) and scene.kind in ('floor', 'pommel_horse')),
        "poster": {
            "main": spec.get("poster", {}).get("main", len(frames) // 2),
            "ghosts": spec.get("poster", {}).get("ghosts", []),
        },
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
