// Single source of truth for the "How to draw <character>" SEO landing pages.
//
// Pure data + text helpers — NO React imports — so this module is shared by
// BOTH the client page (src/pages/DrawCharacter.jsx) and the build-time
// prerender script (scripts/prerender-routes.mjs). That guarantees the static
// HTML crawlers read is identical to what the SPA renders.
//
// IMPORTANT (legal): these are tutorial pages, not image hosting. We never
// embed copyrighted character artwork — the guide teaches the user to trace
// THEIR OWN reference with TraceMate's overlay. Keep it that way.
//
// Add a character = one entry below. Each needs genuinely unique `why`,
// `reference`, and `tips` so the page is real content, not a thin doorway.

export const CHARACTERS = [
  {
    slug: 'gojo',
    name: 'Gojo Satoru',
    short: 'Gojo',
    franchise: 'Jujutsu Kaisen',
    difficulty: 'Intermediate',
    why: 'his face is all about the eyes and the spiky white hair, and the smallest slip in eye spacing breaks the likeness',
    reference: 'a clean front-facing piece of key art — the uncovered-eyes look if you want a challenge, the blindfold version if you want it easier',
    tips: [
      'Lock in the eyes first. Gojo’s bright Six Eyes and their exact spacing and tilt carry the whole likeness — trace them before anything else.',
      'Treat the white hair as a few big clumped shapes, not individual strands. Block the spiky silhouette, then add only the largest interior splits.',
      'The blindfold version hides the hardest part — start there if you’re new, then graduate to the open-eyes version.',
    ],
  },
  {
    slug: 'sukuna',
    name: 'Ryomen Sukuna',
    short: 'Sukuna',
    franchise: 'Jujutsu Kaisen',
    difficulty: 'Advanced',
    why: 'the face markings and the second set of eyes have to sit symmetrically or he looks lopsided fast',
    reference: 'a sharp front or three-quarter shot where the tattoo lines are clearly visible',
    tips: [
      'Trace the face shape and the centerline first, then mirror the curved markings off it so both sides match.',
      'The extra eyes under the main ones are what make him Sukuna — get their placement deliberately, not as an afterthought.',
      'Keep the line weight bold and confident; Sukuna’s look is heavy, sharp strokes, not timid pencil lines.',
    ],
  },
  {
    slug: 'naruto',
    name: 'Naruto Uzumaki',
    short: 'Naruto',
    franchise: 'Naruto',
    difficulty: 'Beginner',
    why: 'the spiky hair and the headband are simple shapes, which makes him one of the friendliest anime characters to start with',
    reference: 'a clear bust shot showing the headband and the whisker marks',
    tips: [
      'Start with the headband band across the forehead — it anchors the whole head and the hair sits on top of it.',
      'The three whisker marks on each cheek are his signature; keep them evenly spaced and angled the same on both sides.',
      'Hair is a handful of big triangular spikes, not many small ones — trace the outer silhouette and resist over-detailing.',
    ],
  },
  {
    slug: 'itachi',
    name: 'Itachi Uchiha',
    short: 'Itachi',
    franchise: 'Naruto',
    difficulty: 'Intermediate',
    why: 'the calm half-lidded eyes and the two long tear-trough lines down the face define him more than anything else',
    reference: 'a front-facing shot with the Sharingan eyes clearly drawn',
    tips: [
      'Get the long crease lines under each eye right — they are the fastest way to read the drawing as Itachi.',
      'The Sharingan pattern (three commas around the pupil) needs to be even; trace it slowly rather than freehanding it.',
      'His hair frames the face in two long curtains — trace those framing shapes before the inner strands.',
    ],
  },
  {
    slug: 'goku',
    name: 'Goku',
    short: 'Goku',
    franchise: 'Dragon Ball',
    difficulty: 'Beginner',
    why: 'the hair is the whole challenge — once the spiky silhouette is right, the face is simple',
    reference: 'a clear shot of the head and hair, base form or Super Saiyan',
    tips: [
      'Block the entire hair silhouette as one big spiky shape first, then carve the gaps — don’t draw spike by spike.',
      'Goku’s eyes are large and simple with strong dark outlines; keep them clean and symmetrical.',
      'Super Saiyan hair is taller and swept up — trace the overall flame shape before any internal lines.',
    ],
  },
  {
    slug: 'luffy',
    name: 'Monkey D. Luffy',
    short: 'Luffy',
    franchise: 'One Piece',
    difficulty: 'Beginner',
    why: 'the round face, big grin and straw hat are bold simple shapes that are very forgiving for beginners',
    reference: 'a front shot with the straw hat on and the scar under the eye visible',
    tips: [
      'Trace the straw hat as an oval brim plus a dome — it sets the angle of the whole head.',
      'The little scar under his left eye is a tiny detail that instantly reads as Luffy; don’t skip it.',
      'Keep the grin wide and the jaw round; Luffy’s charm is in the soft, cartoony proportions.',
    ],
  },
  {
    slug: 'zoro',
    name: 'Roronoa Zoro',
    short: 'Zoro',
    franchise: 'One Piece',
    difficulty: 'Intermediate',
    why: 'the green hair, the scar over the eye and the hard jaw give him a tougher, more angular face than most',
    reference: 'a three-quarter shot showing the scar and the earrings',
    tips: [
      'His face is angular — trace with straighter, harder lines than you would for a rounder character.',
      'The vertical scar over his left eye and the three earrings are quick wins for the likeness.',
      'Keep the hair short and bristly; it’s a tight cap shape, not long spikes.',
    ],
  },
  {
    slug: 'tanjiro',
    name: 'Tanjiro Kamado',
    short: 'Tanjiro',
    franchise: 'Demon Slayer',
    difficulty: 'Intermediate',
    why: 'the forehead scar and the checkered haori pattern are the details everyone recognizes him by',
    reference: 'a bust shot showing the scar, the earrings and a bit of the checkered pattern',
    tips: [
      'Trace the forehead scar early — it is the single most recognizable Tanjiro feature.',
      'His eyes are gentle and slightly upturned with a gradient; keep them soft, not sharp.',
      'For the checkered haori, trace the collar shape first, then lay the square pattern over it in light passes.',
    ],
  },
  {
    slug: 'levi',
    name: 'Levi Ackerman',
    short: 'Levi',
    franchise: 'Attack on Titan',
    difficulty: 'Intermediate',
    why: 'the undercut hair and the flat, sharp expression have to be precise — he reads as stern, never soft',
    reference: 'a front or slight three-quarter shot with the undercut clearly visible',
    tips: [
      'Trace the undercut as two zones: the smooth dark top section and the shaved sides — the boundary line matters.',
      'Keep the eyes narrow and the brow low; Levi’s whole character is in that flat, unimpressed stare.',
      'His face is lean and angular — avoid rounding the jaw or he loses the edge.',
    ],
  },
  {
    slug: 'eren',
    name: 'Eren Yeager',
    short: 'Eren',
    franchise: 'Attack on Titan',
    difficulty: 'Intermediate',
    why: 'the intense eyes and the medium-length hair change a lot between the early and late series, so the reference you pick defines the whole look',
    reference: 'pick one era first — short-haired teen Eren or the long-haired later look — and trace from a single clear shot',
    tips: [
      'Decide which era you’re drawing before you start; mixing the short and long hair looks breaks the likeness.',
      'The eyes carry his trademark intensity — trace the sharp upper lash line and keep the gaze direct.',
      'Block the hair in big sections framing the face, then add only the strands that catch light.',
    ],
  },
  {
    slug: 'pikachu',
    name: 'Pikachu',
    short: 'Pikachu',
    franchise: 'Pokémon',
    difficulty: 'Beginner',
    why: 'it’s all simple round shapes and a couple of iconic details, making it perfect for kids and total beginners',
    reference: 'a clear full-body or face shot in the modern art style',
    tips: [
      'Start with the round head and body as two simple blobs, then add the long pointed ears on top.',
      'The red cheeks, lightning-bolt tail and black ear tips are the details that make it unmistakable.',
      'Keep every line soft and rounded — there are almost no straight edges on Pikachu.',
    ],
  },
  {
    slug: 'anya',
    name: 'Anya Forger',
    short: 'Anya',
    franchise: 'Spy x Family',
    difficulty: 'Beginner',
    why: 'the huge expressive eyes and the little hair horns are simple to trace and instantly recognizable',
    reference: 'a front-facing shot with both eyes and the hair "horns" visible',
    tips: [
      'The oversized eyes are the whole character — trace them big, round and far apart, with the star/sparkle highlights.',
      'Add the two little pointed hair tufts ("horns") on top; they read as Anya immediately.',
      'Keep the head large relative to the body — the chibi-ish proportions are part of the charm.',
    ],
  },
];

export const CHARACTER_BY_SLUG = Object.fromEntries(CHARACTERS.map((c) => [c.slug, c]));

// Related characters for internal linking: same franchise first, then others,
// in declaration order (deterministic so prerender + client agree).
export function getRelated(slug, n = 5) {
  const self = CHARACTER_BY_SLUG[slug];
  if (!self) return CHARACTERS.slice(0, n);
  const sameFr = CHARACTERS.filter((c) => c.slug !== slug && c.franchise === self.franchise);
  const others = CHARACTERS.filter((c) => c.slug !== slug && c.franchise !== self.franchise);
  return [...sameFr, ...others].slice(0, n);
}

// ── Text helpers (shared by the page + the prerender body/JSON-LD) ───────────
export function charTitle(c) {
  return `How to Draw ${c.short} (${c.franchise}) — Easy AR Tracing Tutorial | TraceMate`;
}

export function charDescription(c) {
  return `Learn how to draw ${c.name} from ${c.franchise} the easy way — trace any reference straight onto real paper with TraceMate's AR overlay. Free to try in your phone browser, no app and no printing. ${c.difficulty} level.`;
}

export function charLead(c) {
  return `${c.name} is one of the most-searched characters to draw from ${c.franchise} — and tracing is the fastest way to learn the look. With TraceMate you overlay any ${c.short} reference straight onto your paper and trace it by hand, so you nail the proportions before you ever go freehand.`;
}

export function charWhy(c) {
  return `${c.short} is a ${c.difficulty.toLowerCase()}-level character to draw: ${c.why}. Trace it a few times, then redraw without the overlay — that last rep is where it actually clicks.`;
}

export function charSteps(c) {
  return [
    {
      title: `Find a clean ${c.short} reference`,
      text: `Grab ${c.reference}. One sharp, high-contrast image traces far better than a busy or blurry one. You use your own image — TraceMate just overlays it.`,
    },
    {
      title: 'Open TraceMate and drop it in',
      text: `Open tracemate.art in your phone browser, allow camera access, and load your ${c.short} image. Nothing to install.`,
    },
    {
      title: 'Prop your phone over the paper',
      text: 'Use a stand or a stack of books and aim the camera straight down at your sheet. A steady phone is the secret to clean lines.',
    },
    {
      title: 'Line up and lower the opacity',
      text: `Pinch to scale and drag to place ${c.short} where you want on the page, then drop the overlay to 30–50% so you can see both the lines and your pencil.`,
    },
    {
      title: 'Trace, then redraw freehand',
      text: 'Follow the big shapes first, then the details. Trace it once or twice, then turn the overlay off and redraw from memory — that is how the skill sticks.',
    },
  ];
}

export function charFaqs(c) {
  return [
    {
      q: `Is tracing ${c.short} cheating?`,
      a: `No — tracing is a time-tested way to learn. Tracing ${c.name} trains your hand and your eye for the character's proportions; redraw it freehand afterward and the skill transfers.`,
    },
    {
      q: `What reference should I use to draw ${c.short}?`,
      a: `Use ${c.reference}. Pick one clean, high-contrast image — official art or a crisp screenshot works best. You bring your own image; TraceMate only overlays it on your paper.`,
    },
    {
      q: `Can I draw ${c.short} on my phone?`,
      a: `Yes. TraceMate runs right in your phone browser — point the camera at paper, line up your ${c.short} reference, and trace by hand. No app install, and every account gets one free session to try.`,
    },
  ];
}
