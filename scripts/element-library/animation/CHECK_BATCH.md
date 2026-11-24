# Animation checker for one batch (with the FIG Code)

For every element of the batch compare our animation (`out/<edition>-<batch>/<key>-sheet.png`: 10
frames in order; `<key>.svg`: static pictogram; `<key>-report.json`: physics numbers) with the official
FIG drawing and your knowledge of the skill:
1. Technique: phases, shapes, rotation direction, number of saltos/twists, contacts, start/end
   positions, the `mustShow` facts in `work/poses-<edition>-<batch>.json`. List every error.
2. Physics/body logic: anything a coach would find wrong (impossible joint, unrealistic height or
   speed, arms snapping, landing without absorption, wrong apparatus contact).
3. Copy risk 0–1 of the static pictogram's composition versus the FIG drawing (≥ 0.5 = too close).
Fixes as technical facts only, never a description of the FIG drawing's layout. FIG PDFs only
(paths in EXTRACT_BATCH.md); never Upgrade Gymnastics/GymPro.
4. Score 0–10 for the animation as a whole (technique, physics, readability of the static pictogram),
   as a demanding coach would grade it. **An element is accepted only with score ≥ 9**; below 9 it goes
   back to the animator with its errors. Known engine limits listed in "limits" do not lower the score
   unless they make the element hard to recognise.
Output: `work/check-<edition>-<batch>.json` = {elementKey: {"technique": "ok|errors", "score": 0-10,
"errors": [...], "physics": [...], "limits": [...], "copyScore": x}}. Read-only on specs.
