# Animator guide — Zaltyko element animations (clean room)

You turn technical pose facts into an animation **spec** (JSON) per element. The engine turns
the spec into frames with real physics, validates every frame and renders a preview video and a
static pictogram. You never look at the FIG Code or its drawings (clean room): your inputs are the
pose facts (`work/poses-<edition>-<batch>.json`), our own element data (`batches/<edition>-<batch>.json`:
name, short name, description) and this guide. Nothing from Upgrade Gymnastics or GymPro.

Workdir: this folder (`scripts/element-library/animation`). Write specs to `specs/<edition>/<elementKey>.json`.
Run: `python3 run_spec.py specs/<edition>/<key>.json --render --out out/<edition>-<batch>` (exit 1 if
any frame breaks a rule). Look at `out/.../<key>-sheet.png` (10 frames) and `<key>.svg` (static
pictogram) with the Read tool before you call an element done. Reuse: write small Python helpers
in `work/` to generate families of specs (e.g. "back salto with N twists") instead of hand-typing.

## Conventions
- Angles in degrees, absolute in screen space: 0 = up, 90 = right, 180 = down, 270 = left.
  Angles may go beyond 360 to express continuous rotation (e.g. 405 = 45 after a full turn).
- A pose: `{"torso": t, "arm_n": [upper, fore], "arm_f": [...], "leg_n": [thigh, shin], "leg_f": [...],
  "head": tilt, "facing": 1|-1, "front": false}`. `torso` = direction pelvis→neck. Limb pairs are the
  absolute directions of upper and lower segment. `_n` = near side (drawn in front), `_f` = far side.
  `facing` = +1 when the chest points to +x for an upright body (−1 = toward −x).
- Natural bends (validator enforces, with facing): knees bend backwards (0..165°), elbows bend
  forwards (0..160°), hip flexion up to 185° (pike), hip extension to 100° (splits), shoulder
  flexion to 200° (arms overhead and a bit behind), extension to 75°.
- Joint names for contacts: hands `han`/`haf`, wrists are the hand points; feet tips `ton`/`tof`,
  ankles `ann`/`anf`; `pelvis`, `neck`.
- Scenes and anchors (85 px = 1 m; real heights): `floor` (anchor `floor@X`, floor y 268),
  `beam` (`beam@X`, top 1.25 m), `high_bar` (`bar`, 2.8 m), `uneven_bars` (`lb` 1.70 m at x 118,
  `hb` 2.50 m at x 248), `rings` (`rings`, 2.75 m; rings and straps are drawn at the hands),
  `parallel_bars` (`rail@X`, 2.0 m), `pommel_horse` (`pommel_l`, `pommel_r`, `horse@X`),
  `vault` (wider canvas, 640 px ≈ 7.5 m: runway from x≈20 for the hurdle/round-off, `board` at x≈280, `table@X` top 1.25 m with the table between x 370 and 462, `floor@X`, `mat@X` between x 478 and 628).
  Use x between ~30 and ~330. The canvas grows upward automatically.

## Spec
```json
{"elementKey": "...", "scene": "floor", "view": "side", "holdS": 0.5,
 "timeline": [
   {"contact": {"joint": "ton", "at": "floor@250", "keys": [{"dt": 0, "pose": {...}}, {"dt": 0.3, "pose": {...}}]}},
   {"flight": {"riseM": 1.1, "rotation": -360, "twist": 360, "twistWindow": [0.2, 0.8],
               "shapes": [{"u": 0.3, "pose": {...}}, {"u": 1.0, "pose": {...}}],
               "land": {"joint": "ton", "at": "floor@110"}}},
   {"contact": {...}}],
 "poster": {"main": 30, "ghosts": [8, 52]}}
```
- **contact**: one joint stays pinned at `at` while the keys interpolate (`dt` = seconds from the
  previous key; the first key of a contact that follows another phase must equal where the body
  already is). To change the pinned joint (e.g. second hand, other foot, regrasp), start a new
  contact phase whose first key is the current pose.
- **flight**: ballistic. The centre of mass follows a parabola under real gravity from takeoff to
  the landing point; `riseM` = how high the centre of mass rises above its takeoff height (this sets
  the flight time). `rotation` = total body rotation in the air (sign = direction; + is clockwise on
  screen). Shapes are given at fractions `u` of the flight; only their **relative** limb angles
  matter (the engine rotates the body), so give them with any torso (0 is easiest). The angular speed
  follows conservation of angular momentum: tucked shapes spin faster than stretched ones.
  `twist` = degrees around the long axis (a ring is drawn; facing flips every 180°): define post-twist
  shapes and landing pose with the new facing.
- `poster`: frame indices for the static pictogram (main = the defining moment; 1–2 ghosts).
- Holds (strength): show a short, plausible entry (0.5–1 s) and then hold the pose with `dt: 2.0`.
- Front-view elements (cross on rings): `"view": "front"` and `"front": true` in the poses.
- Rotation about a vertical axis (pommel horse circles/flairs, travels; pirouettes): add `"yaw"` (deg)
  and `"yawPivot"` (joint, default `han`) to poses. The body is drawn in its own plane and turned about
  a vertical axis through the pivot: horizontal offsets shrink with cos(yaw) and the body is drawn
  behind the apparatus while sin(yaw) < 0. A circle = yaw advancing 360° (e.g. 0→360 in ≈0.95 s) with the
  body near horizontal and the shoulders leaning opposite to the feet; key every 45°. See
  `tecnica/example-pommel-circle.json` for a minimal example.

## Technique first (mandatory)
Read the family sections of `tecnica/swing.md`, `tecnica/acro-dance-vault.md` and
`tecnica/pommel-strength.md` that apply to your batch BEFORE writing specs, and key every element by
its real technique: entries (giant from handstand + tap before releases and dismounts; run/hurdle,
round-off or flic-flac before tumbling saltos; step/chassé and plié before leaps; preparation before
holds), the phases in the documented order and timing, the coaching cues, and none of the typical
errors listed there. A movement that is physically possible but not how a coach teaches it is wrong.
Use `authoring.py` (`leg_to`, `pelvis_of`) to put feet/hands exactly on surfaces: never leave a foot
floating or sunk. Angles interpolate linearly as written: write continuous numbers (e.g. 355 → 380, not
355 → 20) so limbs move the anatomically right way; the validator rejects impossible paths.

## Physics and body logic (what a coach would immediately see)
- Typical centre-of-mass rise (measured, see tecnica files): floor single saltos 0.9–1.2 m; floor doubles
  ≈ 0.65 m (women) / 0.9 m (men) above take-off; beam acro 0.5–0.8 m; split leaps 0.22–0.35 m (beam
  0.2–0.3); bar releases: peak 0.5–1.0 m above the bar (use `apexAbove`); dismounts from bars/rings
  1.0–1.6 m; vault post-flight ≈ 0.3 m (women) / 0.5 m (men) above the table-push height.
- Contacts in good technique are short: tumbling rebounds 0.12–0.13 s, board 0.09–0.15 s, leap
  take-off 0.15–0.25 s; a long soft contact before a salto reads as "beginner".
- Speed limits per frame (30 fps): on contact, trunk 28°, legs 35°, arms 40° (≈ 840/1050/1200 °/s). In
  the air the trunk may rotate up to 55°/frame (physics sets it) and limbs are limited relative to the
  trunk: never raise a flight above the measured heights just to satisfy the validator.
- Takeoff speeds must be plausible (the report shows them in m/s: horizontal ≤ 7, vertical 2–6).
- Before a jump/salto there is a preparation (knee and hip bend, arm swing); after landing an
  absorption (knees and hips bend) and recovery. Arms move in sensible arcs, not snaps.
- Contacts never slide; nothing passes through the floor, the beam top, a bar or the horse.
- Rotation direction must match the facts (backward salto = rotating toward the back).
- Keep the element's defining facts (`mustShow`) clearly visible on the poster frame.
- If a fact is ambiguous, choose the most common competitive execution and note it in
  `work/notes-<edition>-<batch>.md`.

## Done means
Every element of the batch has a spec, `run_spec.py` exits 0 for all of them (no validator problems),
you have looked at every sheet and poster and fixed what looks wrong, and you list in the notes file:
element, decisions taken, anything you could not represent well in 2D (e.g. circles on pommel horse
seen from the side). Commit nothing; the coordinator commits.
