# Pose-fact extractor for one batch (clean room)

Same rules as the pilot extractor: you look at the official FIG drawing of each element and write
ONLY technical pose facts (phases, body shape, orientation, torso angle rounded to 30°, arms, legs,
contacts, where on the apparatus, direction of travel/rotation, twists, view, apparatus parts,
`mustShow`, technical notes in your own words). No coordinates, layout, line style, composition or
copied text. Angles rounded to 30°. Official FIG PDFs only:
- MAG: /Users/elvisvaldesinerarte/Resources/gimnasia-normativa/en_1.1 - MAG Code of Points 2025-2028.pdf
- WAG: /Users/elvisvaldesinerarte/Resources/gimnasia-normativa/en_1.1 - WAG COP 2025-2028.pdf
Render pages with `pdftoppm -f P -l P -r 150 -png "<pdf>" <workdir>/pages/p<P>` and crop with magick.
Never open anything under "Upgrade Gymnastics" or GymPro.
Input: the batch list (elementKey, apparatus, figReference, sourcePage, and our own name/description).
Output: `work/poses-<edition>-<batch>.json` = {elementKey: {...}} in the same shape as the pilot file
`specs/pilot/poses-example.json`. Also give, per element, a `physics` hint: expected centre-of-mass
rise (low/medium/high), number of saltos and twists, rotation direction, and where the gymnast takes
off and lands.
