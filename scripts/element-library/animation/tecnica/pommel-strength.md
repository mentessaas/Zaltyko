# Technique reference — pommel horse, strength holds, floor non-acrobatic (MAG)

Animator's reference for Zaltyko element animations. Families: pommel horse (circles, flairs,
scissors, travels, spindles, Russians, handstands, dismounts), static strength and holds on floor,
rings and parallel bars, and non-acrobatic MAG floor elements. Facts are written in our own words;
numbers carry a source tag `[n]` (list at the end). Values marked *est.* are coaching-practice
estimates where no measured source was found; treat them as defaults, not truth.

Clean-room note: the FIG Code of Points was not opened. Rule facts (2 s holds, angle tolerances)
come from secondary sources that quote it [10][11][13][14][15].

Engine conventions used in the hints (from `ANIMATOR.md`): angles absolute on screen, 0 = up,
90 = right, 180 = down, 270 = left; "head toward +x" means `torso = 90` for horizontal bodies.
`facing = +1` puts the chest toward +x when upright, so a horizontal body with head to +x is
**face down with facing +1** and **face up with facing −1**. Angle hints are derived from statics
and segment geometry; confirm with `run_spec.py` (validator) and the sheet.

---

## 0. General rules for animators (all three families)

### 0.1 Posture standards (what every frame must respect unless the element says otherwise)

| Body part | Standard | Typical fault a coach sees immediately |
|---|---|---|
| Feet | Pointed (ankle extended, foot continues the shin line). The rig draws the toe along the shin, so this is automatic — never key a flexed foot. | Flexed or sickled feet. |
| Knees | Fully straight: thigh angle = shin angle. Bend only in tuck/landing/kip-up phases. | "Soft" knees in circles, levers, presses. |
| Legs | Together, unless the element is straddled (flairs, straddle planche, straddle press, scissors). Straddles are wide and symmetric: scissors ≥ 90° between legs [14], flairs toward 180°. | Legs drifting apart in circles; uneven straddle. |
| Elbows | Straight in every straight-arm element; a bent arm in a straight-arm press costs 0.3–0.5 [14]. | Bent arms during press, planche, Maltese, cross. |
| Hips | Fully extended ("complete hip extension") in circles, levers, planches, handstands [14]. Hollow (slightly dished) is fine in handstand; pike is not. | Pike at the hips — the most common deduction in circles and levers. |
| Head | Neutral, in line with the trunk for levers, planches, handstands ("head in line with body" [14]). Pommel rear support: head goes back [3]. | Head thrown back or chin tucked in holds; head forward in rear support on pommels. |
| Hands/rings | Rings turned out (at least parallel) in L-support and handstand; no resting on straps [14]. | Rings turned in; arms leaning on cables. |
| Square | Hips square to the horse in circles and travels [14][16]. | "Skew" (hips turned) — the most common travel deduction [16]. |

### 0.2 Holds — rules that drive timing

- A static strength/hold element is credited only when held **2 s** from the instant the body is
  completely still [10][11][13]. Animate **2.0–2.5 s** of hold (ANIMATOR `dt: 2.0`).
- Angle tolerance bands used by judges and by federation tests: ≤ 15° off the ideal line = small,
  15–30° = medium, 30–45° = large error (cross: 0.1 / 0.3 / 0.5) [11][13][15]. Key every hold
  within 5° of its ideal line so the poster never reads as a "medium" fault.
- Planche body line may not rise more than 20° above horizontal (quoted in [10]); aim for 0–5°.
- Arrive at the hold with a short controlled deceleration (0.2–0.4 s *est.*), then zero motion.
  No bounce, no drift, no settling after the clock starts. On rings the cables must hang still:
  the centre of mass (CoM) must sit exactly above (support) or below (hang) the rings.
- Holds are not "pose and freeze" in isolation: show the entry (0.5–1.5 s) and, if the spec
  continues, the exit (0.5–2 s).

### 0.3 Realistic durations (defaults for keys)

| Movement | Duration | Source |
|---|---|---|
| Static hold (credited) | 2.0 s minimum, animate 2.0–2.5 s | [10][11][13] |
| Training-standard holds | L-support on rings 2–3 s; back lever 3 s; rings handstand after press 5 s (age-group compulsory) | [14] |
| Federation test cadence for presses | L-support 1 s → lift to handstand 1 s → lower to L-support 1 s | [15] |
| Lower from support to cross + hold | ≈ 4 s total (≈ 1.5–2 s lowering + 2 s hold) in an Olympic champion | [11] |
| Press to handstand (floor/PB) | 1.0–2.0 s lift (*est.*, consistent with the 1 s test cadence [15]) | — |
| Press to handstand (rings, competition) | 1.5–3 s lift (*est.*) | — |
| Lower handstand → planche / Maltese / inverted cross | 1.0–2.0 s (*est.*) | — |
| Double leg circle | 0.88–1.00 s per circle; 10 circles ≈ 9–10 s | [5][9] |
| Flair (Thomas flair), pommel or floor | 1.08–1.13 s per flair | [6] |
| Magyar spindle (1/1 turn in one circle) | ≈ 1.3 s; flair spindle ≈ 1.5 s | [8] |
| Scissor (one) | 0.8–1.0 s (*est.*, about one swing) | — |
| Russian wendeswing 360° | 0.9–1.2 s (*est.*) | — |
| Kip-up (neck kip) on floor | 0.8–1.2 s from shoulders to feet (*est.*) | — |

---

## 1. Pommel horse

### 1.1 Shared mechanics (true for circles, flairs, travels, spindles, Russians)

- Over 80 % of pommel skills are built on the circle [2]; get the circle right and the rest
  follows.
- The circle is **two coupled rotations**: (a) the whole body swings round a vertical axis near
  the middle of the horse, and (b) the hips rotate about the body's long axis, one full turn per
  circle, so the gymnast is chest-toward-horse in front support and back-toward-horse in rear
  support [9][5]. In a well-trained gymnast the two rotations stay in sync [5].
- **Counter-lean**: shoulders always move opposite to the feet. Measured horizontal path
  diameters (fraction of body height H): shoulders 0.27–0.29 H, head 0.32–0.37 H, ankles
  0.98–1.15 H [3][2]. For H = 1.65 m: shoulders sway ±0.23 m, feet trace a ≈ 1.7–1.9 m circle.
- CoM path is an **ellipse**, not a circle. CoM moves fastest in single-hand phases (peaks
  0.88–0.91 m/s in good gymnasts) and slows in double-hand phases (0.2–0.3 m/s) [1].
  Animation consequence: ease *slightly* through front and rear support, move briskly through
  the ends of the horse.
- Body line is straight (hips extended) throughout; better gymnasts show less body flexion
  (≈ 4–15°) and more shoulder extension in rear support (≈ 18–36°) [3]. Cross-support circles
  (loops) show more flexion in rear support than side circles (≈ 44° vs 27°) because of the
  narrower hand base [4].
- Height: the CoM stays at almost constant height; higher and steadier is better, and faster
  circles go with a higher CoM [5].
- Hand rule: **the hand on the side the legs are approaching lifts; the shoulders lean over the
  other hand**. The hand regrasps as soon as the legs have passed it.

### 1.2 Double leg circle (side support)

Phases for one circle, legs leaving front support toward the gymnast's left (period ≈ 0.95 s):

| Fraction | Phase | Body |
|---|---|---|
| 0.00 | Front support (both hands) | Chest faces the horse, feet out in front of the horse, body straight, slight hollow allowed; shoulders shifted back over/behind the hands (counter-lean). |
| ≈ 0.08 | Left hand releases | Weight goes onto the right arm; shoulders lean right; hips start turning (left hip leads down). |
| 0.08–0.42 | Single-arm "entry" (right hand) | Legs sweep past the left end of the horse, body extended along the horse, lying on its side; fast phase. Left hand regrasps when the legs are behind the horse. |
| 0.42–0.58 | Rear support (both hands) | Back toward the horse, feet beyond the far side; **push hips up, open the hips fully, shoulders extended ≈ 20–35°, head back** [3][2]. The hardest phase to keep straight. |
| ≈ 0.58 | Right hand releases | Weight onto the left arm; shoulders lean left. |
| 0.58–0.92 | Single-arm "exit" (left hand) | Legs sweep past the right end, body side-lying and extended; right hand regrasps. |
| 0.92–1.00 | Front support again | |

Double-hand phases each take ≈ 15–20 % of the circle (flair data: front 14–18 %, rear 11–15 % [6]).

Coaching cues: "long body", "hips up in rear support", "push away from the horse", "lean
against the legs", "head back behind", "square to the horse".
Typical errors: pike in rear support; bent knees or legs apart; hips dropping (feet low);
shoulders staying centred (no counter-lean, circle shrinks); brushing the horse; circles not
square to the horse [14][2].

### 1.3 How to show a circle in a single 2D side view

A circle is a horizontal, conical motion; any single camera sees only its projection:

- **Long-side view** (camera facing the long side; our `pommel_horse` scene with `pommel_l`
  and `pommel_r`): the body is fully visible and parallel to the picture only in the two
  single-arm phases (legs over the left or right end). In front support the body points at the
  camera, in rear support away from it — both strongly foreshortened. The gymnast is seen mostly
  from behind.
- **End view** (camera along the horse): front and rear support read as a profile (prone line to
  one side, supine line to the other), but the single-arm phases are foreshortened.

Neither view can be drawn with a fixed-length rig whose segments rotate only in the picture
plane. Swinging the legs **under** the horse (pendulum) reads as dropped legs and goes through
the horse; swinging them **over** the top reads as a handstand. Both are wrong.

**Recommendation (best faithful single view):** keep the long-side view and add a **yaw
projection** to the renderer for pommel elements: define the body once in its true 3D shape
(straight line, shoulders-to-feet sloping down 10–25°), rotate it about a vertical axis through
the support hand(s) by a yaw angle ψ (0 = feet toward the viewer = front support, 90 = feet to
the viewer's left, 180 = rear support, 270 = feet to the right), and draw each segment with its
horizontal component multiplied by sin ψ (depth = cos ψ). Draw order: near side (feet in front
of the horse, ψ ≈ 270→90 via 0) over the horse; far side (ψ ≈ 90→270 via 180) behind the horse
and greyed. Shoulders offset ±0.23 m opposite the feet. This gives a true windshield-wiper sweep
whose length shrinks to almost nothing as the legs pass in front and behind the horse — exactly
what a coach sees from the judges' table.

**Fallback if no projection exists:** do not animate the sweep. Make a static pictogram: main pose
= single-arm phase (body extended along the horse over one end, free hand lifted, shoulders
leaning over the support hand, hips open), ghost = the mirror single-arm pose at the other end,
plus a horizontal elliptical arrow around the pommels (like the twist ring) to say "circle".
Note the limitation in `work/notes-*.md`.

**Animation recipe (with yaw projection), one circle, period 0.95 s:**

1. ψ = 0, both hands (contact `han` on one pommel; the other hand rests on the other pommel).
   Body straight, slope 15°, shoulders 0.2 m behind the hands (toward the horse's far side).
2. t = 0.08 s: release the hand on the leading side, raise it ~15 cm; new contact on the support
   hand. Shoulders start shifting over the support hand.
3. t = 0.24 s: ψ = 90 (body fully side-on, maximum visible length, shoulders 0.23 m over/beyond
   the support pommel). **Poster frame.**
4. t = 0.40 s: regrasp; ψ ≈ 160.
5. t = 0.48 s: ψ = 180, rear support: hips pushed up (body slope reduce to ~10°), head back.
6. t = 0.56 s: release the other hand; new contact.
7. t = 0.71 s: ψ = 270 (mirror of key 3).
8. t = 0.87 s: regrasp; t = 0.95 s: ψ = 360 = key 1.
Ease in/out slightly around ψ = 0 and 180. Loop 2–3 circles for a preview.

### 1.4 Flairs (Thomas flair)

- A circle with the legs **straddled** (Kurt Thomas, 1976) [8]; hips higher and more open than
  in circles, so the legs clear the horse with more amplitude and the hands can move along the
  horse. Mechanics are almost identical on pommel horse and floor [7][6].
- Timing: 1.08–1.13 s per flair; front support 14–18 %, rear support 11–15 %, single-arm phases
  32–41 % each (more time on one side than the other for a given rotation direction) [6].
- Body: straddle 120–180° (*est.*; wider is better), hips lifted up and forward, the trunk more
  upright than in circles (shoulders high above the hands, arms near vertical), hips
  pressing up in rear support; the low leg "kicks" through the end of the horse.
- Errors: closing the straddle in front/rear support, hips sinking, piked hips, legs hitting the
  horse, uneven leg heights.
- Recipe: as 1.3 with legs at ±60–90° from the body line (straddle), CoM path larger, period
  1.1 s; poster = single-arm phase with the straddle wide open and seen flat.

### 1.5 Scissors (front and rear)

- Built from single-leg pendulum swings in straddle support (one leg in front of the horse, one
  behind). Progression: straddle swings → false scissors → scissors.
- Front scissor: in support astride the horse with one leg forward, swing the legs sideways; at
  the top of the swing the hip on that side rises, the hand on the rising side lifts, the hips
  turn about a quarter toward the rising side and the legs **switch** (front leg goes back, back
  leg comes forward) while still wide apart, then swing down to the other side.
  Rear scissor is the same with the back to the horse.
- Standards: at the top the **lower hip at least at support-elbow height**, legs **≥ 90° apart**,
  upper leg not piked forward [14]. Arms straight, shoulders lean over the support hand.
- Timing: one scissor ≈ one swing, 0.8–1.0 s (*est.*); the switch is quick (≈ 0.15–0.2 s) at the
  top dead point.
- Errors: low hips, legs closing during the switch, piking the upper leg, bent knees.
- 2D: best in the **end view** (profile of the leg switch) or long-side view with the body
  tilted to one end: key (a) swing up — body inclined ~45–60° from vertical toward one end,
  hips above support elbow, legs split ≥ 90°; (b) switch at the top; (c) swing down; (d) mirror.

### 1.6 Kehres and travels; Magyar and Sivado

- **Kehre** (rear-support turn/travel): during a circle, in rear support, the gymnast moves one
  hand to a new place (pommel ↔ leather/end) with a quarter turn of the body, so the circle
  continues in a new position along the horse. *Kehre in* travels from the end inward onto the
  pommels; *kehre out* travels outward. The front-support counterpart is the Stöckli family.
  Age-group example: "on the 3rd circle, kehre 90° to a downhill loop" [14].
- Side travel: the second hand must take support as soon as the legs pass the end of the horse
  [14] — the travel is continuous, not a stop-and-go.
- **Magyar travel**: crosswise circling travel down the whole horse (Zoltán Magyar, 1975) [17];
  **Sivado** is its mirror, travelling the other way [16]. The body stays fully extended and the
  hips square through the whole travel; touching the middle leather with the hands is part of
  the full version (going pommel to pommel directly downgrades it) [16]. Typically three circles
  from one end to the other (*est.*, ≈ 3 s).
- Errors: skew (hips not square) [16], piking during the hand shifts, short circles, legs apart.
- 2D recipe: long-side view with yaw projection; the support contact jumps one hand-width
  (≈ 0.3–0.4 m) per half circle along the horse; keep the circle rhythm unchanged while
  travelling.

### 1.7 Spindles

- A spindle is a full turn of the body (1/1) about the vertical axis performed within one or two
  circles, usually in cross support on one pommel, the leather or the end; the hands are placed
  close together and each placement "catches" the turn. In the Magyar spindle the body turns
  opposite to the direction the legs circle [17]. The Magyar spindle is faster with smaller hip
  angle changes (≈ 1.3 s) than the flair spindle (≈ 1.5 s, much larger arm lift) [8].
- Standards: legs together and straight (Magyar) or wide (flair), body extended, rhythm
  unchanged.
- 2D: yaw-projected circle with the whole figure additionally turning once; contacts swap 3–4
  times. Fallback: pictogram with circle arrow plus a turn arrow.

### 1.8 Russian wendeswings

- The body, held **extended and nearly horizontal**, orbits around closely placed hands (on one
  pommel, the leather, the end, or the floor/mushroom), the chest staying toward the hands so the
  body turns like a clock hand (180°, 360°, 720°, 1080°). The hands walk round in step,
  ≈ 90–180° of turn per placement (*est.*). Shoulders counter-lean opposite to the legs exactly
  as in circles.
- Rule context: a limited number of Russians is allowed per routine (forum quote of FIG rule) — not
  needed for animation.
- Errors: piked hips, legs dropping, hands lagging (body "twists" against the shoulders).
- 2D: yaw projection with the support moving round a small circle (≈ 0.2 m diameter); 360° in
  ≈ 1 s (*est.*).

### 1.9 Handstand elements and dismounts

- **Press/swing to handstand from circles or flairs**: from a flair the hips are lifted over the
  support with straight arms and straddled legs, pass through a straddled pike, then legs join
  in a straight handstand (shoulders open, hips over shoulders over hands). Avoid pausing:
  momentary handstands are shown, held only if the element requires it.
- **Loop / flank dismount** from cross support: hips must stay above elbow height; landing in
  side stand beside the horse, next to the support arm [14].
- **Handstand dismount**: from handstand lower sideways/turn to land beside the horse with
  control; body straight on the way down.
- Landing: feet together, knees and hips absorb (≈ 30–60° knee bend *est.*), arms to the side or up,
  stand still. Landing height: from support on a horse ≈ 1 m above the mat.
- Recipe (loop dismount, long-side view): last loop in cross support → turn hips over the
  support hand with body extended, hips above the elbow → release, push away → land beside the
  horse, absorb 0.3 s, stand.

---

## 2. Strength and hold elements (floor, rings, parallel bars)

### 2.1 The one physical rule

In a static hold the CoM is **vertically over the hands (support) or under the hand/ring
contact (hang)**. On rings this is absolute — otherwise the cables swing. On floor and bars the
wrists can tolerate a small offset only. Everything else (arm angle, lean, body height above
the hands) follows from this rule and the body proportions [10]. Shoulder and wrist control are
the key quality parameters in the planche [10].

CoM location for a straight body: about 55 % of body height from the feet (around the lower
abdomen/hip). Distance shoulder → CoM along the body ≈ 0.40–0.45 m for H ≈ 1.65 m; arm length
(shoulder to wrist) ≈ 0.55 m. Hence the arm inclination θ from vertical satisfies
sin θ ≈ (shoulder–CoM offset) / arm length.

### 2.2 L-sit, straddle L, V-sit (Manna as extension)

- **L-sit**: legs horizontal (± 15°) and together, hips flexed ~90°, arms straight and vertical,
  hands beside or slightly in front of the hips, trunk ≈ 5–15° forward of vertical so the CoM
  (pulled forward by the legs) is over the hands, shoulders pushed down (no shrug), rings turned
  out [14].
- **Straddle L**: same, legs straddled at least at elbow height [14].
- **V-sit** (PB): legs **vertical** (between vertical and 45° is a fault) [14]; trunk leaning back
  ~40–50°, hands under the CoM.
- Entries: back uprise/kip/muscle-up to L on rings (muscle-up must be one continuous action
  without kick [14]); swing forward to L/V-sit on PB [14]; lower to sit and lift (floor) [14].
  Exits: press to handstand (most common), lower to support/hang.
- Errors: legs below horizontal, bent arms, legs resting on arms (straddle L), rings turned in.
- Engine hint (facing +1, legs to +x): L-sit `torso ≈ 8`, arms `[180,180]`, legs `[90,90]`,
  head 0. V-sit `torso ≈ 315`, legs `[0,0]` to `[5,5]`, arms `[180,180]`.

### 2.3 Planche (support scale) and straddle planche — floor, PB, rings

- Body straight and horizontal (credit lost above 20° over horizontal [10]; aim 0–5°), face down,
  legs together (planche) or wide straddle (straddle planche), arms straight.
- **Lean**: shoulders well in front of the hands, scapulae pushed apart (protraction) and down
  (depression) [20]. Arms inclined ≈ 40–50° from vertical (shoulders ≈ 0.35–0.4 m ahead of the
  wrists) with legs together; the straddle brings the CoM toward the shoulders, so the lean is
  smaller (≈ 35–40°) *derived from 2.1*. Body height above the hands ≈ arm length × cos θ
  (≈ 0.35–0.45 m). Fingers point sideways/back on floor and PB (*est.*).
- Entries: (a) lower from handstand with straight arms — shoulders advance as the legs come down
  to horizontal; (b) from support/front support lean forward and lift the legs (floor, PB);
  (c) from swing: back uprise or swing stop into planche (rings, PB); (d) from Maltese by narrowing
  the arms. Exits: press back to handstand; lower to front support/support.
- Errors: hips piked or sagging, body above horizontal, bent arms, insufficient lean (falls back),
  head lifted, legs apart (planche) or uneven straddle.
- Engine hint (head to +x, face down, facing +1): `torso 90`, legs `[270,270]`, planche arms
  `[225,225]` (range 220–232), straddle planche arms ≈ `[215,215]` with legs at ≈ 245 / 295
  only if the engine shows the straddle (side view hides it; prefer drawing legs together and
  noting "straddle" in the spec); head 0.

### 2.4 Maltese and swallow (rings)

- In German usage the "Schwalbe" (swallow) is the support scale between the rings [15];
  English "swallow" and "Maltese" are commonly used for the same hold: body horizontal and face
  down at ring height, arms straight and spread wide to the sides, rings at about hip level [19].
  Treat them as one element unless our own element data says otherwise.
- Same CoM rule as the planche, but the wide arms lower the body to ring level and the shoulders
  advance less.
- Entries: lower from handstand (straight arms, slow); back uprise to Maltese; from planche by
  spreading the arms; exits: press to handstand (straight arms).
- Errors: body above/below horizontal, piked hips, bent elbows, arms too high (turns into a
  cross shape), swinging cables.
- 2D: side view shows the defining fact (horizontal body at ring height). The spread arms are out
  of the picture plane; draw them pointing back toward the hips just under the trunk
  (≈ 245–255 with head to +x) and hands at hip level. Optional front-view ghost for clarity.

### 2.5 Cross (iron cross) and inverted cross (rings)

- **Cross**: body vertical and straight, arms straight and **horizontal (90° abduction)**,
  rings at shoulder height, hands in line with shoulders; held 2 s [11][12][13]. Deviation from
  90° at the shoulders: ≤ 15° / ≤ 30° / ≥ 45° = 0.1 / 0.3 / 0.5 [13]. Elite: low variability and
  near-symmetric shoulders [11].
- **Inverted cross**: same arm line, body inverted and vertical (handstand line), shoulders at
  ring level.
- Entries (cross): slow lowering from support (≈ 1.5–2 s; whole lowering+hold ≈ 4 s [11]); kip to
  cross; forward/backward roll to cross from swing; from L-cross. Exits: press up to support,
  to L-cross, or lower to hang.
- Entries (inverted cross): slow lowering from handstand; exit: press back to handstand.
- Errors: hands above shoulder line (arms not horizontal), bent elbows, piked or arched body,
  legs apart, asymmetric arms, cable swing.
- 2D: **front view** (`"view": "front"`, `front: true`). Cross: `torso 0`, arms horizontal
  (`[90,90]` and `[270,270]`), legs `[180,180]`. Inverted cross: `torso 180`, legs `[0,0]`,
  arms horizontal.

### 2.6 Back lever and front lever (rings, bars)

- **Back lever** (hang scale rearways): face down, body horizontal and straight, head in line,
  arms straight behind the body; rings above the CoM (near the hips) [14]. Arms ≈ 45° from
  vertical toward the feet (shoulder hyperextension ≈ 45°), body ≈ 0.35–0.4 m below the rings.
  Entry: lower slowly from inverted hang (standard) [14], or from skin-the-cat; exit: pull back
  to inverted hang or lower to skin-the-cat/hang.
- **Front lever** (hang scale frontways): face up, body horizontal and straight, arms straight
  in front of the chest ≈ 45° from vertical toward the feet (shoulder flexion ≈ 45° with strong
  pull-down), rings above the CoM. Entry: lift from still hang with straight arms or lower from
  inverted hang [15]; exit: lower to hang or pull to inverted hang.
- Errors: piked hips (most common), arched back, legs below horizontal, bent arms, head dropped
  or lifted.
- Engine hint (head to +x): back lever `torso 90`, facing +1, arms `[315,315]`, legs
  `[270,270]`. Front lever `torso 90`, facing −1, arms `[315,315]`, legs `[270,270]`. Validate
  the shoulder-extension limit (≤ 75°) on the back lever.

### 2.7 Press to handstand — straight-arm (straddle/pike) and bent-arm

Straight-arm straddle press (floor, PB, rings):

1. Start: straddle L / L-sit / straddle stand with hands on floor (0.0 s).
2. **Lean first**: shoulders move forward of the hands (arms ~20–30° from vertical), hips rise
   behind and above the hands; feet leave the floor by compression, not by a jump (0.0–0.6 s).
   Loading the shoulders before the hips move is a common learning fault [18].
3. Compressed pike: hips over the hands and above the shoulders, legs wide and piked (hip angle
   ≈ 30–50°), trunk near inverted (0.6–1.2 s).
4. Open: hips stack over shoulders over hands, the shoulder lean returns to vertical, legs rise
   and close (1.2–1.8 s).
5. Handstand: straight line, shoulders fully open, hold 2 s (rings 5 s in compulsories [14]).

Standards: continuous smooth press, straight arms throughout (bent arms 0.3–0.5), no excessive
shoulder advance (PB) [14]; on rings no contact with straps, rings turned out [14].

Bent-arm press (Pless/"Heben mit gebeugten Armen"): from L-support bend the elbows to ≤ 90° while
the body tips forward into a bent-arm support, then lift the body (piked or straight) to
handstand and straighten the arms; uniform rhythm, no swing at the start [15].

Pike press: as straddle but legs together; needs more compression and hamstring flexibility.

Errors: jumping into the press, bent arms, legs dragging, rhythm stops, arched landing in
handstand, overshooting the lean.

### 2.8 Slow rolls (rings) — lower confidence, coaching knowledge

- Slow roll backward to handstand: from hang (or back lever), pull with straight arms through
  inverted hang, roll the shoulders back over the rings into support and press on to handstand
  in one continuous slow movement (2–4 s *est.*), rings turned out, no swing.
- Slow roll forward: from handstand or support, lower forward through support to hang/L-sit or
  into a hold (cross/Maltese) with control.
- 2D: side view; key every ~0.5 s so the CoM stays under/over the rings at every key (no swing).

### 2.9 Rings specifics

- Rings handstand is a balance on two moving pendulums; shoulders fully open, body straight, rings
  turned out [21][14].
- Every strength transition is "free of the straps", with straight body and no swing [14].
- Swing-to-strength entries (back uprise to planche/Maltese, kip to cross) arrive with zero
  residual swing; let the body decelerate within ~0.3 s.

---

## 3. Floor — non-acrobatic MAG elements

### 3.1 Circles and flairs on floor; Thomas flair

- Same mechanics and tempo as on the pommel horse [7][6]: hands flat on the floor shoulder-width
  apart (or one hand at a time), shoulders high over the hands, legs straight and **never touching
  the floor** during the circle [14]. Flair ≈ 1.1 s [6].
- "Thomas" on floor in the non-acrobatic sense = Thomas flair (straddled circle); not the Thomas
  salto (acrobatic).
- Age-group detail: a half circle on floor must show extension and be free of the floor; ends in
  rear support with arms and body extended, head up [14].
- 2D: identical to 1.3 (yaw projection around the hands at floor level); feet travel ~10–30 cm
  above the floor; hips higher than in pommel circles for flairs.

### 3.2 Russian circles on floor

- Russian wendeswings with the hands close together on the floor (or on a mushroom/pommel insert):
  extended body, legs together, circling around the hands with counter-lean. Recipe as 1.8 with
  feet just clear of the floor.

### 3.3 Press elements on floor

- Straddle press to handstand (2.7), pike press, press from planche to handstand, "flair to
  handstand" press. Age-group floor routines require a straight-arm straddled press held 2 s
  [14]. Typically followed by a roll or stoop down.

### 3.4 Kip-up (neck kip) — coaching knowledge, *est.* timings

1. From sitting, roll back onto the shoulders with legs piked over the face (hip angle ≈ 40–60°),
   hands flat beside the head, fingers toward the shoulders (0.0–0.35 s).
2. Whip: explosive hip extension aimed forward-up (≈ 45° above the floor), arms push at the same
   moment (0.35–0.6 s).
3. Arch: short airborne arch, hips high, knees begin to bend under the body (0.6–0.8 s).
4. Land on both feet with bent knees, hips pushed forward over the feet, rise to stand
   (0.8–1.1 s).
Errors: pushing before the hips extend, legs whipped straight up (no forward rotation), landing in
sit or squat with hips behind the feet. Kip principle (rapid hip flexion → extension) as in all
kips [22].

---

## 4. Uncertainties and choices taken

- Magyar vs Sivado direction (forward vs backward) is not stated in the sources found; [16] only
  says one mirrors the other. Use our element data to decide and note it.
- Swallow = Maltese naming is regional; follow our element description if it distinguishes them.
- Lever and planche arm angles are derived from statics, not measured; body types change them
  [10].
- No measured data found for scissor timing, Russian timing, kip-up phases or rings transitions:
  all marked *est.*.
- Circle representation needs a renderer change (yaw projection) to be faithful; without it,
  pommel circles should be static pictograms.

## 5. Sources

1. Fujihara T., Yamamoto E., Gervais P. (2015). Toward an ideal performance of circles on pommel
   horse — centrifugal force and mass-centre velocity. ISBS Proceedings, Poitiers.
   https://ojs.ub.uni-konstanz.de/cpa/article/view/6547
2. Fujihara T., Gervais P. Head positions are related to the performance quality of circles on
   pommel horse. ISBS Proceedings. https://ojs.ub.uni-konstanz.de/cpa/article/view/5540
3. Fujihara T., Gervais P. (2011). Influence of a suspended aid on the amplitude variables of
   circles on pommel horse. ISBS Proceedings 29. https://ojs.ub.uni-konstanz.de/cpa/article/view/4818
4. Fujihara T., Gervais P. Hip moment profiles during circles in side support and in cross
   support on the pommel horse. ISBS Proceedings. https://ojs.ub.uni-konstanz.de/cpa/article/view/3379
5. Motoyuki [surname illegible in source PDF], Nishiwaki K., Yamawaki K. et al. An evaluation of
   performance of a double-leg circle on a pommel horse, and a desirable performance proposal.
   ISBS Proceedings. https://ojs.ub.uni-konstanz.de/cpa/article/view/6937
6. Prassas S., Ariel G., Tsarouchas E. Temporal characteristics of Thomas flairs on the pommel and
   floor. ISBS Proceedings. https://ojs.ub.uni-konstanz.de/cpa/article/view/3328
7. Prassas S., Ariel G., Ostarello J., Tsarouchas E. (2006). Thomas flaires on the pommel and
   floor: a case study. ISBS 2006, Salzburg. https://ojs.ub.uni-konstanz.de/cpa/article/view/107
8. Čuk I., Karácsony I. Thomas flaire with 1/1 spindle versus double leg circle with 1/1 spindle.
   ISBS Proceedings. https://ojs.ub.uni-konstanz.de/cpa/article/view/2968
9. Fujihara T., Fuchimoto T., Gervais P. (2009). Biomechanical analysis of circles on pommel horse.
   Sports Biomechanics 8(1), 22–38. https://doi.org/10.1080/14763140802629974 (cited via [1][4][5];
   per-circle 0.93–1.00 s from Brüggemann 1994 and Karácsony & Čuk 1998 as summarised in search
   results of that literature).
10. Wang X., Shan G. (2023). Insights from a nine-segment biomechanical model and its simulation for
    anthropometrical influence on individualized planche learning and training in gymnastics.
    Bioengineering 10(7), 761. https://doi.org/10.3390/bioengineering10070761
11. Carrara P., Amadio A.C., Serrão J.C., Irwin G., Mochizuki L. (2016). The cross on rings performed
    by an Olympic champion. Rev. Bras. Educ. Fís. Esporte. https://doi.org/10.1590/1807-55092016000100071
12. Carrara P., Exell T., Serrão J., Amadio A., Mochizuki L., Irwin G. (2015). Asymmetry analysis of
    cross on gymnastics training and competition rings. ISBS Proceedings, Poitiers.
    https://ojs.ub.uni-konstanz.de/cpa/article/view/6525
13. Carrara P., Irwin G., Exell T., Serrão J.C., Amadio A.C., Mochizuki L. (2024). Kinematic analysis
    of cross on training and competition rings. Science of Gymnastics Journal 16(1), 15–28.
    https://doi.org/10.52165/sgj.16.1.15-28
14. FIG — Age Group Development Programme, Men's Artistic Gymnastics (compulsory routines,
    performance expectations, testing programmes).
    https://www.gymnastics.sport/site/pages/education/agegroup-mag-manual-e.pdf
15. Deutscher Turner-Bund — Athletische Tests Gerätturnen männlich (Stand 15.11.2020).
    https://www.badischer-turner-bund.de/fileadmin/user_upload/DOKUMENTE/03-Turnsport/Geraetturnen/Spitzensport_GTm/DTB_Athletische_Tests_November2020.pdf
16. Neutral Deductions — Magyar and Sivado. https://www.neutraldeductions.com/article/magyar-and-sivado
17. Wikipedia — Zoltán Magyar (Magyar travel, Magyar spindle definitions).
    https://en.wikipedia.org/wiki/Zolt%C3%A1n_Magyar
18. Marmerstein Y. "Order of operations" in press handstand (coaching blog).
    https://yurimarmerstein.squarespace.com/blog/2014/2/16/order-of-operations-in-press-handstand
19. GymnasticBodies forum — Maltese (naming: "swallow" as the original English name).
    https://www.gymnasticbodies.com/forum/topic/904-maltese
20. GymnasticBodies — Planche lean (scapular protraction and depression).
    https://gymnasticbodies.com/?p=203649
21. Loughborough University Sports Biomechanics — rings research (rings handstand, longswing;
    Yeadon, Rosamond & Hiley 2012). https://lboro.ac.uk/microsites/ssehs/biomechanics/gymnastics/rings.html
22. Wikipedia — Kip (artistic gymnastics). https://en.wikipedia.org/wiki/Kip_(artistic_gymnastics)

Not used, per brief: Upgrade Gymnastics, GymPro Atlas.
