# Technique reference — Acrobatics, Dance and Vault (floor, beam, vault)

Animator's reference for how coaches teach these movements. Women's artistic gymnastics
(WAG) is the main case, with men's (MAG) notes where they differ. Numbers are approximate and
are meant to keep animations plausible. They are not judging criteria.

Confidence tags on every number:
- **[M#]** measured in a biomechanics study (source # in the list at the end)
- **[O#]** official federation text (FIG or USA Gymnastics compulsory text)
- **[C]** coaching consensus (manuals, federation progressions, common coaching cues)
- **[D]** derived by me from measured values with ballistic physics (t = 2·vz/g, h = vz²/2g)
- **[E]** animator estimate where no source gives a figure. Change these first if a coach disagrees.

Angle conventions in this document (anatomical, not the engine's screen angles):
- **Hip angle**: trunk to thigh. 180° = straight body, < 180° = flexed (pike/tuck), > 180° = arched.
- **Knee angle**: 180° = straight.
- **Shoulder angle**: trunk to upper arm. 0° = arms down by the sides, 180° = arms overhead in
  line with the trunk ("open shoulders", "arms by the ears").
- **Take-off/touch-down angle**: angle between the floor and the line from toe to centre of mass
  (CM). 90° = CM straight above the foot.
- In the engine (`ANIMATOR.md`), torso 0 = upright and 180 = inverted. "Inverted" or
  "handstand" below means torso ≈ 180.

---

## 0. Rules that apply to every family (what makes a coach say "that's wrong")

1. **Rotation is created on the ground and only managed in the air.** Angular momentum is fixed
   once the feet or hands leave the surface. In the air the gymnast can only change *speed* of
   rotation by changing shape: a tuck spins about 2–3× faster than a layout [C]. Never add
   rotation in flight that the take-off pose did not prepare for.
2. **The CM follows a parabola in flight.** Horizontal speed stays constant and vertical speed
   decreases with gravity. Flight time comes from vertical take-off speed. 2.5 m/s gives
   ≈ 0.5 s, 3.5 m/s gives ≈ 0.7 s, 4.2 m/s gives ≈ 0.85 s plus the drop to landing height [D].
3. **Contacts are short and stiff in good technique.** A foot rebound in tumbling lasts
   0.12–0.13 s in elite gymnasts; beginners take 0.18 s [M2, M3]. Board contact is 0.09–0.15 s
   [M6, M7, M8]. At 30 fps that is 3–5 frames. A long, deep, soft contact before a salto reads as
   "beginner".
4. **"Block": leaning against the direction of travel turns run speed into height.** Feet (or hands) land
   *ahead* of the CM along the line of travel. The surface pushes back, horizontal speed drops,
   vertical speed rises and the body pivots over the contact. Example: double-back take-off,
   horizontal speed 4.3 → 3.2 m/s while vertical speed reaches 4.2 m/s, in 0.13 s [M3].
5. **Arms by the ears, head neutral.** In almost every acro skill the arms stay in line with the
   trunk (shoulder angle ≈ 170–180°). The head stays between the arms without throwing back or
   dropping forward. Head throw is the single most common error coaches name [C, M5].
6. **Body shapes are tight.** Legs together, knees and toes straight unless the skill says
   otherwise. "Dish" (hollow: slightly rounded front, ribs in, hip angle ≈ 170°) and "arch"
   (hip/back > 180°) are the two working shapes. Pikes and tucks are sharp, not sloppy halfway
   positions.
7. **Landing = absorb, then show.** Land on the balls of the feet, flex ankles, knees and hips
   together, keep the chest up over the hips, arms forward-up, then stand and present.
8. **Beam is the same technique on a 10 cm line.** Hands go side by side on top of the beam
   (thumbs on top), feet land in line, the skills are smaller and more vertical, eyes stay on the
   beam, and every pose must keep the CM over the beam.

---

## A. ACROBATICS — floor and beam

### A1. Run and hurdle (entry to tumbling)

**Purpose**: build horizontal speed and set the body for the round-off or front handspring.

| Phase | Body | Timing |
|---|---|---|
| Run (2–5 steps on floor) | Upright sprint posture, slight forward lean, arms pumping | ~0.3 s per step [E] |
| Hurdle (a long, low skip) | Push off from one foot. The other knee lifts forward, then the leg reaches far ahead. Arms swing up to overhead, by the ears. Trunk upright. | flight ≈ 0.25–0.35 s [E] |
| Lunge | Land on the front foot, knee bent ≈ 100–120° [E], trunk leans forward. Arms, trunk and back leg form one straight line. | contact ≈ 0.2 s [E] |

**Cues**: "long and low", "arms up by the ears before the step down", "reach far". The hurdle
must not go *up*, because height in the hurdle wastes speed [C].
**Errors**: high bouncy hurdle; arms swinging down or sideways; short step that makes the
gymnast bend forward to the floor instead of reaching beyond the knee [C, source 11]; turned-out
front foot, which sends the round-off off-line [11].

### A2. Round-off

**Purpose**: turn forward running speed into backward travel with a ¼ turn, finishing on two feet
ready to rebound.

| Phase | What the body does | Angles / timing |
|---|---|---|
| 1. Lunge and reach | From the hurdle step into a deep lunge. Chest low, arms reach far forward. Body stays front-facing as long as possible. | front knee ≈ 100–120° [E]; shoulder ≈ 180° |
| 2. First hand | First hand goes down far ahead, turned roughly sideways. The back leg kicks up hard ("needle kick") as the hand lands, both at the same instant [11]. | — |
| 3. Second hand + ¼ turn | Shoulders turn late. The second hand is placed in front of the first with fingers pointing back toward the start ("T" hand position) [11, M1]. Legs pass the vertical in a wide split. | hands-on ≈ 0.25–0.35 s total [E] |
| 4. Snap / repulsion | Just after vertical, the legs snap together fast. The shoulders push the floor (block) while the body changes from slight arch to dish. Short flight. | hip goes from ≈ 190° to ≈ 160–170° [E] |
| 5. Landing on two feet | Lands on the balls of both feet, arms by the ears, body dished, ready to rebound | rebound 0.12–0.13 s [M2, M3] |

**Where the feet land depends on the next skill** [11]:
- round-off alone: feet under the hips;
- before a flic-flac: feet slightly *behind* the CM along the line of travel (under/in front of
  the hips from the gymnast's own view), so the body can fall backward;
- before a salto: feet *ahead* of the CM along the line of travel (behind the hips from the
  gymnast's view). Touch-down angle ≈ 64–69° from the floor [M3], so the body blocks and pivots
  upward.

**Cues**: "kick hard as the hand goes down", "second hand points back", "snap after vertical,
not before", "head stays in". **Errors**: hands placed too close to the feet (piked entry); legs
snapping before vertical (weak round-off); piked or squatting landing with bent knees; landing
twisted or on one side because of wrong hand placement [11]; head and chest lifted on entry [11].

**Beam round-off (dismount entry)**: short walk and hurdle onto the ball of the front foot, then a
"mountain climber" entry. Hands go sideways or slightly turned in on top of the beam, about
shoulder-width apart. Shoulder and hip angles stay open and the head is aligned. The gymnast
lands on the mat at the beam end [O9].

### A3. Back handspring (flic-flac)

**Purpose**: travel backward hands-to-feet with a short flight in each half. In series it is
both an accelerator and a connector.

| Phase | Body | Angles / timing |
|---|---|---|
| 1. Set / sit (standing version only) | Arms swing down-back. Hips move down **and back** "as if sitting on a chair". Knees stay roughly over the feet. Shoulders stay over the knees or slightly behind. | knees ≈ 90–110° [E]; arms by the thighs or behind |
| 2. Jump back | Legs extend hard while the arms swing forward-up-back past the ears. The jump goes backward with an upward component, not straight up. | contact ≈ 0.2–0.3 s standing [E]; from a round-off it is a rebound of ≈ 0.12 s [E from M3] |
| 3. First flight | Stretched-to-slightly-arched body. Head neutral between the arms, eyes find the floor late. | body ≈ 30–45° below horizontal at hand contact [E] |
| 4. Hand support | Straight-arm contact, hands shoulder-width, shoulders open. Under load the elbows flex 15–42° and the wrists extend 24–59° [M4]. Legs pass overhead. | ≈ 0.12–0.20 s [E] |
| 5. Snap down | Shoulders push. Hips flex fast from arch to dish, legs whip down. | hip ≈ 200° → ≈ 165° [E] |
| 6. Second flight + landing | Short flight. Feet land with the body dished, arms by the ears or slightly in front. Next element follows immediately. | landing angle like the round-off rule |

**Cues**: "sit back, not down", "arms by the ears", "keep the head in" [5], "snap through
shoulders". **Errors**: throwing the head; jumping straight up (no travel); bent arms, collapsing
shoulders; piking down with bent knees and no flight [5]; arms swinging off to one side, which
twists the body [5].
**Beam flic-flac**: arms circle back from overhead, both feet push off, hands side by side on
the beam, legs may split for a step-out. The finish on two feet is a snap-down to a straight
stand in relevé [O9]. Everything is more vertical and smaller than on floor.

### A4. Front handspring

**Purpose**: forward hands-then-feet rotation with flight after the hands. It is the entry for
front tumbling and for vault.

| Phase | Body | Angles / timing |
|---|---|---|
| 1. Hurdle → lunge | As A1. Arms high through the hurdle. | — |
| 2. Reach | Long lunge. Hands reach far forward while the back leg kicks up. Arms stay by the ears. | shoulder ≈ 170–180° at hand contact [C] |
| 3. Block | Straight arms. The shoulders push hard backward-upward. The body is already nearly straight and passes vertical. | contact ≈ 0.12–0.2 s [E] |
| 4. Flight | Tight, stretched to slightly arched body. Arms stay overhead, eyes on the hands or floor. | — |
| 5. Landing | Two feet (or a step-out on beam). Arms overhead, chest up or slightly arched. Before a front salto the feet land slightly ahead of the CM and the arms finish straight overhead [O9, 18]. | — |

**Errors**: bent arms; arms dropping forward in flight; "diving" with closed shoulders;
landing in a deep squat; piking (hip < 160°) after the block [C].

### A5. Walkovers (front and back)

Slow, continuous, flexibility-based. There is no flight and the hands support the body.

**Front walkover** [O9]: step into a lunge, arms overhead. Hands go down shoulder-width while
the back leg lifts. The legs pass through a split handstand of ≥ 180°, shoulders open, eyes on
the hands. The shoulders keep opening past the hands while the upper back arches and the first
leg lowers to a bridge on one foot. Hips push forward, the hands push away, and the gymnast
stands up with arms overhead.
**Back walkover** [O9]: one leg lifts forward and keeps lifting in one continuous motion. The
upper back arches and the arms reach back to the floor or beam. The support foot pushes off,
the shoulders move over the hands, and the legs pass a split handstand of ≥ 180°. The first leg
steps down and the other closes.
**Timing** [E]: about 1.5–2.0 s total. The split handstand is the "hit" pose at ≈ 50%.
**Errors**: bent legs; split under 180°; closed (bent) shoulders; arch only in the lower back
instead of the upper back; stopping or jerking (the motion must be continuous) [O9].

### A6. Aerials (side aerial and front aerial / aerial walkover)

There are no hands. Rotation comes from a fast trunk drop combined with a powerful back-leg
swing from a deep lunge [C, 15].

| Phase | Body | Timing [E] |
|---|---|---|
| 1. Run/step + low hurdle | Arms up or forward | 0.4–0.6 s |
| 2. Lunge | Deep lunge on the front leg (knee ≈ 90–110°). The chest drops fast toward the front knee, arms swing down and back past the hips. | 0.15–0.25 s |
| 3. Take-off | The support leg extends while the back leg swings up straight and fast in a wide split (≥ 180°). The chest rotates *under*. Side aerial: rotation is sideways around the front-back axis. Front aerial: rotation is forward. | — |
| 4. Flight | Legs in a split pass overhead. The trunk is horizontal to inverted, head neutral, arms by the sides or out. | ≈ 0.35–0.45 s |
| 5. Landing | The swing leg lands first, under the hips, in demi-plié. The trunk comes up *last*. The second leg steps down. | 0.3 s |

**Cues**: "chest down fast, leg up fast", "drive the back leg", "stay long". **Errors**:
lifting the chest early (no rotation); bent swing leg; narrow split; landing on both feet at once;
landing with the trunk folded forward. On beam, aerials travel very little and the eyes look at
the beam [C, M15].

### A7. Back salto (tucked, piked, stretched)

**Take-off (from round-off or flic-flac)**: arms already overhead, body stretched, the
rebound is short and stiff. Feet land ahead of the CM: touch-down angle ≈ 64–69° and take-off
angle ≈ 82–89°, nearly vertical [M2, M3]. Knee ≈ 160° at take-off, shoulder ≈ 130° (arms up
and slightly forward) [M3]. Rotation comes from the block, from the hips lifting, and from the
arms stopping up high, *not* from throwing the head or shoulders back [C, M2].
Measured performance:
- youth gymnasts: contact 0.13 s, flight 0.73 s, CM peak ≈ 137% of body height, vz 2.6 m/s [M2];
- elite after round-off and flic-flac to a stretched salto: vz 4.5 m/s, CM rise 1.2 m [M10].

| Shape | Body in flight | Key timing (fraction of flight) [E] |
|---|---|---|
| **Tucked** | Knees pull to the chest after take-off (hips and knees < 90°, tighter is better), hands on the shins. | stretched until 0.15, tuck closed by 0.30, open ("kick out") at 0.65–0.75 when the feet pass over the head and point to the floor |
| **Piked** | Legs straight. Hip angle closes to ≈ 30–60° with the hands near the knees or the arms beside the legs. | pike closed by 0.30, open by 0.70 |
| **Stretched (layout)** | Body straight or slightly hollow, hip ≈ 170–180°. Arms by the thighs or overhead. Rotation is even through the whole flight. | no shape change. A slight hollow at landing. |

**Standing back tuck**: the arms swing from overhead down past the hips and back up
(about 270° of arm circle) while the knees bend to ≈ 90–110°, then extend fully [M5, E].
**Beam back tuck** [O9]: bend and extend the knees, jump upward-backward, lift hips and knees
to a tuck of at least 90° at hips and knees, land in demi-plié with the chest up.
**Errors**: throwing the head; leaning back at take-off (low, travelling salto); a low tuck with
knees apart; late kick-out (landing short and sitting down); early opening; bending the knees
instead of lifting the hips [M11].

### A8. Twisting saltos (when and how the twist starts, the arm wrap)

**Mechanics** (Yeadon) [M12, M13]:
- *Contact twist* starts while the feet are still on the floor. It is effective, but the
  gymnast is usually still twisting at landing.
- *Aerial twist* starts in the air. Asymmetric arm movement tilts the body's long axis away
  from the somersault plane, and the tilt converts part of the somersault into twist. Removing
  the tilt stops the twist, which gives square landings.
- Elite gymnasts mix both. A small "set" from the arms at take-off is followed by an aerial
  wrap. Typical tilt is about 10–20°; simulations reach ≈ 17–20° at the double-twist position
  [M13].
- Twist speed rises when the arms pull in close to the body, because the moment of inertia
  around the long axis drops.

**Coaching consensus** [C, 16]: the gymnast first "sets" the salto. The take-off is straight up
with arms overhead and no visible twist on the floor. The twist starts just after the feet
leave, around the time the body passes the vertical. Coaches call twisting off the floor
("cheating the twist") an error.

**Arm wrap (for a twist to the gymnast's left)** [C, 16]: the left arm pulls down to the side or
hip. The right arm comes across and wraps over the chest. Legs stay squeezed together, the
body straight or slightly hollow, the head neutral and turning *with* the body (not
leading or thrown). For multiple twists both arms wrap tight to the chest.
**Stopping**: arms open out sideways symmetrically and a slight pike or hollow removes the
tilt. The twist should be finished by about 75–85% of the flight so the landing is square [M12,
E].

**Animation timing (layout full on floor)** [E]: twist window ≈ 0.15–0.75 of the flight, which
gives a 360° twist in about 0.4 s. Double full: window ≈ 0.12–0.80. Twist inside a tucked double
(e.g. full-in) goes mainly in the *first* salto (contact contributions are larger then) [M13].
Twist in the second salto (full-out) is purely aerial and starts after about one rotation.
**Errors**: twisting on the floor; low salto because the gymnast twists before rising; bent knees
or open legs; arms flailing out; still twisting at landing (a "twisted" landing).

### A9. Double and triple saltos (floor)

Measured at the 1994 World Championships [M3]:

| Variable | Men | Women |
|---|---|---|
| Take-off contact | 0.13 s | 0.12 s |
| Horizontal speed at touch-down → take-off | 4.3 → 3.2 m/s | 4.1 → 2.3 m/s |
| Vertical speed at take-off | 4.2 m/s | 3.5 m/s |
| Touch-down / take-off angle | 64° / 88° | 69° / 87° |
| CM height at take-off / maximum | 1.30 / 2.16 m | ≈ 1.2 / 1.95 m |
| Knee at take-off | ≈ 160° | — |
| Shoulder angle at touch-down/take-off | ≈ 130° | — |

- Flight time ≈ 0.9 s for men and ≈ 0.8 s for women [D].
- The first salto uses ≥ 55% of the flight time. The tuck is tighter in the second salto [M14].
- Tuck is set almost immediately after take-off and stays closed until about 1¾ rotations,
  then the body opens to land (about 0.85 of flight) [E].
- Layout double: same take-off; the body stays straight and the rotation is slower, so it needs
  more height.
- Triple back (men, rare): vz ≈ 5.8 m/s, about 57% more CM height than a double [M3].
**Errors**: opening early (low second salto); tuck too loose; arms not grabbing; landing short
with the chest down.

### A10. Front saltos, punch fronts and twisting front saltos

**Punch** (two-foot take-off out of a hurdle or front handspring) [C, 17, 18]:
- Both feet hit the floor at once, slightly *ahead* of the CM, with legs nearly straight. Knee bend
  stays small (≈ 160–170°) and contact is short (≈ 0.1–0.15 s [E]).
- Chest stays upright and arms are high. In one common style the arms reach overhead as the feet
  hit. In the "Russian lift" the arms come from behind and lift up during the punch.
- After take-off, the *hips* lift up and back over the head. The gymnast does not dive with the
  chest.
- Tuck, pike or layout as in A7 (rotation is forward). Opening and landing happen with the
  chest up.

**Front salto out of a front handspring**: land with arms straight overhead (the correct take-off
position), punch immediately [O18].
**Twisting front saltos**:
- Barani (front salto with ½ twist): the twist is late, when the feet pass over the head, and the
  eyes look at the landing.
- Front full (layout front with 1/1 twist): set the salto first, then twist from about 0.2 to
  0.8 of the flight [C, E].
**Errors**: diving forward with the chest (low, travelling salto); deep knee bend on the punch;
arms dropping early; head thrown forward; landing with the chest on the knees.

### A11. Connections (rebound between elements)

- **Direct connection**: no pause, no extra step, no arm swing to reset [O9]. The next element's
  take-off *is* the landing of the previous one.
- Rebound: balls of the feet, legs almost straight (knee ≈ 150–165° [E]), tight body, arms
  already in the next take-off position (usually overhead), contact 0.10–0.15 s [M2, M3].
- **Beam**: rebound ("punch") with a straight body, head neutral and arms reaching up. A pause,
  a dip of the trunk, or a leg swinging out to the side breaks the connection [O9, 19].

### A12. Landings (absorption)

- **Touch-down**: legs nearly straight but not locked, feet about hip-width (WAG) or together,
  balls of the feet first, then heels. Chest over hips, slightly hollow. Arms forward-up or
  overhead.
- **Absorption**: ankles, knees and hips flex together. In elite back-salto landings the first
  impact phase (≈ 0.05–0.1 s) flexes the hips about 12°, knees about 36° and ankles about 29°
  [M20]. Total flexion continues to about knee 100–130° and hip 110–140° [E]. More flexion means
  lower impact force [M21], but very deep squats are a judging deduction [M21].
- **Stabilise and present**: about 0.3–0.5 s to settle, then stand. Arms go up to show the finish
  and lower to the side. Up to three small steps after a beam dismount are tolerated in
  compulsory texts, but a held landing is the goal [O9].
- **Errors**: landing with straight, locked legs; chest falling onto the knees; steps or hops;
  arms flailing; landing short (under-rotated, sitting down) or over-rotated (forward step).

### A-recipe. Animation recipe — acrobatics

General key order: **approach → contact (block) → flight shapes → landing → absorption → present.**

1. **Round-off → flic-flac → back tuck (floor)**
   - Keys:
     1. Hurdle (upright, arms overhead, front knee lifted) 0.3 s.
     2. Lunge (trunk leaning ≈ 45° forward, arms in line, back leg back) 0.15 s.
     3. Hand 1.
     4. Hand 2 with the trunk inverted (torso ≈ 180) and legs split 0.25 s.
     5. Snap: legs together, body dished, small flight 0.15 s.
     6. Feet land behind the hips, arms overhead, rebound 0.12 s.
     7. Flic-flac flight, arched (body ≈ 30–40° below horizontal at hand contact), 0.2 s.
     8. Hands 0.15 s.
     9. Snap down to feet ahead of the CM (touch-down 65°), 0.12 s rebound.
     10. Salto take-off with a vertical stretched body and arms up.
     11. Tuck at u ≈ 0.25–0.3, open at u ≈ 0.7.
     12. Landing absorb 0.3 s, stand 0.4 s.
   - `riseM` for an elite single back salto ≈ 1.0–1.2: vz 4.5 m/s gives 1.03 m, and the measured
     CM vertical displacement was 1.23 m [D from M10]. For a basic or youth salto use ≈ 0.6–0.9 [E].
     Burgess's reported vz of 2.6 m/s would give only 0.34 m, which does not match the 137%
     body-height peak that the same paper reports. Trust the peak, not that vz [M2].
2. **Double back**: same entry. `riseM` ≈ 0.65 (women, vz 3.5) to 0.9 (men, vz 4.2) above a
   take-off CM of ≈ 1.2–1.3 m [D from M3]. Rotation 720°. Tuck closed from u ≈ 0.15 to ≈ 0.85.
   **Note for the coordinator**: `ANIMATOR.md` gives 1.3–1.8 m for doubles. That is higher than
   the World Championship data here. Lower values with a faster tuck spin are more realistic.
3. **Twisting**: the take-off key has *no* twist. `twistWindow` ≈ [0.15, 0.8], arms wrapped
   during the window, arms opening at the end.
4. **Aerial**: the poster frame is the inverted split at mid-flight.
   **Walkover**: the poster frame is the split handstand.
5. **Beam versions**: `riseM` 0.5–0.8. Hands side by side on top of the beam, feet landing in line
   on the beam top, arms overhead throughout flic-flacs.

---

## B. DANCE — floor and beam

### B1. Entries: run, chassé, step

- **Chassé** (a gallop step): the front foot steps forward, the back foot closes to it in a small
  flight, and the front foot steps again into the take-off. It gives more vertical height and a
  bigger split than a simple run, which gives more horizontal speed [M22].
- **Step entry** (beam): one or two steps in relevé, then a deep take-off plié.
- **Take-off for leaps** (one foot): the last step rolls heel-ball-toe. Take-off knee ≈ 120–140° in
  the plié [E], trunk upright. Arms swing from low or side up to the leap position.
- Contact ≈ 0.15–0.25 s [E].

### B2. Split leap

- **Take-off**: one foot. The *front* leg swings straight forward-up (a "brush", no bent knee) while
  the support leg pushes off and then lifts behind.
- **Flight**: the legs reach 180° (or more at elite) at the top of the flight. Both legs sit on
  a near-horizontal line, the front leg at or above horizontal, the back leg extended behind
  with a pointed toe. Hips stay square, trunk upright with a slight forward lean.
- **Arms**: 2nd position (side) or 3rd (one forward, one side, or overhead) [O8].
- **Landing**: on the *front* leg in demi-plié, rolling toe-ball-heel, back leg passing through a
  low arabesque [O9].
- **Measured**: flight time ≈ 0.42–0.43 s, split ≈ 190–200° in trained rhythmic gymnasts [M23].
  CM rise ≈ 0.22 m [D].
- **Timing** [E]: split complete by ≈ 0.35–0.45 of the flight and held through the peak; legs
  begin to close by ≈ 0.75.
- **Errors**: split reached late or never; bent knees; uneven split (front leg low); trunk dropping
  forward; turned hips; heavy landing.

### B3. Switch leap (and switch ring, switch with ½ turn)

- **Take-off**: like the split leap, but the front leg first swings forward to at least 45°
  [O9].
- **Switch**: in flight the legs scissor. The front leg swings back, the back leg swings forward,
  either straight (switch leap) or through a passé (a "switch through passé" variant), and they
  reach 180° at the top of the flight.
- **Landing**: on the new front leg in demi-plié with the back leg through a low arabesque [O9].
- **Errors**: front leg kicked lower than 45°; split reached after the peak; trunk dipping; hips
  turning [O9, 19].
- **Switch ring**: the back leg bends so the foot reaches toward the head with the upper back
  arched. If the foot does not reach the head at the peak it is credited only as a switch leap
  [19].

### B4. Sissone

- **Take-off**: from **two** feet. **Landing**: on **one** foot (the front leg) [O24].
- The legs separate to 180° on a diagonal about 45° to the floor: the REAR leg is the high one
  (up behind), the front leg is low in front, and the trunk leans forward over the front leg. The
  landing is on that front leg [O24]. (Corrected 23-11-2026 after the batch 7 review: an earlier
  version of this guide had the front leg high.)
- Arms in 2nd or 3rd position.
- Timing similar to the split leap, with a slightly lower flight [E].

### B5. Stag and ring positions (leaps and jumps)

- **Stag**: the front leg is bent with the thigh horizontal or higher and the shin hanging, toe
  pointed toward the back leg's knee. The back leg is straight behind.
- **Ring**: the back leg is bent so the foot rises to head height (some code texts say shoulder
  height). The upper back is arched and the head drops back, so the back foot and head close
  a "ring" [O24]. The front leg is straight (ring leap) or bent (stag ring).
- **Errors**: the foot does not reach the head; the arch is only in the lower back; the front thigh
  is below horizontal.

### B6. Jumps from two feet (tuck, straddle-pike, pike, wolf, split jump, stretch jump)

- **Preparation**: feet together, demi-plié (knee ≈ 110–130° [E]), arms swing from low to high.
- **Take-off**: hips, knees and ankles extend completely before the shape. The shape starts
  after the feet leave the floor, never on the floor.
- **Shape at the peak**:
  - **Tuck**: knees above horizontal toward the chest, hip and knee < 90°.
  - **Pike**: legs together and straight, hip ≤ 90°, arms reaching to the toes.
  - **Straddle-pike**: legs straight and wide (≥ 90° apart, elite ≈ 180°), both legs at or above
    horizontal, trunk upright or slightly forward, hands toward the feet.
  - **Wolf**: one leg tucked, knee to the chest, the other straight forward at or above
    horizontal.
  - **Split jump**: 180° front-back split, landing on two feet [O9].
- **Landing**: on two feet in demi-plié, the legs having closed again *before* landing.
- **Flight**: ≈ 0.4–0.5 s, CM rise ≈ 0.2–0.35 m [E, D]. The shape is closed from ≈ 0.3 to
  ≈ 0.7 of the flight.
- **Errors**: shape too early or too late; legs below horizontal; bent knees in straddle or pike;
  the trunk dropping to meet the legs instead of the legs rising; no full extension at take-off.

### B7. Turns on one foot (pirouette mechanics, free-leg positions)

- **Preparation**:
  - From a step or a 4th position, the front leg in plié.
  - About 60% of the weight sits over the front foot [M25].
  - Arms are prepared, for example one curved forward and one to the side. On beam the arms
    finish this preparation together at the same moment [O9].
- **Push and rise**:
  - The feet push in opposite horizontal directions, which creates the turning torque [M25].
  - The upper trunk and arms add angular momentum [M25].
  - The support foot rises to *high* relevé and the support leg locks straight.
- **During the turn**:
  - The free leg goes to its position at once.
  - The arms close (crown overhead or in front of the chest), which lowers the moment of inertia
    and speeds up the turn.
  - The body is a vertical axis from the head through the support foot. Hips are level, core
    tight.
  - The head "spots": it stays fixed on a point and then whips around ahead of the body.
- **Speed**: ≈ 1.5–2 rev/s (≈ 11 rad/s reported for skilled turns) [M25, D]. A full turn takes
  ≈ 0.5–0.65 s plus 0.3–0.5 s of preparation [E].
- **Finish**: mark the position in relevé, then lower the heel and open the arms to brake [O9].
- **Free-leg positions**:
  - forward passé: toe touches the support knee [O9];
  - leg forward or side at horizontal (L/Y);
  - back attitude;
  - leg held high with the hand;
  - wolf turn: squat on the support leg, free leg straight forward at horizontal.
- **Errors**:
  - turning on a dropped or "snapped" heel (deducted) [O9];
  - falling off the axis, hopping;
  - free leg drifting during the turn;
  - arms flapping;
  - not finishing in relevé.

### B8. Beam mounts and dismounts

**Mounts** (from a short run and two-foot take-off off a springboard, or from a stand):
- *Jump to front support / squat or wolf mount*: hands on the beam, jump from the board, hips rise
  above the beam. Both feet (squat) or one foot (wolf, other leg to the side) land on the beam
  between the hands, then the gymnast stands up [C].
- *Press-to-handstand mounts*: hands on the beam, jump from the floor or board, hips rise above
  the shoulders in straddle or pike, legs join in handstand. The skill is slow and controlled
  [C, 26].
- *Leg-swing mounts* (compulsory level): a swing leg kicks up and the gymnast jumps to sit
  across the beam [O9].
- *Salto mounts* (front tuck onto the beam): a punch on the board, then a front salto landing on the
  beam on one or two feet, arms up [C].

**Dismounts** (from the beam end):
- Round-off + back salto tucked or stretched, or flic-flac series + salto. On the round-off,
  land on the balls of the feet and rebound immediately with a straight body and arms reaching
  up. Tuck after leaving the beam, extend before landing, land in demi-plié with the chest up
  [O9].
- The CM falls about 1.25 m (beam height) plus the salto rise, so the landing absorption is
  larger than on floor [E].

### B-recipe. Animation recipe — dance

1. **Split/switch leap**:
   - Keys: last step plié (0.15 s, trunk upright, arms low) → take-off (support leg extending,
     front leg brushing up, or to 45° for a switch) → flight.
   - `riseM` ≈ 0.25–0.35 [D, E]. Shapes: split ≥ 180° complete at u ≈ 0.4 and held to ≈ 0.7;
     for a switch, the front leg is at 45° at u ≈ 0.1 and the scissor ends by u ≈ 0.4.
   - Landing on the front leg in demi-plié with the back leg in low arabesque, then a step.
   - Poster frame = the peak split.
2. **Two-foot jumps**: plié with arms low 0.2 s → straight take-off with arms rising → shape
   at u 0.3–0.7 → legs together by u 0.85 → demi-plié landing 0.2 s → stand.
3. **Pirouette**: prep in 4th (front knee bent, arms preparing) 0.4 s → rise to relevé with the free
   leg in passé and arms closing in the first 0.1 s → constant spin (the engine's twist about the
   vertical axis) ≈ 1.6–1.8 rev/s → mark in relevé 0.2 s → heel down.
   - In 2D side view the facing flips every 180°.
   - Poster frame = relevé passé with closed arms.
4. **Beam**: all landings are on the beam top with feet in line. Leap flight is a little lower than
   on floor (`riseM` ≈ 0.2–0.3) [E].

---

## C. VAULT

### C0. Phases common to all vaults

| Phase | Measured / typical values |
|---|---|
| Run-up (≈ 20–25 m) | Peak speed (7–5 m before the table, women, 2007 Worlds): handspring 7.7, Tsukahara 7.5, Yurchenko 7.3 m/s. Men: 8.4 / 8.2 / 7.4 m/s [M27]. Speed peaks a few metres before the board. Yurchenko runners slow down earlier (≈ 4 m before the last step) [M28]. |
| Hurdle | A long, low step from one foot to land on the board with both feet. It is the "targeting" step where stride is adjusted [M7]. |
| Board contact | ≈ 0.09–0.12 s for handspring and Tsukahara [M7, M8], ≈ 0.15 s for Yurchenko [M6]. |
| Pre-flight (first flight) | ≈ 0.28 s, male handspring [M8]. |
| Table support | ≈ 0.13–0.14 s, male handspring [M8]. |
| Post-flight (second flight) | From the table, women average 2.9 m/s horizontal and 2.4 m/s vertical [M28], which gives a CM rise of about 0.3 m above table take-off and a post-flight of about 0.8 s down to the mat [D]. Vertical take-off speed from the table correlates with the score; horizontal speed does not [M28]. |
| Landing | Same rules as A12, from higher, so absorption is larger. |

Short board contact and short table contact convert run speed into a longer post-flight [M8].

### C1. Handspring vault (front entry)

1. **Hurdle**: low and long. Arms swing from back-low (or circle) so they move forward-up
   while the feet hit the board.
2. **Board contact**: both feet together on the balls of the feet near the board's front end.
   The body is straight-to-hollow and inclined slightly back (feet ahead of the CM). Knee bend
   is minimal. The arms drive forward-up to overhead [C].
3. **Pre-flight**: the body rotates forward, straight or slightly hollow, and the arms reach for
   the table so the shoulders are open (≈ 180°) at contact [C]. Hands land shoulder-width on
   the table while the body is still below the handstand, rising (≈ 30–50° short of vertical,
   [E]).
4. **Table support (block)**: straight arms. A fast push from the shoulders ("block") as the
   body passes toward vertical. It is short. Bent arms and long support are deductions [C].
5. **Post-flight**: a stretched body rotates forward over and down. Arms stay up. Height comes
   from the block. For handspring front salto vaults the full tuck is best reached near the
   peak of the post-flight [M29].
6. **Landing**: face away from the table, chest up, absorb.

**Errors**: hurdle too high or too far from the board; piking in pre-flight; bent arms on the
table; hands placed late (body already past vertical) → low, flat post-flight; arching or piking
in post-flight; short landing.

### C2. Tsukahara (round-off-type entry onto the table)

- **Run, hurdle and board contact**: as for the handspring. The gymnast faces the table.
- **Pre-flight with ¼ (or ½) turn**: shoulders and hips start turning toward the round-off side
  as the body leaves the board [C, 30].
- **Table contact**: staggered. The first hand lands turned in, then the second hand, so the
  body keeps turning and pushes off like a round-off [C, 30]. Board contact is ≈ 0.10 s and the
  second flight is shorter than in handsprings [M30]. Angular energy built on the board is
  largely kept through the table push [M30].
- **Post-flight**: a *backward* salto (tuck, pike, layout, with twists) because the body now faces
  the table. Without a twist (or with whole twists) the gymnast lands **facing the table**; half twists
  land with the back to it. (Corrected 23-11-2026: an earlier version said "back to the table".)
- **Errors**: late turn; turn completed on the table instead of in pre-flight; bent arms; low
  salto.

### C3. Yurchenko (round-off entry onto the board)

1. **Run**: slightly slower (≈ 7.3 m/s women [M27]).
2. **Round-off onto the board**: a hurdle into the round-off. Hands go on the mat in front of the
   board (a safety collar is required around the board) [O31]. The trail hand load is ≈ 2.4×
   body weight vertical, higher than a floor round-off [M32]. The snap lands the feet on the
   board *ahead* of the CM, arms by the ears.
3. **Board contact** [M6]:
   - ≈ 0.15 s;
   - body angle ≈ 60° to the floor at impact, ≈ 84° at take-off;
   - horizontal speed 5.3 → 3.9 m/s, vertical −0.7 → +3.7 m/s;
   - the CM barely sinks (≈ 2 cm) and then rises ≈ 26 cm.
   Like a floor rebound: stiff, short, arms already overhead.
4. **Pre-flight**: a back handspring onto the table. The arms swing up and back past the head,
   the body is stretched to slightly arched, the head neutral, and the hands reach back to the
   table.
5. **Table support**: straight arms, open shoulders, then a fast push. The snap goes from slight
   arch to dish.
6. **Post-flight**: a backward salto (layout, with 1–2½ twists at elite level). The twist is aerial
   and starts after the hands leave (same rules as A8).
7. **Landing**: facing the table.

**Errors**: round-off too close to or too far from the board; landing the board on the heels;
piking off the board; bent arms on the table; twisting on the table (early twist); low post-flight.

### C-recipe. Animation recipe — vault

Scene `vault`, table top 1.25 m.

1. **Run**: show the last 2–3 strides (≈ 0.25 s each), body upright and leaning slightly
   forward.
2. **Hurdle**: one foot to two feet, ≈ 0.2–0.3 s flight, arms swinging forward-up.
3. **Board contact**: ≈ 0.1 s (0.15 for a Yurchenko). Feet ahead of the CM, legs nearly straight,
   body hollow, arms up.
4. **Pre-flight**: a stretched body rotating toward the table, arms overhead, ≈ 0.2–0.3 s.
   - Handspring: forward rotation.
   - Tsukahara: ¼–½ turn during pre-flight.
   - Yurchenko: the back handspring is already arched backward.
5. **Table support**: ≈ 0.13–0.15 s, straight arms, body passing near vertical. The poster frame
   for handsprings is often here (inverted, straight body).
6. **Post-flight**:
   - `riseM` ≈ 0.3–0.5 above the table take-off CM. The 2010 Worlds women's average vz of
     2.4 m/s gives 0.30 m, and men's 3.2 m/s gives 0.52 m [D from M28]. Most of the visible
     amplitude comes from the fall from table height (CM ≈ 2.2 m at take-off) to the mat.
     **Note for the coordinator**: `ANIMATOR.md` gives 0.8–1.3 m for vault post-flight, which
     makes sense only measured from table-top height, not from the take-off CM.
   - Salto direction: forward for a handspring, backward for Tsukahara and Yurchenko.
   - Twist window ≈ [0.1, 0.8].
7. **Landing**: absorb deeper than on floor (knee ≈ 100–120° [E]), chest up, arms forward, then
   present.

---

## Contact time and flight cheat sheet (for keying)

| Event | Duration | Source |
|---|---|---|
| Rebound before salto (elite) | 0.12–0.13 s (≈ 4 frames @30 fps) | M3 |
| Rebound before salto (beginner) | 0.18 s | M2 |
| Board, handspring/Tsukahara | 0.09–0.12 s | M7, M8 |
| Board, Yurchenko | 0.15 s | M6 |
| Vault pre-flight (male handspring) | ≈ 0.28 s | M8 |
| Vault table contact | ≈ 0.13–0.14 s | M8 |
| Single back salto flight (youth / elite) | 0.6–0.75 s / ≈ 0.9 s | M2 / D from M10 |
| Double back flight | ≈ 0.8 s women, ≈ 0.9 s men | D from M3 |
| Split leap flight | ≈ 0.42 s | M23 |
| Pirouette 1/1 | ≈ 0.55–0.65 s of spin | D from M25 |

---

## Sources

1. Farana R. et al. (2015). Elbow joint variability for different hand positions of the round off in gymnastics. *Human Movement Science*. https://pubmed.ncbi.nlm.nih.gov/25461436/
2. Burgess R., Noffal G. (2001). Kinematic analysis of the back salto take-off in a tumbling series: advanced vs. beginner techniques. ISBS Proceedings. https://ojs.ub.uni-konstanz.de/cpa/article/view/3754
3. Geiblinger H., Morrison W.E., McLaughlin P.A. (1995). Take-off characteristics of double back somersaults on the floor. ISBS Proceedings. https://ojs.ub.uni-konstanz.de/cpa/article/view/2934
4. Back handspring upper-extremity kinematics (sagittal motion capture, hand contact split into two phases; wrist and elbow ranges as reported in a search summary, full text not read; likely the University of North Dakota study https://commons.und.edu/pt-grad/260). Related: Small & Neptune (2024) *Sports Biomechanics*, beam back handspring take-off techniques https://sites.utexas.edu/neptune/files/2024/09/SB_Sept24.pdf
5. Back handspring coaching errors and cues: American Gymnast training notes https://go.american-gymnast.com/training-information/backhandspring_mistakes ; Physical Education Update cue on head position https://www.physicaleducationupdate.com/public/213.cfm ; Alberta Gymnastics workshop summary https://abgym.ab.ca/app/uploads/2024/01/Regional-Workshop-Summary-Cameron-Taylor-Handstands-Related-Skills-1.pdf ; arm-swing study for the standing back tuck https://pmc.ncbi.nlm.nih.gov/articles/PMC4096086
6. Penitente G., Merni F., Fantozzi S., Perretta N. (2007). Kinematics of the springboard phase in Yurchenko-style vaults. ISBS Proceedings. https://ojs.ub.uni-konstanz.de/cpa/article/view/389
7. Vault phase definitions and hurdle as targeting phase: ISBS vault papers https://ojs.ub.uni-konstanz.de/cpa/article/view/894 and https://ojs.ub.uni-konstanz.de/cpa/article/view/5360
8. Bradshaw E., Hume P., Calton M., Aisbett B. Reliability of a gymnastics vaulting feedback system (board, pre-flight and table times). ISBS Proceedings. https://ojs.ub.uni-konstanz.de/cpa/article/view/3240
9. USA Gymnastics (2025–2028). Elite Compulsory Balance Beam text (round-off and flic-flac dismounts, salto, walkovers, front handspring, turns, switch leap). https://static.usagym.org/PDFs/Women/elite/compulsory/25beam.pdf
10. Kinematic and kinetic analysis of two gymnastics acrobatic series to performing the backward stretched somersault. *J. Human Kinetics* (PMC3796835). https://pmc.ncbi.nlm.nih.gov/articles/PMC3796835/
11. NRG Developmental Gymnastics. Teaching progressions — the round-off. https://www.nrgq.co.uk/wp-content/uploads/2018/12/Developmental_Teaching-Progressions-ROUND-OFF.pdf
12. Yeadon M.R. (1993). The biomechanics of twisting somersaults, Parts II (contact twist) and III (aerial twist). *J. Sports Sciences*. https://dspace.lboro.ac.uk/2134/5320 and https://dspace.lboro.ac.uk/dspace-jspui/bitstream/2134/5321/3/Yeadon1993c.pdf
13. Yeadon M.R. et al. Twisting technique papers (twist in first vs second somersault, tilt with limited arm speed, nutation), Loughborough University. https://www.lboro.ac.uk/microsites/ssehs/biomechanics/papers/twistfast99.pdf ; https://www.lboro.ac.uk/microsites/ssehs/biomechanics/papers/nutation.pdf ; https://www.lboro.ac.uk/microsites/ssehs/biomechanics/papers/twistphysics00.pdf
14. Double back somersault rotation split (first somersault ≥ 55% of flight) and US Junior team tuck/full/layout double back study (Munkasy & Smith), ISBS Proceedings. https://ojs.ub.uni-konstanz.de/cpa/article/view/2643
15. Aleksić-Veljković A. et al. (2019). Kinematic parameters of the aerial cartwheel on the balance beam during skill learning. https://researchgate.net/profile/Aleksandra-Aleksic-Veljkovic/publication/332655208
16. Twisting coaching practice (set before twisting, late twist, arm wrap): ChalkBucket coaches' forum threads, e.g. https://chalkbucket.com/threads/different-twisting-techniques-timing-thoughts.31472/ and https://chalkbucket.com/threads/teaching-basic-back-twisting.33798/ (coach opinion, used only where it agrees with Yeadon).
17. Punch front coaching: TumblTrak training tip https://www.tumbltrak.com/working-the-punch-and-rotation-for-a-punch-front-training-tip ; ChalkBucket front tumbling hurdle thread https://chalkbucket.com/threads/front-tumbling-hurdle-technique.21993/
18. USA Gymnastics Age Group Competition Program (1997–2000), front handspring to front salto take-off position. https://issuu.com/usagymnastics/docs/1998_3mar/11
19. College Gym News — Judge's Inquiry: switch half leaps on beam (connection and landing faults). https://collegegymnews.com/2025/12/18/judges-inquiry-good-vs-great-vs-excellent-beam-switch-half-leaps/ ; Balance Beam Situation, switch ring https://balancebeamsituation.com/elite-skill-database/switch-ring-balance-beam/
20. Strategies of elite Chinese gymnasts in coping with landing impact from backward somersault (2019). *PeerJ* 7:e7914. https://peerj.com/articles/7914/ (also PMC6816378)
21. Greater lower limb flexion in gymnastic landings is associated with reduced landing force (2015). *Sports Biomechanics*. https://sponet.de/sponet/Record/4035347
22. Biomechanical analysis of a rhythmic gymnastics jump performed using two run-up techniques (simple run vs chassé), *J. Physical Education and Sport* (2020). https://bvbvf1.bib-bvb.de/vufind/PrimoRecord/cdi_proquest_journals_2389736012
23. Static vs dynamic stretching effects on split leap split angle and flight time, ISBS 2024. https://commons.nmu.edu/isbs/vol42/iss1/39
24. FIG Women's Artistic Gymnastics floor element list (sissone, ring and stag ring definitions) https://www.gymnastics.sport/site/pages/images/recognition/W-001_9-FX_Element%20list.pdf ; WAG newsletter on ring leap foot height https://www.gymfed.cz/data/prilohy/000/299/WAG_NL_36_en.pdf
25. Pirouette mechanics: IADMS, "Can physics improve your pirouettes?" (Sugano & Laws 2002; Biringen 2010; Kim et al. 2014) https://iadms.org/education-resources/blog/2019/january/can-physics-improve-your-pirouettes/ ; Imura & Yeadon (2010) fouetté turn https://dspace.lboro.ac.uk/2134/7462 ; balance control during pirouette, ISBS https://ojs.ub.uni-konstanz.de/cpa/article/view/5610
26. Balance Beam Situation — press handstand mounts. https://balancebeamsituation.com/press-handstand-mounts
27. Naundorf F., Brehmer S., Knoll K., Bronst A., Wagner R. (2008). Development of the velocity for vault runs in artistic gymnastics for the last decade. ISBS Proceedings. https://ojs.ub.uni-konstanz.de/cpa/article/view/1905
28. Van der Eb J. et al. (2012). Optimal velocity profiles for vault (2010 World Championships, table take-off velocities). ISBS Proceedings. https://ojs.ub.uni-konstanz.de/cpa/article/view/5162
29. Takei Y. — handspring and front salto vault post-flight studies, as summarised in https://ojs.ub.uni-konstanz.de/cpa/article/view/2644 and https://www.dlib.si/stream/URN:NBN:SI:DOC-OHQFSFCZ/a9691058-c57a-4953-9e2c-06660c1eec61/TEXT
30. Tsukahara phases, board contact and energy transfer: Science of Gymnastics Journal papers https://dlib.si/stream/URN:NBN:SI:DOC-2TM1KXMJ/0512d434-5de1-424b-94d0-09d1df362ccf/PDF and https://www.dlib.si/stream/URN:NBN:SI:DOC-DP5LQDPV/56f46a61-70ab-4efc-80c6-4e3653e87e2f/PDF
31. FIG Age Group Development and Competition Program for WAG (Fink, H.), safety collar rule for round-off entry vaults and compulsory vault faults. https://gymnastics.sport/site/pages/education/agegroup-wag-manual-e.pdf
32. Seeley M.K., Bressel E. (2005). A comparison of upper-extremity reaction forces between the Yurchenko vault and floor exercise. *J. Sports Science and Medicine* 4, 85–94. https://jssm.org/jssm-04-85.xml-Fulltext

Not used, per brief: Upgrade Gymnastics, GymPro Atlas. A Masaryk University "Safe Gymnastics
4 All" e-learning site was found but sits behind bot protection, so it was not read.
