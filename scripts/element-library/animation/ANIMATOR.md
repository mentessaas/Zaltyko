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
- Spine: optional `"arch": degrees`. The trunk bends at mid-back; `torso` is then the direction of the
  LOWER trunk (pelvis→mid-back) and the upper trunk turns by `arch` away from the chest. `arch > 0` =
  back bend (ring and sheep leaps, walkovers, back handsprings, Preziosa, bridges, arch in a hollow
  swing), `arch < 0` = rounded back (tight tucks, pike compression). Range −35..60; it may change at
  most 20° per frame. `head` is relative to the upper trunk. Shoulder angles are measured from the
  upper trunk, hip angles from the lower trunk.
- Natural bends (validator enforces, with facing): knees bend backwards (0..165°), elbows bend
  forwards (0..160°), hip flexion up to 185° (pike), hip extension to 100° (splits), shoulder
  flexion to 200° (arms overhead and a bit behind), extension to 75°.
- Joint names for contacts: hands `han`/`haf`, wrists are the hand points; feet tips `ton`/`tof`,
  ankles `ann`/`anf`; `pelvis`, `neck`.
- Scenes and anchors (85 px = 1 m; real heights): `floor` (anchor `floor@X`, floor y 268, 360 px ≈ 4.2 m: for
  elements done on the spot), `floor_pass` (same floor, 720 px ≈ 8.5 m: use it for every tumbling pass with a run,
  hurdle, round-off or flic-flac entry so the travel and speeds are real),
  `beam` (`beam@X`, top 1.25 m; the real floor is below at `floor@X` and the beam is a solid box: the trunk may
  never be inside it, legs/head/hands may hang beside it), `beam_mount` (wide 800 px: 3 m of run-up, springboard `board` at x≈262 in front
  of the left end of a 5 m beam from x 330 to 755, `beam@X`, `floor@X` — use it for every mount with a run or board), `high_bar` (`bar`, 2.8 m), `uneven_bars` (wide 760 px: springboard `board` at x≈262 in front of the low bar,
  `lb` 1.70 m at x 390, `hb` 2.50 m at x 520, a second board `board_hb` at x≈650 outside the high bar for mounts
  from that side, `floor@X`; room for the run/round-off and for swings outside the bars), `rings` (`rings`, 2.75 m; rings and straps are drawn at the hands),
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
- Twisting frames skip the side-view joint limits (the 2D figure mirrors during a twist), so tucked and
  piked twists are allowed; keep the shape anatomically plausible anyway.
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

## Momentum continuity (report field `momentum`)
`run_spec.py` checks that the centre of mass (COM) keeps moving through take-off. The ordinary limit is
a 1.5 m/s change between the last support sample and the first flight sample. Inside ordinary support,
a speed change above 3.5 m/s in one frame is reported. Flight remains ballistic: its take-off speed,
duration, apex, and landing point still come from `riseM`, `apexAbove`, `durationS`, and `land` in the spec.
Support joints stay pinned and the final authored pose stays exact. If the final interval has only one
frame, the engine can borrow a frame from the penultimate interval when that interval has at least two;
this preserves the total support duration and every key pose. The ballistic flight time is unchanged.

For a support that immediately precedes flight, the engine fits a bounded Hermite tangent to the final
contact segment using that flight's computed COM velocity. It changes only the path between the final
two keys. The fit must stay within the existing pose, segment-speed, floor, solid, bar, and contact
checks. If it cannot, the engine reduces the tangent or keeps the original eased curve. If both final
intervals contain only one frame, there is no frame to redistribute and the original timing remains.
Animators should still give the last support key a plausible direction and extension, and inspect any
remaining take-off warnings; the engine cannot infer a better technique or repair a contradictory key sequence.

Impacts from flight into support remain exempt. Elastic launch contacts use a contact-level acceleration
ceiling: the COM velocity change from entry to exit is checked against the maximum net acceleration
measured for that apparatus multiplied by the contact duration. The 30 fps 1.5 m/s take-off threshold
does not apply to these contacts. The ceilings use reported peak reaction forces, with body weight
subtracted to estimate net COM acceleration:

- `board`: `(10.6 − 1) × g` for the measured vault springboard peak; Greenwood & Newton report a mean
  contact time of 0.133 s ([ISBS proceedings](https://ojs.ub.uni-konstanz.de/cpa/article/view/2729)).
- `table@X`: `(2 × 1.81 − 1) × g`, summing the highest reported hand-table peak per hand; the table's
  hand-support phase is elastic ([Penitente & Sands, 2015](https://doi.org/10.1515/hukin-2015-0034)).
- `floor@X`: `(8.46 − 1) × g` for a floor contact lasting at most 0.15 s between two flights, using
  the highest reported ankle force in a round-off as the linked-tumbling envelope ([Burt et al., 2010](https://www.fsp.uni-lj.si/mma/SCGYM_2_3_2010_article1/2010093009140391/?m=1285830843)).

These ceilings apply only to contacts on the named board, vault table, or short linked floor acrobatics.
Bars, rings, parallel bars, beam, and ordinary floor support keep the 1.5 m/s take-off and 3.5 m/s
within-support limits. Review the remaining warnings: they usually indicate a one-frame final key
interval, a launch pose whose pinned-contact COM path cannot reach the ballistic velocity within the
existing segment-speed limits, or an internal stop-and-go between authored keys.
