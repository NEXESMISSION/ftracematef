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
    "slug": "gojo",
    "name": "Gojo Satoru",
    "short": "Gojo",
    "franchise": "Jujutsu Kaisen",
    "difficulty": "Intermediate",
    "reference": "a clean front-facing piece of key art — the uncovered-eyes look if you want a challenge, the blindfold version if you want it easier",
    "whyRich": "the likeness lives in two things — the wide spacing and slight upward tilt of those glowing blue six eyes, and the white hair broken into a few big spiky clumps. miss the eye gap or the tilt even slightly and it stops being him, which is exactly where the AR overlay earns its keep.",
    "features": [
      "bright blue six eyes — the loudest identifier; they read almost backlit, paler and more saturated than a normal blue eye, with a clear ringed iris and small pupil",
      "white hair swept up and back into a few spiky clumps, parting away from the forehead rather than falling flat",
      "no facial scars or marks — clean skin; don't add sukuna-style face markings or toji-style scars",
      "black bandage blindfold (mission look) worn flat across the eyes and wrapped around the head, OR round dark blinder-style shades (casual look)",
      "straight, fairly narrow nose and a relaxed, slightly smug mouth — the calm, confident expression is part of the likeness",
      "dark navy high-collared jujutsu high jacket with a zip running up the standing collar",
      "sharp jaw and lean adult face — he's a grown man, not a soft teen face"
    ],
    "proportionNote": "set the eyes at roughly the horizontal midline of the head with about one eye-width of gap between them; keep them fairly large and almond-shaped but tilted slightly up at the outer corners — that outward tilt plus the wide-ish spacing is what reads as gojo rather than a generic anime guy.",
    "tips": [
      "lock the eyes first. trace the outer eye outline, the gap between the eyes, and the upward outer-corner tilt before anything else — this carries the whole face, so check it against the overlay twice.",
      "block the hair as 3-5 big clumped spikes radiating up and back from the part, not as strands. trace the outer silhouette of each clump first, then drop in only a few interior split lines.",
      "save the iris and pupil for last and keep both eyes matched — same size, same height, same tilt. uneven eyes are the fastest way to lose him.",
      "for the blindfold version, trace the band as one smooth shape that follows the curve of the skull, then add the small wrap creases — it hides the hardest part, so start here when you're new.",
      "keep the face clean — resist adding cheek lines, scars, or marks. his skin is plain; the drama is all eyes and hair.",
      "when you lift off the overlay to redraw freehand, rebuild in the same order — eye spacing, hair clumps, then details — so the proportion you traced is the proportion you keep."
    ],
    "mistakes": [
      {
        "mistake": "eyes drawn too close together or too small, turning him into a generic anime face",
        "fix": "leave a full eye-width between the eyes and keep them large; verify the gap directly against the overlay before inking"
      },
      {
        "mistake": "coloring the eyes a flat dark or plain blue so they lose the six-eyes glow",
        "fix": "use a bright blue with a paler center and leave a clear highlight; the eyes should look lit from within, lighter than you think"
      },
      {
        "mistake": "drawing the white hair as many thin individual strands, which goes muddy and flat",
        "fix": "commit to a few big spiky clumps; trace silhouettes first and add only 2-3 interior split lines per clump"
      },
      {
        "mistake": "mismatched eyes — one higher, bigger, or tilted differently than the other",
        "fix": "trace both eyes off the same overlay guideline and check height and tilt as a pair, not one at a time"
      }
    ],
    "variations": [
      {
        "name": "blindfold (mission) look",
        "note": "easiest starting point — the black band covers the hardest feature. focus on the band following the skull curve and the spiky hair above it. great first trace."
      },
      {
        "name": "uncovered six eyes look",
        "note": "the challenge version — the eyes are fully exposed and carry everything. spend most of your time on eye spacing, tilt, and the blue glow with a clean highlight."
      },
      {
        "name": "sunglasses (casual) look",
        "note": "round dark shades instead of the band. trace the lenses as two even circles seated correctly on the nose; the eyes are hidden, so the likeness shifts to hair shape and jaw."
      }
    ],
    "faqsExtra": [
      {
        "q": "is gojo's hair pure white or does it have a blue tint?",
        "a": "it's white. the anime often shades it with a cool bluish-grey in the lowlights so it can read faintly blue, but the base is white — keep the main mass white and push cool tones only into the shadows."
      },
      {
        "q": "does gojo have any scars or facial markings?",
        "a": "no. his face is clean skin — no scars, no tattoos, no markings. those belong to other characters like sukuna or toji. adding any will instantly make it look wrong."
      },
      {
        "q": "what exact color are his eyes?",
        "a": "a bright blue — the six eyes. they're more saturated and lighter toward the center than a normal blue eye and should look like they're glowing, so keep a strong highlight and avoid going dark."
      },
      {
        "q": "should i trace the blindfold or the sunglasses version first?",
        "a": "blindfold if you want it easiest — the band hides the eyes entirely. sunglasses are also beginner-friendly since the eyes are covered. save the fully uncovered six-eyes version for when you're ready to nail eye spacing and tilt."
      }
    ],
    "construction": [
      "start with a slightly tall oval for the head — gojo's face skews lean, a softened inverted egg, not round. drop a vertical centerline; tilt it for three-quarter views and keep it curving over the skull so the hair sits right.",
      "set the eye line just below the halfway mark. gojo's eyes are large but narrow and almond, set fairly wide apart — leave a full eye's width between them. tilt the outer corners up slightly for the sharp, half-lidded look.",
      "build the nose low and the mouth close under it, leaving a long flat plane between brow and eye. give him a defined but narrow jaw that tapers to a soft point — he's sharp, not blocky. ears land between brow line and nose base.",
      "block the hair as one big mass first, not strands. gojo's hair is voluminous and pushed up and back off the forehead, parting into thick spiky clumps that frame the face. rough the silhouette before any internal lines.",
      "place the eyewear last as its own layer — either the blindfold band wrapping flat across the eye line and around the skull, or round dark glasses sitting on the nose, bridge crossing the centerline. build it over the finished face so it conforms.",
      "finish details: heavy upper lashline, the pale spiky hair tips, a few stray bangs over the brow, then jaw and neck. add the high collar of the dark uniform last."
    ],
    "palette": [
      {
        "part": "hair",
        "color": "white / pale ash-blue",
        "hex": "#E8ECF2"
      },
      {
        "part": "hair (cool shadow)",
        "color": "soft blue-grey",
        "hex": "#B7C3D4"
      },
      {
        "part": "eyes (the six eyes)",
        "color": "pale icy light-blue, luminous not saturated",
        "hex": "#ABD9EF"
      },
      {
        "part": "eye shadow/ring detail",
        "color": "cooler mid-blue at the iris edge",
        "hex": "#6FB4DD"
      },
      {
        "part": "skin",
        "color": "fair, slightly cool",
        "hex": "#F4DECB"
      },
      {
        "part": "uniform",
        "color": "near-black navy",
        "hex": "#1B1E26"
      },
      {
        "part": "blindfold/glasses",
        "color": "black with cool grey sheen",
        "hex": "#22242B"
      }
    ],
    "proTips": [
      "keep his hair white — render it with cool blue-grey shadows, never warm grey or beige. the blue undertone in the shadow is what reads as 'gojo' rather than generic white hair.",
      "keep the six eyes pale and luminous — they're a light icy blue, not a vivid saturated blue. don't flood the iris with dark color; the glow comes from keeping it light, ringing the edge a touch cooler, and leaving one or two crisp white catchlights as negative space.",
      "vary line weight: heavier on the upper lashline, jaw underside, and hair silhouette; lighter inside the hair clumps, on the nose, and around the iris so the eyes stay bright. uniform-width lines make him look stiff and off-model.",
      "let the hair breathe — leave negative space between the spiky clumps instead of filling every gap. gojo's hair reads as light and airy, so the white of the paper between strands is doing real work."
    ],
    "faqsMore": [
      {
        "q": "blindfold version or sunglasses version — which should i practice first?",
        "a": "start with the blindfold. it's a flat band that simplifies the eye area into one shape, so you nail the head and hair construction without fighting the eyes. graduate to the round glasses, then the bare six eyes last — that's the hardest to keep on-model."
      },
      {
        "q": "his hair never looks right — too flat or too messy. what am i missing?",
        "a": "you're probably drawing strands before mass. block the whole volume as one pushed-up, swept-back silhouette first, then carve a handful of thick clumps out of it. gojo has few large spikes, not many thin ones."
      },
      {
        "q": "should the eyes match, or is one different?",
        "a": "both eyes are the same pale light-blue — the six eyes are a matched pair, not heterochromia. keep them symmetrical in color and just let lighting, not hue, vary between them."
      }
    ]
  },
  {
    "slug": "sukuna",
    "name": "Ryomen Sukuna",
    "short": "Sukuna",
    "franchise": "Jujutsu Kaisen",
    "difficulty": "Advanced",
    "reference": "a sharp front or three-quarter shot where the face markings are clearly visible",
    "whyRich": "the likeness lives in symmetry and flat black — the four eyes, the forehead/cheek/nose lines all mirror across the centerline at matching heights, and because the marks are solid black with even weight, one stray-thick or crooked line reads as a mistake instantly instead of blending in like shading would.",
    "features": [
      "two black lines across the forehead, two horizontal lines across each cheek, and a line down the bridge of the nose — all flat solid black",
      "a second pair of eyes — one extra eye sitting directly below each main eye, four total, all matched in shape",
      "sukuna's eyes read red/crimson (not yuji's brown), with a black tattoo line crossing the eye region — the glare is sharp and cruel",
      "it's yuji's pink/salmon spiked hair, unchanged — sukuna doesn't restyle it; the markings and extra eyes do the work",
      "thick black markings continue onto the body — bands across the chest, abs, and forearms when shirtless",
      "sharp narrow eye shape with a heavy confident lid line — cruel, not soft and round like yuji's",
      "bold uniform line weight on every tattoo — flat black fills/strokes, not shaded gradients"
    ],
    "proportionNote": "the four eyes share two horizontal lines: main eyes on the upper line, the second pair one eye-height below, slightly narrower and tucked closer to the nose — keep both pairs level or the face tilts. the two forehead lines sit above the brows, parallel and even.",
    "tips": [
      "block the face shape and drop a vertical centerline plus three horizontal guides — forehead lines, main eyes, and the lower second pair — before any markings.",
      "trace one half of the tattoo lines, then mirror them across the centerline so left and right match at the same height instead of eyeballing each side.",
      "place all four eyes on their guides first; the second pair sits just under the main eyes, a touch narrower and angled the same way.",
      "keep every tattoo line flat solid black with even weight — forehead, cheeks, nose — don't taper or feather them.",
      "keep the hair as yuji's spiked pink masses — big shapes first, inner spikes after; don't restyle it or draw strand by strand.",
      "after tracing, redraw the markings freehand once with the overlay off to check your symmetry actually holds on its own."
    ],
    "mistakes": [
      {
        "mistake": "the second pair of eyes ends up too big or too far from the main eyes, so the face looks like two separate rows of normal eyes.",
        "fix": "make the lower eyes slightly smaller and tuck them right under the main ones on the lower guide, closer to the nose."
      },
      {
        "mistake": "the forehead or cheek lines on the two sides don't match — different heights or curve, making him look lopsided.",
        "fix": "trace one side, then mirror it across the centerline; check each line hits the same point relative to the eye, brow, and nose."
      },
      {
        "mistake": "shading or tapering the tattoos so they look like wrinkles or scars instead of flat marks.",
        "fix": "ink them as even solid-black lines and fills — no gradient, no thin-to-thick taper."
      },
      {
        "mistake": "drawing yuji's soft brown eyes and friendly look — or restyling the hair — instead of sukuna's red glare.",
        "fix": "keep yuji's hair as-is, color the eyes red/crimson, narrow the shape, harden the upper lid, and angle the brows down."
      }
    ],
    "variations": [
      {
        "name": "Yuji-vessel face (default)",
        "note": "the standard subject — four eyes, forehead/cheek/nose tattoo lines, yuji's unchanged pink hair, red eyes. nail the symmetry here first before anything fancier."
      },
      {
        "name": "true-form Sukuna (four arms, second face)",
        "note": "his real body — four arms total, a second face on the back of the head, and extra mouths on the cheeks/abdomen. trace the whole silhouette in masses first; the extra arms must mirror the main pair in length and angle."
      },
      {
        "name": "shirtless / full-body markings",
        "note": "the tattoo bands wrap the chest, abs, and forearms. follow the body's curve so each band bends around the form instead of sitting flat like a sticker."
      }
    ],
    "faqsExtra": [
      {
        "q": "how many eyes does Sukuna actually have?",
        "a": "in yuji's body, four — a normal pair plus a second eye under each. his true form keeps the four-eye layout too. always two matched pairs on two level lines, never random extra eyes."
      },
      {
        "q": "what color are the tattoos and eyes?",
        "a": "the markings are flat pure black. the eyes are red/crimson with a black line crossing the eye area — not yuji's brown. keep the tattoos black with no color so they stay the focal point."
      },
      {
        "q": "does Sukuna restyle yuji's hair?",
        "a": "no. it stays yuji's pink/salmon spiked hair, same style. only the markings and the extra red eyes change — don't part, slick, or fade it."
      },
      {
        "q": "do I have to draw the second mouth?",
        "a": "only in true-form shots, where the mouths sit on the cheeks/abdomen. the standard vessel face has no extra mouth — match what your own reference shows rather than adding it by default."
      }
    ],
    "construction": [
      "start with a slightly tall oval for the cranium, then square off the jaw — sukuna is lean and angular, not soft. mark a vertical centerline and an eye line a touch below the midpoint.",
      "lay in the four eyes FIRST, before nose or mouth — they anchor the whole face. one pair on the normal eye line, the second pair stacked directly above on the forehead with the same tilt and spacing. keep all four narrow and sharp with hard upper lids and red irises.",
      "drop the tattoo framework while the face is still clean: TWO parallel straight stripes across the forehead above the upper eyes (not one), curved stripes cupping under each eye pair along the cheekbone, and a marking running down the bridge of the nose. these are flat line tattoos, not shading — place them as construction guides.",
      "build the mouth wide and thin-lipped, then add the second mouth as a faint horizontal seam on each cheek — sukuna's cheek-mouths sit roughly between jaw and cheekbone, only obvious when grinning.",
      "mass the hair as a single spiky block: short, swept-up pink spikes with a jagged crown and sharp points — rough the silhouette before any internal strands.",
      "finish with the details — pointed canines, slit pupils, undereye sharpness, and clean the tattoo lines so they wrap the form rather than sitting flat."
    ],
    "palette": [
      {
        "part": "hair",
        "color": "ash pink / dusty pink",
        "hex": "#E8A6B0"
      },
      {
        "part": "eyes (iris)",
        "color": "crimson red",
        "hex": "#C0202C"
      },
      {
        "part": "eyes (sclera)",
        "color": "off-white in vessel form; darkens toward red in full manifestation",
        "hex": "#F2ECE6"
      },
      {
        "part": "skin",
        "color": "pale fair",
        "hex": "#F0D8C4"
      },
      {
        "part": "facial tattoos",
        "color": "near-black ink",
        "hex": "#15110F"
      },
      {
        "part": "kimono (Heian form)",
        "color": "deep black",
        "hex": "#1A1A1A"
      }
    ],
    "proTips": [
      "keep the tattoo lines a hair thinner than your face outline — they read as skin markings, not as carved grooves. heavy tattoo lines instantly look off-model.",
      "leave the sclera and the inner planes of the cheeks as clean negative space. sukuna's menace comes from sharpness and contrast, not from over-rendering — resist shading every eye socket.",
      "put your darkest weight at the upper lids and the corners of all four eyes, and let line weight taper as it leaves the jaw. that single hard accent on the lids carries the whole expression.",
      "for the grin, the cheek-mouths only show teeth when the main mouth is open wide — if he's calm or smirking, keep them as faint seams or omit them. drawing them gaping at all times reads as a mistake."
    ],
    "faqsMore": [
      {
        "q": "how many lines go across the forehead?",
        "a": "two parallel stripes, not one. a single bar is the most common off-model slip — keep the two matched in length and weight, sitting just above the upper pair of eyes."
      },
      {
        "q": "do the cheek tattoos curve up or down?",
        "a": "they curve down and outward, following the cheekbone away from the eyes — like brackets cupping each eye pair. straight or upward strokes break the on-model look."
      },
      {
        "q": "should i draw the second mouth on the cheeks every time?",
        "a": "no. it's a sukuna signature but it's only prominent when he's grinning or talking. for a calm or three-quarter portrait you can drop it to a thin seam, which often reads cleaner."
      }
    ]
  },
  {
    "slug": "naruto",
    "name": "Naruto Uzumaki",
    "short": "Naruto",
    "franchise": "Naruto",
    "difficulty": "Beginner",
    "reference": "a clear bust shot showing the headband with its engraved leaf symbol, the eyes and the whisker marks",
    "whyRich": "naruto is built from a few bold, repeatable shapes — triangular blond spikes, a straight headband band, and six clean whisker strokes — so you get a recognizable likeness without wrestling fine detail. the one piece of precision that sells it is the engraved konoha leaf-swirl on the metal plate, which is great early practice at placing a small mark cleanly.",
    "features": [
      "blond hair in big triangular spikes that splay outward and slightly downward — not a smooth dome",
      "three whisker-like marks on each cheek, six total, straight and evenly spaced",
      "blue forehead protector (headband) with a metal plate bearing the engraved konoha leaf-swirl symbol and two rivets",
      "wide round blue eyes with a clear catchlight",
      "in Part I, the orange-and-blue tracksuit with the high zip collar; the red uzumaki swirl crest sits on the upper back and is usually out of frame in a bust",
      "soft rounded jaw and full cheeks — a young, friendly face, not angular",
      "spiky bangs that frame the face below the headband, parted into a few pointed clumps over the forehead"
    ],
    "proportionNote": "his face reads young: eyes are large and sit on or just below the horizontal midline of the head, with the headband cutting across the upper third of the face just above the brow. cheeks are full and the jaw is soft and rounded — keep the chin short. the whisker marks live on the cheekbone area, roughly level with the bottom of the nose.",
    "tips": [
      "block the head as a slightly tall circle first, then drop the headband as a straight band across the upper third, just above the brow — it anchors every other feature.",
      "draw the metal plate as a rounded rectangle on the band, then add the konoha leaf-swirl (a curl with a downward tail) centered on it — this is the detail that makes it unmistakably naruto.",
      "build the hair as a handful of large triangular spikes radiating outward from the crown, with pointed bangs framing the face below the band; vary their length so it doesn't look like a comb.",
      "place the eyes large and round on the midline, leave a white catchlight in each, and keep them blue — wide eyes read as the young, eager naruto.",
      "lay the three whisker marks on each cheek as straight, evenly spaced strokes level with the base of the nose; keep both sides matching.",
      "once you've traced it, redraw the same head freehand from memory — the spikes and whiskers are simple enough that one freehand pass locks them in."
    ],
    "mistakes": [
      {
        "mistake": "drawing the hair as many thin small spikes so it looks like a hedgehog",
        "fix": "commit to roughly 6-9 big triangular clumps radiating from the crown; fewer, bolder spikes read as naruto."
      },
      {
        "mistake": "leaving the metal plate blank or guessing the symbol",
        "fix": "always add the konoha leaf-swirl (a comma-like curl with a downward tail) centered on the plate — a blank plate looks like a generic headband."
      },
      {
        "mistake": "uneven or curved whisker marks, or the wrong count",
        "fix": "exactly three per cheek, straight and parallel, evenly spaced and matching left to right; check spacing against the nose line."
      },
      {
        "mistake": "making the face angular with a long pointed chin",
        "fix": "keep cheeks full and the jaw rounded with a short chin — naruto's face is young and soft, not sharp."
      }
    ],
    "variations": [
      {
        "name": "academy-kid naruto (pre-headband)",
        "note": "swap the headband for dark, round-lensed goggles worn on the forehead; face is rounder and the hair shorter. good if your reference is young naruto."
      },
      {
        "name": "part i genin (classic)",
        "note": "the standard bust: blue headband with the leaf plate, orange tracksuit collar, wide blue eyes — the friendliest version to start with."
      },
      {
        "name": "shippuden / older naruto",
        "note": "longer face, hair spikes are longer and the bangs frame more of the face, orange-and-black jacket with the high collar; jaw is a touch more defined — trace this only once you're comfortable with the softer young proportions."
      }
    ],
    "faqsExtra": [
      {
        "q": "what exactly is the symbol on his headband?",
        "a": "it's the hidden leaf village (konohagakure) crest — a spiral/swirl with a short downward tail, engraved on a metal plate. trace it centered on the plate; a blank plate is the most common giveaway that it's unfinished."
      },
      {
        "q": "how many whisker marks does naruto have, and where?",
        "a": "three on each cheek, six total. they sit on the cheek roughly level with the base of the nose, straight and evenly spaced. keep both sides symmetrical."
      },
      {
        "q": "what colors do i use if i color it after tracing?",
        "a": "blond/yellow hair, blue eyes, a blue headband band with a silver-grey metal plate, and the part i outfit is orange with blue accents. the whisker marks are thin and dark."
      },
      {
        "q": "why do my spikes look wrong even when the outline is traced right?",
        "a": "usually the spikes are too many and too thin, or they all point the same way. make them large triangles that radiate outward from the crown at different angles and lengths, with pointed bangs framing the face below the band."
      }
    ],
    "construction": [
      "start with a slightly rounded square head — naruto's jaw is soft but not pointed. drop a centerline; on a 3/4 view bow it toward the turn so the face wraps.",
      "set the eye line just below the head's midline. naruto's eyes are large and round-ish but sit about one eye-width apart — normal spacing, not wide. block them as two leaning almonds, not circles.",
      "anchor the three features that lock the likeness to each other: the broad nose base sits about one eye-width below the inner eye corners, the mouth a nose-length under that, and the whisker marks ride the cheek between nose level and the eye's outer corner — three roughly parallel strokes per side, the middle one longest.",
      "lay the headband as a band across the upper forehead first, then build the hair mass OVER and around it. the band cuts the forehead high and the metal plate sits flat and centered.",
      "build hair as one spiky silhouette before any internal strands — wedge-shaped clumps radiating out, longest spikes pushing up and to the sides, shorter framing spikes falling beside the band. keep it a chunky mass, not feathered.",
      "last, drop in details: pupils and eye highlights, the whisker lines cleaned to even weight, headband knot/straps, and the jacket collar line at the neck."
    ],
    "palette": [
      {
        "part": "hair",
        "color": "golden blond",
        "hex": "#F2C744"
      },
      {
        "part": "eyes",
        "color": "bright blue",
        "hex": "#4AA8E0"
      },
      {
        "part": "skin",
        "color": "light tan",
        "hex": "#F4C9A0"
      },
      {
        "part": "whisker marks",
        "color": "black",
        "hex": "#1C1C1C"
      },
      {
        "part": "jumpsuit (main)",
        "color": "orange",
        "hex": "#F07A1A"
      },
      {
        "part": "jumpsuit accents / shippuden panels",
        "color": "black",
        "hex": "#1C1C1C"
      },
      {
        "part": "headband (silver plate, blue cloth band)",
        "color": "silver-grey plate",
        "hex": "#B8BCC0"
      }
    ],
    "proTips": [
      "vary line weight — heavier on the jaw, hair silhouette, and headband band; lighter inside the eyes and on the whisker marks so they read as marks, not scars.",
      "leave the hair highlights as negative space. don't draw shine lines — let the white of the paper sit where light hits the top of the spikes, and only shade the undersides of the clumps.",
      "keep the whisker marks even and symmetrical — three thin black lines per cheek, same weight left and right, with a clear white catchlight at the top of each pupil so the gaze reads open and bright.",
      "when you redraw freehand after tracing, rough the hair as one blocky wedge-mass first — beginners feather it into soft anime hair, which instantly stops looking like naruto."
    ],
    "faqsMore": [
      {
        "q": "should the whisker marks curve or stay straight?",
        "a": "keep them basically straight and parallel, following the cheek's angle toward the ear. they're flat black marks on the skin — a slight bow on a 3/4 view is fine, but don't curl them around the cheek like brackets."
      },
      {
        "q": "how do i keep naruto's hair from looking like a generic anime spike-head?",
        "a": "treat it as a chunky, wedge-shaped mass with relatively few large spikes, parted around the headband. his hair is blocky and bright, not thin or wispy — fewer, fatter spikes read more on-model than many thin ones."
      },
      {
        "q": "orange-and-blue or orange-and-black for the outfit?",
        "a": "both are canon — orange with blue accents is the part i jumpsuit, orange with black panels is shippuden. pick one and stay consistent; don't mix blue and black accents on the same drawing. the blue belongs to the part i suit and the cloth headband — the metal plate itself stays silver-grey in both eras."
      }
    ]
  },
  {
    "slug": "itachi",
    "name": "Itachi Uchiha",
    "short": "Itachi",
    "franchise": "Naruto",
    "difficulty": "Intermediate",
    "reference": "a front-facing shot with the Sharingan eyes clearly drawn",
    "whyRich": "the likeness lives in two things working together — the low half-lidded eyelids and the pair of long straight tear-trough creases beneath them. nail that calm downward-weighted almond eye plus those parallel under-eye lines and it reads as itachi even before you add the sharingan.",
    "features": [
      "the two long tear-trough creases running from the inner-eye corner down past the cheekbones — straight, parallel, one per side, and the single strongest identifier",
      "calm half-lidded eyes with a low, flat upper lid — he almost never looks wide-eyed",
      "standard Sharingan: red iris, three black tomoe (comma shapes) evenly spaced around a small black pupil, all curling the same direction",
      "straight black hair center-parted into two long front curtains that frame the jaw, with a low ponytail tied behind",
      "scratched Hidden Leaf forehead protector — the leaf spiral slashed through with one horizontal line",
      "black Akatsuki cloak with red clouds, high collar usually zipped up to the chin",
      "purple painted nails and a cord necklace with three small rings (visible in cloak-open or pre-Akatsuki shots)"
    ],
    "proportionNote": "eyes sit low and narrow — the upper lid covers the top third of the iris, so each eye reads as a long flat almond, not a circle. the tear-trough lines start level with the inner corner of each eye and run roughly parallel down to cheek level; keep them straight and the same length on both sides.",
    "tips": [
      "block the head as an egg first, then drop the eye line low — the half-lidded look comes from a flat, low upper lid, so draw the lids before the iris",
      "trace both tear-trough creases as straight parallel strokes starting at the inner eye corner — thin lines, not scars; check they're equal length and angle before committing",
      "build the sharingan from the center out — small pupil, then iris ring, then three tomoe spaced like a clock at roughly 12/4/8, all curling the same rotational direction so they stay even",
      "split the hair into two front curtains from a clean center part; let them taper to points past the jaw, and keep the strands flowing the same direction",
      "give the headband a single clean horizontal slash through the leaf spiral — don't scribble it, it's one deliberate line",
      "once traced, lift the reference and redraw the eyes and tear-troughs freehand twice — that's the part your hand needs to own, not the cloak"
    ],
    "mistakes": [
      {
        "mistake": "drawing the eyes round and wide open",
        "fix": "lower the upper lid until it cuts off the top third of the iris — itachi's eyes are calm and half-closed, never alert"
      },
      {
        "mistake": "treating the tear-trough lines as scars or curving them",
        "fix": "they're smooth straight creases, not wounds — keep them thin, straight, and parallel; itachi has no facial scars"
      },
      {
        "mistake": "uneven or wrong-count tomoe in the sharingan",
        "fix": "always exactly three tomoe, evenly spaced around the pupil and all curving the same rotational direction"
      },
      {
        "mistake": "drawing his mangekyo as a sharp shuriken pinwheel",
        "fix": "itachi's mangekyo is three curved blade shapes curling into a rounded three-pointed motif — the spinning shuriken look belongs to a different uchiha, so trace his pattern, don't assume"
      }
    ],
    "variations": [
      {
        "name": "akatsuki front portrait (standard sharingan)",
        "note": "cloak collar up, scratched headband, three-tomoe sharingan — the most-traced version. focus on the eye shape and tear-troughs; the cloud cloak is easy filler"
      },
      {
        "name": "mangekyo sharingan close-up",
        "note": "swap the three tomoe for itachi's own mangekyo — three curved blade-like shapes bending around the pupil into a rounded three-pointed shape. it's a completely different center design, so trace the iris pattern carefully and don't default to a shuriken pinwheel"
      },
      {
        "name": "young anbu / pre-akatsuki itachi",
        "note": "no cloak, leaf headband intact (no slash), often the anbu mask or armor — younger softer face but the same low half-lidded eyes and tear-trough creases are already present"
      }
    ],
    "faqsExtra": [
      {
        "q": "are the lines under itachi's eyes scars or wrinkles?",
        "a": "neither, really — they're long tear-trough creases that are part of his design from a young age. treat them as smooth straight lines, not battle scars."
      },
      {
        "q": "how many tomoe go in the regular sharingan and which way do they curve?",
        "a": "exactly three, evenly spaced around the pupil, and all three curl the same rotational direction. mismatched counts or directions are the most common giveaway."
      },
      {
        "q": "what does itachi's mangekyo actually look like?",
        "a": "three curved blade-like shapes that bend around the pupil into a rounded three-pointed shape — not a sharp spinning shuriken. that shuriken-style pinwheel belongs to other uchiha, so trace itachi's specific pattern from your reference."
      },
      {
        "q": "why is the leaf symbol on his headband crossed out?",
        "a": "the single horizontal slash marks him as a missing-nin who cut ties with the village. keep it as one clean line — leaving the emblem intact reads as the wrong character."
      }
    ],
    "construction": [
      "start with a vertical oval for the cranium, then taper the lower third into a narrow, slightly pointed chin — itachi's face is long and lean, not round. drop a centerline straight down the middle.",
      "place the eye line at the vertical midpoint, then split the lower half again for the nose base, and halve that for the mouth. itachi's eyes sit fairly low and level — keep them calm and half-lidded, not wide.",
      "set the two defining under-eye lines FIRST: long straight indentations starting just below the inner eye corner and running straight down the cheek parallel to the nose. lock them in before the features so eyes, nose, and lines all align.",
      "block the hair as one heavy mass: a center part with two long bangs framing the face down past the jaw, the crown low over the forehead, and the rest pulled into a low ponytail behind. draw the silhouette before any strands.",
      "add the forehead protector band sitting low across the brow, steel plate over the bangs with a single horizontal slash through the leaf symbol, then refine the eyes — for sharingan, three tomoe around the pupil; mangekyo is three crossing curved blades forming a three-pointed pinwheel.",
      "last, carve detail: thin nose, narrow downturned-calm mouth, the high collar of the akatsuki cloak, then commit line weight and the hair strand breaks."
    ],
    "palette": [
      {
        "part": "hair",
        "color": "near-black with cool dark-blue/charcoal sheen",
        "hex": "#2b2b38"
      },
      {
        "part": "eyes (base)",
        "color": "dark onyx charcoal-black, calm",
        "hex": "#1f1f24"
      },
      {
        "part": "sharingan iris",
        "color": "crimson red with black tomoe",
        "hex": "#c01a1a"
      },
      {
        "part": "skin",
        "color": "pale, slightly cool fair tone",
        "hex": "#f0d8c4"
      },
      {
        "part": "akatsuki cloak",
        "color": "black with red, white-outlined clouds",
        "hex": "#161616"
      },
      {
        "part": "cloud accents",
        "color": "red",
        "hex": "#b81d24"
      },
      {
        "part": "forehead protector",
        "color": "steel-grey plate, blue band",
        "hex": "#8a8f96"
      }
    ],
    "proTips": [
      "keep the two under-eye lines thin and confident — one clean stroke each. if they wobble or get thick, he reads tired or scarred instead of calm and severe. they are itachi's single most recognizable feature, so commit.",
      "use heaviest line weight on the hair silhouette, the cloak collar, and the upper eyelids; keep the nose and the inner hair strands as the lightest lines so the face stays soft against the dark mass.",
      "leave the hair highlight as negative space — don't draw shine lines on black hair. block a clean band of untouched white along the crown and the top of the bangs, then ink the dark around it.",
      "stay on-model by guarding the calm: brows low and relaxed, lids half-closed, mouth a flat short line. the instant the brows arch or the eyes widen he stops being itachi. understatement is the whole character."
    ],
    "faqsMore": [
      {
        "q": "tomoe or mangekyo — which sharingan should i draw?",
        "a": "depends on the look. three black tomoe in a crimson iris is his standard sharingan. three crossing curved blades forming a three-pointed pinwheel is his mangekyo — note that's his shape, not sasuke's shuriken one. pick one and keep both eyes matched."
      },
      {
        "q": "why does my itachi look too young or too soft?",
        "a": "usually the face is too round and the lines are missing. lengthen the jaw to a lean point, drop the eyes slightly, and make sure the under-eye lines are present — they age and harden the face instantly."
      },
      {
        "q": "how dark do i actually ink the hair?",
        "a": "treat it as near-black but not flat black — leave a reserved highlight band and let a hint of cool blue-grey read in the shadow edges. solid pure black kills the form and the sheen."
      }
    ]
  },
  {
    "slug": "goku",
    "name": "Goku",
    "short": "Goku",
    "franchise": "Dragon Ball",
    "difficulty": "Beginner",
    "reference": "a clear shot of the head and hair, base form or Super Saiyan",
    "whyRich": "the entire likeness lives in the hair — the single forelock over the forehead plus the rounded, irregular spike cluster are what make it read as goku and not a generic spiky character; but the face isn't free either, the large heavy-upper-lid eyes carry the rest.",
    "features": [
      "base goku hair: black, matte (no shading gradients), with one defining forelock — a single thick lock hanging down over the forehead; the rest of the hairline spikes up and back, not down",
      "the spiky silhouette is a rounded, irregular cluster of points — fuller and more rounded at the back, never a neat fan or even star; no fixed point count",
      "eyes: large, dark, slightly rounded; the upper-lid line is heavier than the lower, pupils are solid black with minimal detail",
      "soft, friendly features — small nose, simple mouth, no sharp or heavy jaw; this is a good-natured young-adult face, not a hardened one",
      "Super Saiyan swap: hair turns golden and sweeps fully upward into fewer, taller, sharper spikes, eyes turn teal-green, and the forehead forelock lifts away",
      "no facial scars and no forehead marks at all — goku's adult face is clean (don't add vegeta's frown lines, a third eye, or a tail)",
      "orange gi (turtle-school, later his own design) with blue undershirt, blue wristbands and blue sash, dark blue boots with yellow trim"
    ],
    "proportionNote": "head is wide and rounded; the hair adds roughly another half-to-full head of height on top, so budget vertical space up front — set the eyeline around the horizontal midline of the face (not high), and keep each eye large, close to a third of the face width.",
    "tips": [
      "block the whole hair as one big rounded mass first — outline the outer silhouette before any internal spike, so the shape stays balanced instead of growing lopsided",
      "carve the gaps inward from that outer shape; cut sharp V-notches between spikes rather than drawing each spike as a separate triangle",
      "lock in the forehead forelock early — that single thick lock dropping over the brow is the strongest goku tell; place it before the rest of the spikes",
      "set the eyeline across the horizontal middle of the face and keep both eyes large and level; make the upper-lid line bolder than the lower — it does most of the work",
      "keep the face minimal and soft — small nose, simple mouth, no jaw shading; resist any line that would age or harden him",
      "once traced, redraw the hair freehand a few times from your own reference — the spike rhythm only sticks when your hand repeats it without the overlay"
    ],
    "mistakes": [
      {
        "mistake": "drawing each spike one at a time, so the head ends up lopsided or the spikes drift to one side",
        "fix": "commit to the full outer silhouette first as a single shape, then subtract the gaps — never build spike-by-spike"
      },
      {
        "mistake": "making the spikes too uniform and symmetrical, like a neat star or fan",
        "fix": "vary spike length and angle; goku's hair is irregular and rounder at the back — aim for organic clumps, not even points"
      },
      {
        "mistake": "forgetting the forehead forelock, so the face reads as a stranger or a different spiky character",
        "fix": "always include the single thick lock hanging over the forehead — it's the one feature that locks the likeness"
      },
      {
        "mistake": "adding scars, frown lines, or a tail and confusing him with vegeta or kid goku",
        "fix": "keep the adult face clean — no facial marks; only add the tail if you're deliberately tracing a kid-goku reference"
      }
    ],
    "variations": [
      {
        "name": "base form (black hair)",
        "note": "matte black, rounded irregular spikes, the forehead forelock present — the friendliest, easiest read for beginners; start here"
      },
      {
        "name": "Super Saiyan (golden)",
        "note": "hair sweeps fully up into fewer, taller, sharper spikes and the forelock lifts away; eyes go teal-green and the brow reads slightly more intense — leave the hair line-art open if you plan to color it gold"
      },
      {
        "name": "kid goku (early Dragon Ball)",
        "note": "smaller rounder face, proportionally larger eyes, and the monkey tail; hair is shorter and less voluminous than the adult spikes"
      }
    ],
    "faqsExtra": [
      {
        "q": "how many spikes does goku's hair actually have?",
        "a": "there's no fixed count — it shifts between scenes and artists. think in clumps, not numbers: a rounded back mass with a handful of points and the single forehead forelock. roughly 8-10 reads right, but the rhythm matters more than the tally."
      },
      {
        "q": "does goku have a scar or any forehead marks?",
        "a": "no. his adult face is clean — no scars, no forehead symbols. you may be thinking of vegeta's frown lines. keep goku's face simple and unmarked."
      },
      {
        "q": "what color is base goku's hair — is there any blue in it?",
        "a": "it's flat black. the anime sometimes adds a cool blue-grey highlight on the spikes to suggest shine, but the hair itself is black, not blue. true blue hair is Super Saiyan Blue, a different form entirely."
      },
      {
        "q": "should i trace base or super saiyan first?",
        "a": "base. the rounded black spikes and the forelock are more forgiving and teach you the core silhouette. once that's automatic, super saiyan is the same head with the hair swept up, sharpened, and thinned to fewer points."
      }
    ],
    "construction": [
      "block the head as a slightly tall oval, wider at the temples and tapering to a softish pointed chin — goku's jaw is angular but not square. tilt the oval for the pose before anything else.",
      "drop a centerline down the face and a horizontal eye line at the vertical midpoint. goku's eyes sit ON that midline, not high — anime-tall eyes mean the iris fills most of the opening. put the nose roughly midway between eye line and chin, and the mouth in the lower third, closer to the chin than the nose.",
      "set the eyes about one eye-width apart, large and slightly narrowed (determined, not cute). the inner corners point down toward the nose; the upper lash line is the heaviest dark mass. brows sit low and close to the eyes — that low brow is half of goku's expression.",
      "lay in the hair as a MASS first, not strands: a wide spiky silhouette that flares up and outward from the crown, framing the face. block the big shapes, then carve the front bangs — the iconic single point or split that drops over the forehead, plus the stray center lock.",
      "once the mass reads right, break the silhouette into individual flame-like spikes, each tapering to a sharp tip, radiating from a couple of crown 'roots'. keep every spike flowing in one rooted direction so it doesn't go fuzzy.",
      "add features last: small simple nose (often just a tick), neutral-to-firm mouth, ears on the eye-line-to-nose band, then the gi collar and the line of the neck into the trapezius."
    ],
    "palette": [
      {
        "part": "hair (base form)",
        "color": "black with blue-black sheen",
        "hex": "#1a1a22"
      },
      {
        "part": "eyes (iris)",
        "color": "near-black with a faint warm undertone",
        "hex": "#211a17"
      },
      {
        "part": "skin",
        "color": "warm light tan",
        "hex": "#f0c69a"
      },
      {
        "part": "gi (dogi top & pants)",
        "color": "orange",
        "hex": "#e8731f"
      },
      {
        "part": "undershirt / wristbands / obi sash",
        "color": "deep navy blue",
        "hex": "#16346e"
      },
      {
        "part": "boots",
        "color": "navy blue with yellow trim",
        "hex": "#16346e"
      },
      {
        "part": "super saiyan hair (variant)",
        "color": "golden yellow",
        "hex": "#f5d020"
      }
    ],
    "proTips": [
      "keep line weight heaviest on the outer hair silhouette and the upper eyelids — thin your lines on internal hair details and the nose so the face doesn't go muddy.",
      "leave the hair highlight as NEGATIVE SPACE — don't draw a white shape, just stop your black short of the crown sheen. base-form goku's blue-black sheen lives where the light hits, usually upper-left of the spikes.",
      "shade the gi only in the folds and the underside of the collar; orange reads best left mostly flat with a few hard creases at the elbows, sash, and knees.",
      "staying on-model lives in the brow-to-eye gap and the hair root count — keep brows low and near the lids, and resist adding extra spikes. after tracing, redraw the hair freehand once with your reference covered to lock the silhouette into muscle memory."
    ],
    "faqsMore": [
      {
        "q": "is goku's hair actually black or dark blue?",
        "a": "canonically black. the blue you see is a painted sheen for volume — leave it as a highlight on a black mass, don't color the hair blue."
      },
      {
        "q": "what color are goku's eyes — they look brown sometimes?",
        "a": "base-form goku's eyes are black, not brown. the warm tint in some art is just lighting; keep the iris near-black (#211a17) so it reads on-model. they only turn teal-green in super saiyan."
      },
      {
        "q": "do the spikes change between kid goku, adult goku, and super saiyan?",
        "a": "yes — kid goku has a rounder, lower spread with more separate points; adult goku's mass is taller and wider; super saiyan pulls every spike upward and rigid, drops the front bangs, and turns the whole mass golden (#f5d020) with sharper, fewer roots."
      }
    ]
  },
  {
    "slug": "luffy",
    "name": "Monkey D. Luffy",
    "short": "Luffy",
    "franchise": "One Piece",
    "difficulty": "Beginner",
    "reference": "a front shot with the straw hat on and the scar under the eye visible",
    "whyRich": "luffy is built from a few bold, forgiving shapes - a round head, a dome-and-brim hat, two big eyes and a wide grin - so the likeness survives shaky lines. the low, wide eye spacing plus the two stitch-scars under his left eye are what actually say 'luffy', even when everything else wobbles.",
    "features": [
      "the straw hat: shallow straw dome with a wide flat brim and a red band wrapping the base of the crown - it's shanks's old hat",
      "two small stitch-like scar marks under his left eye (the viewer's right) - drawn as two short marks set side by side, not one line and not an X",
      "big round eyes with large dark pupils, set fairly low and wide on the face",
      "black, scruffy, short hair that pokes out from under the hat brim",
      "wide open-mouth grin showing the top row of teeth, corners pushing into the cheeks",
      "round soft jaw and a small simple nose - just a dot or short dash",
      "pre-timeskip red open vest and blue shorts; post-timeskip red vest with a yellow sash and the X chest scar"
    ],
    "proportionNote": "luffy's head is round, just a touch wider than tall. draw the eyes large and low - around the lower third of the face - with the wide grin just beneath them. the hat brim sits low across the forehead, so very little forehead shows.",
    "tips": [
      "start with a round head circle - just slightly wider than tall - then drop a horizontal line across the lower third for the eye level, since luffy's eyes sit low.",
      "trace the hat as a shallow dome plus a wide oval brim, then add the red band as a thin strip wrapping the base of the crown.",
      "place the two scar marks under his LEFT eye (your right as you look at him) - two short stitch marks side by side, never one line and never an X.",
      "keep the eyes big and round with large dark pupils, spaced fairly wide; a small nose-dot sits between and just below them.",
      "draw the grin as a wide arc that pushes up into the cheeks, showing the top teeth row - the open mouth is what sells the expression.",
      "once traced, redraw it freehand a couple of times focusing on eye spacing and scar placement - those two carry the likeness more than the hat."
    ],
    "mistakes": [
      {
        "mistake": "putting the scar on the wrong side, or drawing it as a single line or an X.",
        "fix": "it's two short stitch marks side by side under his LEFT eye (viewer's right). check your reference orientation before committing."
      },
      {
        "mistake": "setting the eyes too high, which makes him look generic and not like luffy.",
        "fix": "drop the eye line to the lower third of the head and tuck the hat brim low so little forehead shows."
      },
      {
        "mistake": "drawing the hat as a tall cylinder or cone instead of a shallow straw hat.",
        "fix": "keep the crown a low dome and make the brim wide and flat - the silhouette should read short and round."
      },
      {
        "mistake": "a closed or small smile that loses his energy.",
        "fix": "open the mouth into a wide grin showing the top teeth, with the corners pushing into the cheeks."
      }
    ],
    "variations": [
      {
        "name": "pre-timeskip straw hat boy",
        "note": "classic look - red open vest, blue shorts, hat on, scar visible, no chest scar yet. simplest to trace; focus on the round face and grin."
      },
      {
        "name": "post-timeskip",
        "note": "add the yellow sash and the X-shaped chest scar from akainu at marineford; the face is slightly leaner, hair a touch longer. trace the chest scar as a clean X."
      },
      {
        "name": "gear / action pose",
        "note": "hat often pushed back or held, brow lowered, mouth set hard instead of grinning. trace the changed eye and mouth shapes carefully - the expression is the whole point here."
      }
    ],
    "faqsExtra": [
      {
        "q": "which side is luffy's scar on?",
        "a": "under his left eye - that's your right as you look at him straight on. it's two short stitch-like marks side by side, not one line and not an X."
      },
      {
        "q": "what color is luffy's hat band?",
        "a": "red. the straw is a warm tan/yellow and a single red band wraps the base of the crown. the hat itself is shanks's old hat, originally roger's."
      },
      {
        "q": "why does my luffy not look like luffy even with the hat right?",
        "a": "usually the eyes are too high or too close together. drop them to the lower third of the face and space them wide - that plus the scar carries the likeness."
      },
      {
        "q": "do i draw the chest scar?",
        "a": "only on post-timeskip luffy. the X-shaped chest scar comes from akainu at marineford, so skip it for the younger pre-timeskip version."
      }
    ],
    "construction": [
      "start with a base circle for the cranium, then add a soft rounded jaw that tapers to a narrow, slightly pointed chin — luffy's head reads round-to-oval, wider across the cheeks than at the jaw, not blocky.",
      "drop a centerline and a low eye line — luffy's eyes sit low, around the lower third of the face, with a tall forehead/cranium above. space the two eyes fairly wide apart and keep them large and rounded.",
      "block the scar now even though you finish it last: two short stitch marks under his left eye, which is the viewer's right when he faces you. then set the small button nose on the centerline and the wide grin below it — his open smile stretches very wide, often out past the outer eye corners.",
      "lay the hair in as one rounded black mass capping the cranium — short outward tufts, low and slightly spiky, not tall. seat the straw hat on top: a shallow rounded crown with a wide brim, and rough in the band line where the crown meets the brim.",
      "add details: thin curved brows set just above the eyes, the simple ear, the red hat band, then clean up the jaw-to-neck line and the open collar of the red vest."
    ],
    "palette": [
      {
        "part": "hair",
        "color": "black",
        "hex": "#1a1a1a"
      },
      {
        "part": "eyes",
        "color": "dark brown / near-black",
        "hex": "#3b2a20"
      },
      {
        "part": "skin",
        "color": "warm tan",
        "hex": "#f3b98a"
      },
      {
        "part": "vest",
        "color": "red",
        "hex": "#d4322c"
      },
      {
        "part": "scar",
        "color": "muted pinkish skin tone",
        "hex": "#c97c63"
      },
      {
        "part": "straw hat",
        "color": "straw yellow",
        "hex": "#e6c34c"
      },
      {
        "part": "hat band",
        "color": "red",
        "hex": "#cc2e29"
      }
    ],
    "proTips": [
      "keep line weight even and confident — luffy is drawn with clean uniform outlines, no sketchy hatching. thicken only the outer silhouette and the underside of the hair mass where the hat seats.",
      "leave the hair flat black with one or two hard-edged negative-space highlights — don't render individual strands. give each eye a single small white catchlight and keep the whites clean.",
      "shade sparingly: a soft tone under the hat brim across the forehead, beneath the jaw, and inside the vest collar. his face stays mostly bright and open — over-shading kills the on-model look.",
      "guard the proportions to stay on-model: low wide-set eyes, big stretchy grin, small nose, and the scar always under his left eye. if the scar drifts to the wrong side or the eyes ride too high, it stops reading as luffy."
    ],
    "faqsMore": [
      {
        "q": "which side is luffy's scar on?",
        "a": "under his left eye — the viewer's right when he's facing you. it's two small stitch marks on the cheekbone, not a long slash, so keep it small and low."
      },
      {
        "q": "is luffy's hair ever shown with a highlight or is it pure black?",
        "a": "it's flat black in most official art. any highlight is a hard-edged negative-space shape, not a soft gradient — leave it as a clean white sliver rather than airbrushing it."
      },
      {
        "q": "should i trace the straw hat every time?",
        "a": "trace it once off your reference to learn where the brim sits relative to the eyes, then practice the head freehand without it. the hat hides proportion mistakes, so redrawing bare-headed is how you actually learn the face."
      }
    ]
  },
  {
    "slug": "zoro",
    "name": "Roronoa Zoro",
    "short": "Zoro",
    "franchise": "One Piece",
    "difficulty": "Intermediate",
    "reference": "a three-quarter shot showing the scar and the earrings",
    "whyRich": "zoro's likeness lives in hard geometry — a squared jaw, low narrow eyes, and a heavy straight brow — plus three identity markers that all sit on his LEFT side (viewer's right): the moss-green spikes, the vertical scar over his left eye (a post-timeskip feature), and the cluster of three earrings on the left ear. nail the side and the angular planes and he reads instantly.",
    "features": [
      "green spiky hair — short, layered, moss-green; the spikes point outward, not gelled flat",
      "vertical scar running down over his LEFT eye (viewer's right in a front-facing shot); post-timeskip that eye is almost always drawn closed",
      "three gold earrings hanging as a short cluster on his LEFT ear only — right ear bare",
      "hard angular jaw and a strong straight nose — built from flat planes, not soft curves",
      "dark, narrow eyes with a flat, unimpressed brow set low on the face",
      "long diagonal chest scar from his LEFT shoulder down to his RIGHT hip (visible when his coat is open)",
      "green haramaki (belly wrap) with the white-sheathed Wado Ichimonji riding at his left hip"
    ],
    "proportionNote": "his head reads squared-off — the jaw is wide and the chin is blunt with almost no taper. keep the face nearly as wide at the jaw as at the cheekbones, and set the eyes low and narrow so the heavy straight brow dominates the upper face.",
    "tips": [
      "block the head as a wide squared box first, not an egg — flatten the jaw and chin so the silhouette stays blocky.",
      "trace the face with straighter, harder strokes; let lines change direction at sharp corners instead of curving — cheek, jaw, and brow are flat planes.",
      "the eye scar is vertical and sits over his LEFT eye (viewer's RIGHT in a front shot). on post-timeskip refs that eye is almost always drawn closed — trace it as a shut line, not an open eye.",
      "put all three earrings on his LEFT ear as a short cluster of gold rings; keep his right ear bare — don't split them across both ears.",
      "keep the hair short and bristly — trace it as outward-pointing spikes from a low hairline, not long flowing strands; leave a small gap or two between clumps so it reads spiky.",
      "if the chest is in frame, trace the long diagonal scar from his LEFT shoulder down to his RIGHT hip as one clean line, not a cluster."
    ],
    "mistakes": [
      {
        "mistake": "putting the eye scar and earrings on the wrong side, or splitting the earrings across both ears.",
        "fix": "lock both onto his LEFT side (viewer's right in a front-facing shot): scar over the left eye, all three earrings clustered on the left ear, right ear bare."
      },
      {
        "mistake": "drawing the scarred eye open and bright, giving him a wide symmetrical stare.",
        "fix": "on post-timeskip refs the scarred left eye is almost always drawn closed — trace it as a calm shut line and let the right eye carry the gaze."
      },
      {
        "mistake": "rounding the jaw and softening the cheeks, which turns him into a generic pretty-boy.",
        "fix": "keep the jaw wide and angular with a blunt chin; use straight segments and sharp corners, not smooth curves."
      },
      {
        "mistake": "tracing the hair as long smooth strands or one helmet shape.",
        "fix": "break it into short outward spikes from a low hairline with a couple of gaps between clumps — bristly, not flowing."
      }
    ],
    "variations": [
      {
        "name": "post-timeskip (current era)",
        "note": "the default for most refs. include the vertical scar over the (usually closed) left eye, heavier features, the green haramaki, and the cluster of three earrings — the version with the most identity markers to lock onto."
      },
      {
        "name": "pre-timeskip (East Blue / early arcs)",
        "note": "younger and leaner — NO eye scar, both eyes open. don't add the scar here. keep the three earrings, green spikes, and squared jaw; that's what carries the likeness without it."
      },
      {
        "name": "serious / fighting pose with bandana",
        "note": "when he means it he ties the black bandana over his head, hiding the hairline. trace the bandana band and knot first, then let only the lower spikes show. the haramaki and the three swords at his hip become the anchor instead of the hair."
      }
    ],
    "faqsExtra": [
      {
        "q": "which eye has the scar, and which way does it run?",
        "a": "his LEFT eye — that's the viewer's right in a front-facing shot. the scar runs vertically, top to bottom over the eye. it's a post-timeskip feature, so only add it to current-era refs."
      },
      {
        "q": "is his scarred eye sealed shut for good?",
        "a": "not literally — post-timeskip Oda almost always draws the left eye closed, but Zoro has opened it in canon. for tracing, treat it as closed on most refs and trace a calm shut line."
      },
      {
        "q": "how many earrings and where do they go?",
        "a": "three gold earrings, all clustered on his LEFT ear, hanging together near the lobe. his right ear is bare — don't split them across both sides."
      },
      {
        "q": "what color is his hair, and how do I keep it from looking like a wig?",
        "a": "moss-green, short and spiky. trace it as outward-pointing clumps from a low hairline with small gaps between them; the gaps and sharp tips are what stop it reading as a smooth helmet."
      }
    ],
    "construction": [
      "start with the base head — zoro's skull reads square-ish, not round. block a slightly tall box for the cranium, then a firm tapering jaw that ends in a fairly sharp, narrow chin. keep the cheekbones high and the jawline angular.",
      "drop a vertical centerline and a horizontal eye line. zoro's eyes sit low and level, set wide and narrow. on a 3/4 turn, bow the centerline around the face mass so the far eye compresses — don't keep it flat.",
      "place the signature features relative to each other: heavy straight brows ride just above the eye line, close and slightly down-angled for the permanent scowl. the nose is small and straight, ending around the halfway mark between eye line and chin. the mouth is wide and flat, set a touch low. the scarred eye is his LEFT (viewer's right) — a vertical slash over the permanently closed lid in post-timeskip. establish which version you're drawing before you ink.",
      "build the hair as one mass, not strands. it's short, swept-up moss-green, spiky from the crown with the spikes leaning back and slightly up — a low forehead, hairline close to the brows. the three gold earrings hang off the LEFT ear (viewer's right); rough them in now so the ear placement is right.",
      "add the bandana (when worn) as a band across the forehead with two tails, then layer details last: the chest scar (the long diagonal slash from mihawk), neck tendons, and the angular shadow shapes under the brow and jaw."
    ],
    "palette": [
      {
        "part": "hair",
        "color": "moss / dark spring green",
        "hex": "#4a8b3b"
      },
      {
        "part": "eyes",
        "color": "dark grey-black (often inked near-black)",
        "hex": "#2b2b2b"
      },
      {
        "part": "skin",
        "color": "light tan / warm beige",
        "hex": "#f0c9a0"
      },
      {
        "part": "haramaki (belly sash)",
        "color": "green pre-timeskip, black post-timeskip",
        "hex": "#2f6b30"
      },
      {
        "part": "bandana / coat (post-timeskip)",
        "color": "black",
        "hex": "#1a1a1a"
      },
      {
        "part": "earrings",
        "color": "gold (three, left ear)",
        "hex": "#d4af37"
      },
      {
        "part": "wado ichimonji (hilt + saya)",
        "color": "white hilt wrap and white scabbard",
        "hex": "#e8e4dc"
      }
    ],
    "proTips": [
      "vary your line weight — thick, confident outlines on the jaw, hair silhouette, and brow; thinner interior lines for the nose and minor folds. zoro should look heavy and solid, never wispy.",
      "leave the hair highlight as negative space — don't draw individual strands. a clean unshaded band near the crown plus the paper-white gaps between spikes sells the moss-green better than rendering every clump.",
      "keep the scowl in the brow distance and eye spacing, not in extra wrinkles. on-model zoro is the wide narrow eyes plus low straight brows — if the eyes drift round or the brows lift, he stops reading as him.",
      "place shadow as hard angular shapes — under the brow ridge, beneath the jaw and cheekbone, and inside the neck. avoid soft gradients; oda's style is high-contrast cel shading. let the eye scar catch a thin highlight so it reads as raised."
    ],
    "faqsMore": [
      {
        "q": "which eye has the scar, and when do i draw it?",
        "a": "his left eye — viewer's right. it's a vertical slash over the permanently closed lid and only exists post-timeskip. for pre-timeskip zoro, leave both eyes open and skip it entirely."
      },
      {
        "q": "what color is the wado ichimonji's scabbard?",
        "a": "white — both the hilt wrap and the saya are white. that all-white sword is the easy way to pick it out from his other two katana, so don't tint the sheath red."
      },
      {
        "q": "why does my zoro look too young or too soft?",
        "a": "usually a too-round head and too-tall eyes. square the cranium, sharpen the chin, drop the eyes lower and make them narrower, and thicken the brows. his proportions are blockier and more adult than most straw hats."
      }
    ]
  },
  {
    "slug": "tanjiro",
    "name": "Tanjiro Kamado",
    "short": "Tanjiro",
    "franchise": "Demon Slayer",
    "difficulty": "Intermediate",
    "reference": "a bust shot showing the forehead scar, the earrings and a bit of the checkered pattern",
    "whyRich": "three things lock the likeness at a glance: the forehead mark, the black-and-teal-green checkered haori, and the warm reddish gradient running through both the hair (burgundy to red-orange tips) and the red eyes. nail those and he's unmistakable; flatten the hair to one tone or miss the haori squares and he turns generic.",
    "features": [
      "forehead mark changes across the series: a faint birthmark scar he was born with, enlarged and darkened by a brazier burn early on (shielding his little brother), then a flame-shaped Demon Slayer Mark in the final arcs — know which version your reference shows",
      "hair: dark reddish-brown (burgundy) base that fades to brighter red-orange at the tips, slightly wavy and unruly, parted loosely with strands falling over the forehead",
      "eyes: large reddish (dark garnet) irises with a soft lighter gradient toward the pupil — their own red tone, not just a copy of the hair color",
      "the checkered (ichimatsu) haori: black and dark teal-green squares — his single most recognizable item",
      "hanafuda-style earrings: pale discs with a red rising-sun mark up top and vertical lines below",
      "outfit under the haori: the standard dark Demon Slayer Corps gakuran-style uniform",
      "thick, slightly angular eyebrows and a soft rounded jaw — a kind expression rather than a sharp one"
    ],
    "proportionNote": "eyes sit large and fairly low on a soft, rounded head — around the lower half. keep the outer corners tilted gently up and leave a wide gap between them; over-narrowing the eyes or pushing them too high makes him read as a sharper, older character and kills the gentle look.",
    "tips": [
      "trace the head and hairline first, then place the forehead mark in the upper-center before any hair strands cross it — strands should sit over it, and remember the mark differs by arc (birthmark/burn scar early, flame shape late)",
      "lay in the eyes large and low with the outer corners tilted up; trace the iris outline, then shade them red — darker at the top edge fading to a lighter red toward the pupil, kept distinct from the hair",
      "trace the hair as a few big clumped shapes, not strand-by-strand — keep the wavy unruly edge, then split into red-orange tips only after the base burgundy shape is down",
      "do the haori collar as a clean V first, then overlay the checkerboard so the black-and-teal-green squares follow the fabric's angle instead of sitting flat",
      "keep the squares slightly irregular and let them bend at folds — perfectly even squares look printed, not worn",
      "trace the earrings last as small discs with the red rising-sun mark and vertical lines, placed symmetrically against the jawline"
    ],
    "mistakes": [
      {
        "mistake": "drawing the late-series forehead mark as a plain straight gash",
        "fix": "for later arcs it's the flame-shaped Demon Slayer Mark, not a single line — trace the irregular flame edge; only the early version is the simpler birthmark/burn scar"
      },
      {
        "mistake": "coloring the hair flat single-red or flat brown",
        "fix": "it's a two-tone gradient — dark burgundy base melting into red-orange tips. trace the boundary between the two zones so the redraw keeps the fade"
      },
      {
        "mistake": "making the eyes sharp, narrow, or angry — or coloring them the same as the hair tips",
        "fix": "his eyes are gentle, rounded, and red with a soft upturn — widen them, round the lower lid, keep the brow relaxed, and shade them a darker garnet than the orange hair tips"
      },
      {
        "mistake": "painting the haori squares flat across the chest like a tablecloth",
        "fix": "the pattern wraps cloth — let the black-and-teal-green squares shrink and tilt over the shoulder and bend at every fold so it reads as fabric"
      }
    ],
    "variations": [
      {
        "name": "early-series bust (birthmark/burn scar)",
        "note": "forehead shows the plain birthmark scar darkened by the burn, hair tips less vivid. simplest version — good for a first pass focused on the haori"
      },
      {
        "name": "demon-slayer-mark / final arcs",
        "note": "the forehead mark is the spread flame shape and the expression reads more intense. trace the flame edge carefully and push the red hair tips brighter"
      },
      {
        "name": "action / sword pose",
        "note": "the haori is in motion, so the checkered squares stretch and skew with the cloth and the hair flares. block the body and blade angle first, then let the pattern follow the folds instead of staying grid-straight"
      }
    ],
    "faqsExtra": [
      {
        "q": "is his forehead mark a scar or a tattoo?",
        "a": "neither is a tattoo. he was born with a faint birthmark scar, a brazier burn enlarged and darkened it early on, and later it develops into a flame-shaped demon-slayer mark. check which arc your reference is from before you trace it."
      },
      {
        "q": "what exact colors are the haori squares?",
        "a": "black and dark teal-green — the ichimatsu (checkerboard) pattern. keep the contrast strong so it stays readable even small, and don't drift to a bright pure green."
      },
      {
        "q": "why does his hair look red in some refs and brown in others?",
        "a": "the base is a dark reddish-brown (burgundy) brightening to red-orange at the tips. lighting and arc shift how warm it looks, but it's always a gradient, never one flat tone."
      },
      {
        "q": "are his eyes the same color as his hair?",
        "a": "no — close but distinct. his eyes are red (a dark garnet) with a lighter red gradient toward the pupil. shade them deeper and cooler than the orange hair tips so they don't blend together."
      }
    ],
    "construction": [
      "block in a slightly tall egg for the head — wider at the cheekbones, tapering to a soft pointed chin. tanjiro's face is more angular than round, so flatten the sides a touch.",
      "drop a centerline and an eye line across the middle. set the eyes WIDE and large with a gentle downturn at the outer corners — kind, not sharp. leave a full eye-width of gap between them.",
      "place the scar high on the LEFT side of his forehead (viewer's right), above the eyebrow. it's an elongated burn mark, not a round dot. block it now as a landmark so the bangs and eyebrow build around it.",
      "anchor the eyebrows thick and fairly straight, low over the eyes. nose is small with a defined bridge; mouth sits close under it. keep the lower face short — chin doesn't drop far below the jaw corners.",
      "lay the hair as a single dark mass first: a center-ish part, bangs splitting over the brow, framing layers down the cheeks, length stopping near the jaw. carve spiky tips out of the silhouette last — don't draw strand by strand.",
      "add details on top: the black-and-green checkered haori collar, the hanafuda earrings hanging from each ear, then the eye highlights and scar texture."
    ],
    "palette": [
      {
        "part": "hair (main)",
        "color": "dark burgundy / near-black maroon",
        "hex": "#3a1f1f"
      },
      {
        "part": "hair (tips, sun-faded)",
        "color": "warm reddish-brown",
        "hex": "#7a3b2e"
      },
      {
        "part": "eyes",
        "color": "reddish to burgundy-garnet, lighter rims",
        "hex": "#8a2f2a"
      },
      {
        "part": "skin",
        "color": "warm light tan",
        "hex": "#f0c9a4"
      },
      {
        "part": "scar",
        "color": "reddish-brown raised mark",
        "hex": "#9c4a32"
      },
      {
        "part": "haori (checkered pattern)",
        "color": "black and dark green ichimatsu check",
        "hex": "#3e7a4e"
      },
      {
        "part": "earrings (hanafuda)",
        "color": "white card with red sun and red rays",
        "hex": "#e8e2d4"
      }
    ],
    "proTips": [
      "keep his expression soft. the downturned outer eye corners and slightly raised inner brows read as earnest — if the eyes go sharp or symmetrical, he stops looking like tanjiro and starts looking like a generic lead.",
      "vary line weight: heaviest on the hair silhouette and upper eyelids, lightest inside the iris and on the nose. let the hair read as a dark shape, not equal-weight outlines around every spike.",
      "leave the brightest highlight as untouched negative space — one clean catchlight per eye, plus a soft sheen band across the top of the hair mass. don't paint white over a filled area; plan the gap.",
      "once traced, redraw freehand and check three landmarks: scar on his left forehead, black-and-green checkered haori collar, hanafuda earrings. all three present plus gentle eyes means it's on-model even if your linework differs."
    ],
    "faqsMore": [
      {
        "q": "which side does tanjiro's scar go on?",
        "a": "his left forehead — that's the viewer's right when he faces you. it sits above the eyebrow, not on it, and it's an elongated burn mark. flip it and he looks subtly wrong even if people can't say why."
      },
      {
        "q": "is his hair black or red?",
        "a": "both, intentionally. the roots are a dark burgundy that reads near-black, fading to warmer reddish-brown at the tips. paint it as a dark base with a red-brown gradient toward the ends rather than flat black."
      },
      {
        "q": "what's actually on the hanafuda earrings?",
        "a": "white cards with a red sun and red rays fanning down from it — no green leaves. keep them simple: the white card plus the red sun motif is enough to read as tanjiro's earrings."
      }
    ]
  },
  {
    "slug": "levi",
    "name": "Levi Ackerman",
    "short": "Levi",
    "franchise": "Attack on Titan",
    "difficulty": "Intermediate",
    "reference": "a front or slight three-quarter shot with the undercut clearly visible",
    "whyRich": "the likeness lives in three things stacked together — the center-parted undercut, the half-lidded narrow grey eyes, and the permanent under-eye shadows. get those and he reads as Levi; soften any one of them and he turns into a generic anime boy.",
    "features": [
      "undercut hairstyle: smooth straight black top with a center part, sides and back shaved/cropped close — top hair falls in straight bangs evenly over the forehead",
      "hair color is flat black; the cut is precise and clean, not messy (any blue you see in the anime is just a shading highlight, not the base color)",
      "narrow, sharp eyes with small dull grey (steel-grey) irises and heavy upper lids — the half-lidded bored look",
      "low, straight, flat eyebrows that sit close to the eyes",
      "permanent slight under-eye shadows/dark circles — a signature, do not skip them",
      "lean angular face: narrow jaw, straight nose, thin flat mouth usually neutral or faintly down-turned",
      "Survey Corps outfit: tan/khaki jacket with the Wings of Freedom emblem on the back, white cravat at the neck, brown ODM gear straps over a white shirt"
    ],
    "proportionNote": "eyes sit low and wide-set on a narrow head — keep them small and horizontal, with the heavy upper lid cutting the top of the iris. the head is fairly small and the jaw tapers to a narrow chin; the brow-to-eye gap is tight, which is what gives the flat glare.",
    "tips": [
      "trace the undercut as two zones: the smooth dark top with a clean center part, and the close-cropped sides — keep the boundary between them sharp, not blended.",
      "lay in the bangs as straight strands falling evenly from the center part over the forehead; avoid soft rounded clumps or a side sweep.",
      "keep the eyes narrow and horizontal, and cut the top of each iris with a heavy upper lid — that half-lidded line is the whole expression.",
      "keep the irises small and a dull steel grey, then add the faint under-eye shadows once the eyes are placed — a light line or soft tone under each, never heavy bags.",
      "keep the brows low, straight and flat, close to the eyes — any arch makes him look surprised instead of stern.",
      "after tracing, redraw the jaw and nose freehand to stay lean and angular — narrow chin, straight nose, thin flat mouth."
    ],
    "mistakes": [
      {
        "mistake": "drawing big round shiny anime eyes",
        "fix": "shrink them, flatten the top with the upper lid, and keep the iris small and dull grey — he should look unimpressed, not wide-eyed."
      },
      {
        "mistake": "blending the undercut into a soft full head of hair, or giving him a side part",
        "fix": "keep a hard edge between the dark top and the cropped sides, and part the bangs down the center — the length contrast and central parting are the recognizable part."
      },
      {
        "mistake": "skipping the under-eye shadows",
        "fix": "add them lightly — without the dark circles the face looks too young and loses the tired, sharp Levi look."
      },
      {
        "mistake": "giving him arched or expressive eyebrows",
        "fix": "redraw the brows low, straight and flat so the resting face stays stern and neutral."
      }
    ],
    "variations": [
      {
        "name": "Survey Corps uniform (standard)",
        "note": "trace the tan jacket, white cravat and ODM straps; the Wings of Freedom emblem only shows on the back, so a front shot won't have it — don't invent it."
      },
      {
        "name": "three-quarter action / ODM gear pose",
        "note": "the center part reads as off-center from the angle and the undercut sides face you more; keep bangs flowing with the motion but hold the eyes narrow and the under-eye shadows in place."
      },
      {
        "name": "older / timeskip & cleaning-cap looks",
        "note": "for the later war-worn version the face is gaunter and harder; if your reference shows the cleaning headscarf, the undercut is hidden, so lean on the eyes and flat mouth for the likeness."
      }
    ],
    "faqsExtra": [
      {
        "q": "what eye color do i use for Levi?",
        "a": "dull steel grey — in the anime they read as a cold grey, shifting slightly with the lighting. keep the irises small and desaturated; avoid bright blue."
      },
      {
        "q": "side part or center part for the undercut?",
        "a": "center part. his straight bangs fall evenly from the middle of the forehead — a side sweep or off-center part reads as the wrong character."
      },
      {
        "q": "does Levi have any scars or marks to include?",
        "a": "no permanent facial scars in his standard look. the constant feature is the under-eye shadows, not a scar — don't add cuts unless your reference shows a specific injured scene."
      },
      {
        "q": "why does my Levi look too young or too soft?",
        "a": "usually three things: eyes too big, brows too high, and missing under-eye shadows. narrow the eyes, drop and flatten the brows, and add the dark circles."
      }
    ],
    "construction": [
      "start with a slightly tall, narrow oval for the cranium — levi's skull reads compact and rounded, not wide. drop the centerline and a low eye line that sits just below the vertical midpoint, since his eyes sit low and heavy on the face.",
      "block the jaw as a short, soft taper to a small chin — keep it lean but not pointed; levi's face is angular yet smooth, not chiseled. mark the cheekbone faintly, no hollow.",
      "place the eyes narrow and almond, angled slightly downward at the outer corners — this is the core of the bored, half-lidded glare. set the upper lid low and the brow nearly flat and close above it. inter-eye gap of about one eye-width.",
      "build the nose small and straight with a subtle pointed tip on the centerline, and a flat, neutral mouth a touch wider than the nose base — no curve.",
      "lay the hair as one mass first: an undercut, so the lower back and sides are tight and short, and the top falls in straight center-parted bangs that hang over the brow and frame the eyes. block the silhouette before any strands.",
      "add details last — the thin line under each eye, the straight bang tips, and the high collar with the ODM straps. keep the parting clean and the bang edges crisp."
    ],
    "palette": [
      {
        "part": "hair",
        "color": "black with a cool blue-grey sheen",
        "hex": "#1c1f26"
      },
      {
        "part": "eyes (irises)",
        "color": "dull slate grey, faintly cool",
        "hex": "#7c828a"
      },
      {
        "part": "skin",
        "color": "pale, slightly cool fair tone",
        "hex": "#ecd3c0"
      },
      {
        "part": "survey corps jacket",
        "color": "warm tan / light brown",
        "hex": "#b89a6a"
      },
      {
        "part": "cravat / shirt",
        "color": "off-white cream",
        "hex": "#efe9dc"
      },
      {
        "part": "ODM gear straps",
        "color": "dark muted brown leather",
        "hex": "#4a3a2a"
      },
      {
        "part": "wings of freedom emblem",
        "color": "white wings over a blue ground",
        "hex": "#3f5d8a"
      }
    ],
    "proTips": [
      "keep the lineweight thin and even — levi is a clean, controlled character. heavy or scratchy lines fight the model. reserve your darkest weight for the upper eyelid and the under-eye line so the glare reads.",
      "leave the hair as deliberate negative space: don't render every strand. block the black mass, then carve a few sharp highlight gaps along the part and bang edges so it stays glossy, not muddy.",
      "his eyes are the whole likeness — keep them low, narrow, and slightly downturned with a flat brow. if he starts looking surprised, lower the lids and flatten the brow until the bored look returns.",
      "shade with cool greys, not warm browns — a soft shadow under the bangs, along the jaw, and inside the high collar. catch the blue-grey sheen in the hair with a faint cool highlight rather than pure white."
    ],
    "faqsMore": [
      {
        "q": "how do i keep levi looking bored/cold instead of angry?",
        "a": "anger needs a furrowed, angled brow — levi's brow stays flat and relaxed. lower the upper lids halfway, keep the mouth a straight neutral line, and angle the outer eye corners slightly down. the deadpan comes from stillness, not tension."
      },
      {
        "q": "undercut or longer hair — which version am i drawing?",
        "a": "his standard survey corps look is the undercut: short, tight back and sides with a straight center-parted top. the longer, softer 'no undercut' version is mostly the older timeskip look. match the part and the back length to whichever reference you brought before you redraw freehand."
      },
      {
        "q": "what color are levi's eyes, really?",
        "a": "dull slate grey — desaturated and only faintly cool, not bright blue and not pure black. lay a muted grey base, pull a small cool highlight, and resist saturating it; push it too blue and it stops reading as his."
      }
    ]
  },
  {
    "slug": "eren",
    "name": "Eren Yeager",
    "short": "Eren",
    "franchise": "Attack on Titan",
    "difficulty": "Intermediate",
    "reference": "pick one era first — short-haired teen Eren or the long-haired later look — and trace from a single clear shot",
    "whyRich": "the likeness lives almost entirely in the eyes and brow — narrow teal-green eyes with a hard upper lid and low, slightly furrowed brows read as Eren before any hair is drawn. the hair silhouette then pins the era (chunky center-part teen vs. long loose center-part time-skip), so getting those two zones right matters more than rendering.",
    "features": [
      "middle-parted dark brown hair — ear-length, falling in chunky jagged points around the face in the early/Trost era",
      "teal green eyes, drawn narrow and intense; the inner-brow tension is what reads as anger, not the eye shape alone",
      "soft but defined jaw, slightly rounded as a teen, sharper and longer in the time-skip",
      "Survey Corps kit: light button shirt under a short tan-brown cropped jacket, the crossed Wings of Freedom on the back (one blue wing, one white), ODM harness straps over the thighs, hips and chest",
      "time-skip look: long center-parted hair grown out to about chin/shoulder length, hanging loose and often draped over the eyes — no shaved sides or undercut",
      "no permanent facial scar and no facial tattoo — he regenerates, so keep the skin clean unless a panel shows a fresh injury",
      "thick, slightly angled eyebrows that drive almost all of his expression"
    ],
    "proportionNote": "eyes sit near the vertical midline of the head and take up a tall slice of the face — keep them large with a sharp upper-lid line; the gap between the eyes is roughly one eye-width, and the brows ride close to the upper lid (low brow-to-eye distance), which is what makes him look intense rather than wide-eyed.",
    "tips": [
      "pick the era first and commit — early/Trost teen (short jagged center-parted hair, rounder jaw) or time-skip (long loose center-parted hair to chin/shoulder, longer sharper face). they are almost different proportions.",
      "trace the eye line and brow line as a pair before anything else, then the nose and mouth — lock the upper-lid angle and the low brow gap while the overlay is on, because that distance is the whole expression.",
      "block the hair as 4-6 big chunky wedges off a clear center part, not strands; the early look is jagged points framing the cheeks, the time-skip is longer smoother masses that hang loose over the eyes.",
      "mark the jaw and chin angle deliberately — round it for the teen, lengthen and sharpen it for the older Eren; this single line ages him more than the hair does.",
      "when you lift the overlay and redraw freehand, rebuild from the cross of the eye-line and the center-part so the features stay anchored instead of drifting.",
      "for color, keep eyes teal-green and hair a warm dark brown — don't go pure black hair or flat sky-blue eyes; both kill the likeness."
    ],
    "mistakes": [
      {
        "mistake": "giving him a facial scar, tattoo, or stubble to look tough",
        "fix": "leave the face clean — Eren regenerates and has no permanent facial marks; intensity comes from the brow and eyes, not added damage."
      },
      {
        "mistake": "drawing pure black, spiky shounen hair",
        "fix": "use warm dark brown and keep a visible center part; the chunks are wide wedges, not thin gel-spikes."
      },
      {
        "mistake": "adding a shaved undercut to time-skip Eren",
        "fix": "no undercut — the time-skip style is just longer hair grown out from the same center part, hanging loose over the eyes with the sides left full."
      },
      {
        "mistake": "eyes too round and brows too high, so he looks surprised instead of intense",
        "fix": "flatten the upper lid into a harder line and drop the brows close to the eye; a slight inward tilt of the inner brow gives the signature glare."
      }
    ],
    "variations": [
      {
        "name": "Trost-era teen (early series)",
        "note": "short ear-length center-parted hair in jagged points, rounder jaw, full Survey Corps uniform — light shirt, short jacket, ODM straps. trace the harness lines and the crossed Wings of Freedom on the back too; they carry a lot of the read."
      },
      {
        "name": "Time-skip / Marley-arc Eren (age 19)",
        "note": "long center-parted hair to chin/shoulder hanging loose over the eyes — no undercut. longer sharper face, tired hooded eyes, often a long coat or plain civilian clothes instead of the corps jacket. lengthen the whole face and lower the brow."
      },
      {
        "name": "Angry / battle-cry close-up",
        "note": "any era, but push it: gritted bared teeth, wide glaring eyes, brows crushed down, hair flying. trace the teeth and eye shapes carefully — the open mouth and bared teeth are easy to distort freehand."
      }
    ],
    "faqsExtra": [
      {
        "q": "what color are Eren's eyes and hair exactly?",
        "a": "eyes are teal-green (lean green when in doubt), hair is a warm dark brown — not black. avoid flat sky-blue eyes; the green tint is part of the likeness."
      },
      {
        "q": "does Eren have a scar on his face?",
        "a": "no permanent facial scar and no tattoo — his Titan regeneration heals wounds. only add visible injury if you're tracing a specific panel mid-fight."
      },
      {
        "q": "how is time-skip Eren different from early Eren when drawing?",
        "a": "longer center-parted hair grown out to chin/shoulder and hanging loose over the eyes (no undercut), a longer and sharper jaw, lower heavier brows, and usually civilian or long-coat clothing instead of the Survey Corps jacket."
      },
      {
        "q": "what makes a face actually look like Eren and not a generic anime guy?",
        "a": "the eye-and-brow zone: narrow teal-green eyes with a hard upper lid and low, slightly furrowed brows. nail that plus a clean center part and you've got him before any detail."
      }
    ],
    "construction": [
      "start with the head as a slightly tall egg — eren's skull is a touch narrower and longer than round, jaw tapering to a defined but not sharp chin. mark the centerline early since most of his expressions are 3/4 and the face turns on that axis.",
      "drop the eye line just below the vertical midpoint. eren's eyes sit fairly low and wide-set, with a hard upper lid line — keep them slightly narrowed, not big and round. the inner corners point down a hair, which reads as his default intensity.",
      "place the brow line close above the eyes — the short gap between brow and lid is the whole face. straight, low brows. the nose is small and understated, a simple bridge wedge, sitting midway between eye line and chin.",
      "block the hair as one mass before any strands: a center part with bangs falling in two main curtains framing the forehead, length to the jaw early-series, longer and tied back in the timeskip. let the silhouette of the mass read first, then carve.",
      "lay in the jaw-length side curtains and the V-notch at the part, then break the bangs into a few uneven clumps — chunky wedges, not feathered hairs. the back is slightly layered, not spiky.",
      "details last: the neck is thick (he's athletic), add the survey corps collar or the crossing X-pattern of the ODM harness straps across the chest, and only then the iris detail and lash accents."
    ],
    "palette": [
      {
        "part": "hair",
        "color": "dark brown",
        "hex": "#4a3b32"
      },
      {
        "part": "eyes",
        "color": "muted grey-blue (faint teal shift)",
        "hex": "#5b7a80"
      },
      {
        "part": "skin",
        "color": "warm light tan",
        "hex": "#e8c4a0"
      },
      {
        "part": "survey corps jacket",
        "color": "light tan-brown",
        "hex": "#b59a78"
      },
      {
        "part": "jacket collar / cuffs",
        "color": "white",
        "hex": "#f2efe9"
      },
      {
        "part": "ODM harness straps",
        "color": "tan leather",
        "hex": "#9c8260"
      },
      {
        "part": "wings of freedom emblem",
        "color": "blue & white",
        "hex": "#2e5b86"
      }
    ],
    "proTips": [
      "keep his eye color as muted grey-blue, not pure blue and not green — it shifts a touch toward teal with lighting but never goes saturated. swatch a desaturated blue-grey and stay there or he goes off-model fast.",
      "vary line weight: heaviest on the jaw, upper eyelids, and the hair silhouette; lightest inside the bangs and on the nose. a uniform-weight eren looks stiff and loses the intensity.",
      "leave the hair highlight as negative space — don't draw a white band, just let a clean unshaded zone sit along the top of the hair mass and the side curtains. cel-style, hard edge, no soft gradient.",
      "his default is a slight scowl, carried by the low straight brows and the short brow-to-lid gap — not by a frown line. if he looks calm or wide-eyed, lower the brows and narrow the lids before touching the mouth."
    ],
    "faqsMore": [
      {
        "q": "how do i make him look early-series vs timeskip eren?",
        "a": "early series: jaw-length loose hair, softer rounder face, clearer slightly more blue-grey eyes. timeskip: longer hair pulled back into a low half-tie with curtain bangs framing the face, gaunter cheeks, heavier shadow under the eyes, flatter dead-eyed stare."
      },
      {
        "q": "why does my eren read as a generic anime boy?",
        "a": "usually three things — eyes too big and round, hair too spiky, and the brow sitting too high. pull the eyes narrower and lower, keep bangs as chunky flat wedges, and crowd the brow down near the lids."
      },
      {
        "q": "what's the difference between eren and mikasa's faces so i don't draw them the same?",
        "a": "eren's face is longer with a more pointed chin, lower straighter brows, and a default scowl; mikasa's is a touch rounder and softer with calmer half-lidded eyes. their hair colors also differ — eren dark brown, mikasa pure black."
      }
    ]
  },
  {
    "slug": "pikachu",
    "name": "Pikachu",
    "short": "Pikachu",
    "franchise": "Pokémon",
    "difficulty": "Beginner",
    "reference": "a clear full-body or face shot in the modern art style",
    "whyRich": "pikachu is built from a couple of overlapping circles, so the overlay does most of the work — but the likeness lives in three exact details: black only on the ear tips, two red cheek circles set low and wide, and a true square-edged lightning-bolt tail. nail those and even a wobbly trace reads instantly as pikachu.",
    "features": [
      "round head wider than tall, with the two long ears continuing the same curve up off the top — ears are roughly as long as the head is tall",
      "ears have solid black triangular tips — this is the only black on the whole body",
      "two red circle cheeks low on the face — a solid, clean red, not a glowing neon red",
      "lightning-bolt tail with a square zig-zag silhouette; a small patch of brown fur sits only at the base where the tail joins the back",
      "two horizontal brown stripes across the lower back, ending where the tail begins",
      "small round black eyes each with a single white highlight dot, a tiny dot nose, and a simple wide curved mouth (a small open mouth when smiling)",
      "short stubby arms and feet with no visible fingers; pudgy egg-shaped body that blends into the head with almost no neck"
    ],
    "proportionNote": "head-to-body is roughly 1:1 — the head is about as big as the whole torso, and the eyes and cheeks sit in the lower half of the face, not centered. keep the eyes far apart with a wide gap between them.",
    "tips": [
      "block in two circles first — a bigger one for the head, a slightly smaller one tucked under it for the body — and let them overlap so there is no real neck",
      "draw the ears as long tapering shapes that flow straight off the top curve of the head, not stuck on as separate cones; angle them apart in a soft V",
      "trace the tail as a flat zig-zag with squared-off corners, like a bolt of lightning — keep these angles sharp even while every other line on the body stays rounded",
      "place the two cheek circles low and wide on the face, sitting just under the eyes, and color them a clean solid red — full red, just not a glowing neon",
      "ink the ear tips solid black and the two back stripes brown — leave the whole tail yellow with only a brown patch at its base; the tail tip is never black",
      "once the trace feels familiar, redraw it freehand from the same reference: rough the two circles in pencil, then commit the ears, cheeks, eyes and tail from memory"
    ],
    "mistakes": [
      {
        "mistake": "coloring the tip of the tail black — the classic false memory",
        "fix": "the tail is fully yellow with only a brown patch at its base where it meets the body. keep black on the ear tips only"
      },
      {
        "mistake": "muting the cheeks to maroon or brick red because you are afraid of bright red",
        "fix": "the cheeks are plain red circles in official art — use a clean solid red. only avoid a glowing neon red, not red itself"
      },
      {
        "mistake": "drawing the ears as separate cones plonked on top of the head",
        "fix": "let each ear grow out of the head's outline as one continuous curve, then taper to a point"
      },
      {
        "mistake": "centering the eyes and shrinking the head toward the body size",
        "fix": "keep the head nearly as big as the body and drop the eyes, nose and cheeks into the lower half of the face"
      }
    ],
    "variations": [
      {
        "name": "classic vs. modern proportions",
        "note": "gen-1 pikachu is chubbier with a fatter tail and smaller ears; the modern Sugimori and anime design is slimmer with longer ears. match your trace to whichever reference you brought and keep it consistent"
      },
      {
        "name": "male vs. female tail",
        "note": "if your reference is a female pikachu the tail ends in a heart-shaped notch — a V cut into the tip — instead of the full bolt. trace that dent rather than forcing the standard zig-zag"
      },
      {
        "name": "three-quarter or action pose",
        "note": "for a running or thunderbolt pose the body stretches and one ear overlaps the head. block the head and body circles at an angle first, then foreshorten the near arm and leg before adding details"
      }
    ],
    "faqsExtra": [
      {
        "q": "is pikachu's tail tip black?",
        "a": "no — that is a famous false memory. the tail is entirely yellow with only a brown patch at the base. the only black on pikachu is the triangular ear tips."
      },
      {
        "q": "what red do i use for the cheeks?",
        "a": "a clean, solid red — the cheeks are plain red circles in official art. do not mute them to maroon; just keep the red from glowing like neon."
      },
      {
        "q": "why does my pikachu look off even after tracing it cleanly?",
        "a": "usually proportions — the head should be nearly as big as the body and the eyes sit low and wide apart. if the head shrinks or the eyes drift to center, the likeness breaks."
      },
      {
        "q": "how do i draw the tail so it actually looks like a lightning bolt?",
        "a": "keep the corners square and the angles sharp — it is a flat zig-zag, not a curvy ribbon. it is the one part of pikachu that is not rounded."
      }
    ],
    "construction": [
      "start with the base head: pikachu's head is a wide, slightly squashed circle — closer to a rounded oval that's a touch wider than tall. block it in light, this is your anchor for everything.",
      "drop a centerline down the middle and an eye line across the lower-third of the head — pikachu's eyes, cheeks and nose all sit low, crowding the bottom half. the top half is mostly forehead and ear-room.",
      "place the two big oval eyes on the eye line, spaced about one-and-a-half eye-widths apart, then set a tiny dot of a nose high and centered just below them. the round red cheeks sit low and out near the jawline, roughly under the outer corners of the eyes — not up beside them.",
      "add the ears as the 'hair mass': two long tapering cones rising from the top-back of the skull, angled into a V. each is fat at the base, narrows to a point, and the top third is the black tip. keep them rooted behind the crown, not on top.",
      "build the body small under the head — pikachu is head-heavy and short. stubby arms, rounder belly, big rounded back paws with no separate toes, then the lightning-bolt tail jutting from the rump in sharp zigzag segments with a solid brown base at the bottom.",
      "finish with the on-model details: the small mouth, the two faint cheek-line/ear-base accents, the brown stripes on the lower back, and clean up the construction lines once proportions read right."
    ],
    "palette": [
      {
        "part": "fur / body (main)",
        "color": "bright yellow",
        "hex": "#F7D02C"
      },
      {
        "part": "cheeks",
        "color": "red circles",
        "hex": "#E2453B"
      },
      {
        "part": "ear tips",
        "color": "black",
        "hex": "#2B2B2B"
      },
      {
        "part": "back stripes",
        "color": "brown",
        "hex": "#9C6B3F"
      },
      {
        "part": "eyes",
        "color": "black with white highlight",
        "hex": "#1A1A1A"
      },
      {
        "part": "nose / mouth line",
        "color": "dark brown-black",
        "hex": "#3A2A1E"
      },
      {
        "part": "tail base",
        "color": "brown (lower tail)",
        "hex": "#9C6B3F"
      }
    ],
    "proTips": [
      "vary your line weight — heaviest on the outer silhouette and under the chin/belly where weight gathers, lightest inside on cheek circles and ear seams. uniform lines flatten the chub right out of him.",
      "leave the eye highlight as untouched paper — don't paint white over black. one clean negative-space dot in the upper part of each eye is what makes him look alive; a second tiny one reads even cuter.",
      "the cheeks are flat red discs, not glossy spheres — minimal shading. let the yellow fur carry the form instead: a soft shadow under the chin, beneath the ears, and along the belly curve where the body tucks back.",
      "staying on-model is mostly proportion policing — keep the head dominant, the ears rooted at the back crown (not antennae on top), the cheeks low, the back paws rounded and toeless, and the tail a hard-edged bolt with no soft curves. redraw freehand after tracing to lock those relationships into your hand."
    ],
    "faqsMore": [
      {
        "q": "are the ear tips half black or just the very point?",
        "a": "roughly the top third of each ear is black, with a clean diagonal cut where black meets yellow. don't taper it to a thin point — it's a solid chunk, and the divide is usually straighter on the front edge."
      },
      {
        "q": "do the brown back stripes go all the way up?",
        "a": "no — they sit only on the lower back, two short brown bands, and they're absent on the chest and face. female pikachu also have a heart-dent at the tail tip if you want that detail."
      },
      {
        "q": "why does my pikachu look too tall or grown-up?",
        "a": "you've probably shrunk the head or stretched the body. the modern on-model pikachu is short and head-heavy — head nearly as tall as the torso. push the cheeks lower, widen the eyes, and round the belly to pull him back to chibi proportions."
      }
    ]
  },
  {
    "slug": "anya",
    "name": "Anya Forger",
    "short": "Anya",
    "franchise": "Spy x Family",
    "difficulty": "Beginner",
    "reference": "a front-facing shot with both eyes and the hair \"horns\" visible",
    "whyRich": "the likeness lives almost entirely in two shapes — the giant wide-set green eyes and the two pointed hair tufts on top of the round head. nail those and the wide head, and anya reads instantly before you ink anything else.",
    "features": [
      "light/pale-pink hair, roughly chin-to-jaw length, blunt fringe sitting just above the eyes, ends curling slightly inward",
      "two pointed hair tufts rising from the top of the head — part of her hairstyle, not worn accessories; same pale pink as the rest of the hair",
      "huge oval green eyes set wide apart, with thick upper lashes and a bright highlight in each",
      "fair skin, small rounded nose barely indicated, tiny mouth that swings between wildly expressive faces (smug grin, wobbly cry)",
      "Eden Academy uniform: black pinafore dress over white collared shirt, red ribbon at the collar",
      "oversized round head on a small short body — classic chibi-leaning child proportion",
      "the whole top-of-head silhouette is those two pointed hair tufts — get their spacing and angle right and she reads instantly"
    ],
    "proportionNote": "head is roughly one-third of total height and nearly as wide as it is tall; the eyes are enormous — each spans about a quarter of the face width, sitting low and wide apart with close to a full eye-width gap between them. forehead is tall, chin is short and soft.",
    "tips": [
      "block the head first as a wide circle/oval — it's nearly round and oversized; everything else hangs off this",
      "place the two eyes large, low on the face and close to a full eye-width apart — wide spacing is the whole character; if they drift together she stops looking like anya",
      "trace the eyes as tall ovals with thick upper lashes and one big highlight each, and leave them bright — don't over-shade the iris",
      "draw the two pointed tufts as part of the hairline rising to points on top of the head, same pale pink as the hair — get their angle and the gap between them right, since that silhouette is what sells her",
      "shape the rest of the hair as a rounded helmet with a blunt fringe just above the eyes and ends curling slightly inward at chin/jaw length",
      "keep the body small and simple under the big head — black pinafore, white collar, red ribbon reads as anya instantly; redraw freehand once the proportions feel locked"
    ],
    "mistakes": [
      {
        "mistake": "drawing the two top points as stiff separate triangles instead of hair",
        "fix": "let them flow out of the hairline as pointed tufts of the same pale-pink hair — they're a hairstyle shape, not a worn accessory stuck on top"
      },
      {
        "mistake": "placing the eyes too close together or too high",
        "fix": "drop them lower on the face and leave close to a full eye-width gap between them; wide and low is what sells her"
      },
      {
        "mistake": "making the eyes too small or too detailed",
        "fix": "trace them oversized and keep them clean — big ovals, thick top lashes, one highlight; resist adding lots of iris lines"
      },
      {
        "mistake": "coloring the hair hot pink or reddish",
        "fix": "keep it light/pale pink — closer to pastel than magenta, including the two pointed tufts"
      }
    ],
    "variations": [
      {
        "name": "Eden Academy uniform (most iconic)",
        "note": "black pinafore dress, white collared shirt, red ribbon — trace the collar and ribbon shapes so the silhouette reads even in plain outline"
      },
      {
        "name": "casual home outfit",
        "note": "simpler clothes mean the whole likeness rides on the head — be extra strict about eye spacing and the two pointed tufts here"
      },
      {
        "name": "expression close-up (smug grin or 'heh' face)",
        "note": "crop tight on the face; the mouth distorts a lot but the eyes and the two hair points stay fixed — keep those locked and let the mouth go big and loose"
      }
    ],
    "faqsExtra": [
      {
        "q": "are the two points on her head part of her hair?",
        "a": "yes — they're pointed tufts of her hair rising from the top of her head, not worn accessories or headpieces. trace them as hair flowing to points, the same pale pink as the rest."
      },
      {
        "q": "what color are anya's eyes?",
        "a": "green, large and oval with thick upper lashes. keep them bright with a clear highlight — don't over-darken the iris."
      },
      {
        "q": "is there a separate spike that isn't one of the two points?",
        "a": "the two pointed tufts are the main top-of-head shape. if you add any small extra cowlick, treat it as part of the hair — there's no separate accessory up there."
      },
      {
        "q": "what pink is her hair — how light?",
        "a": "pale/pastel pink, not hot pink or red. think soft rose — and the two pointed tufts are that same pale pink, not a different accent color."
      }
    ],
    "construction": [
      "start with a slightly squashed circle for the cranium, then add a soft rounded jaw — anya's face is babyish: wide at the cheeks, short chin, almost as wide as it is tall. keep the bottom of the face rounded, never pointed.",
      "drop a centerline and place the eye line LOW — roughly at or just below the vertical midpoint. anya is small-child proportioned, so the eyes sit lower and the forehead reads taller than a teen character.",
      "block the two big rounded eyes far apart with a wide nose-bridge gap between them — leave more than one eye-width between them. her irises are large with the signature four-point starburst catchlights; eyebrows are short, thin, and sit high above the eyes.",
      "lay in the hair mass next: a soft rounded bob of pale pink hair that frames the face in two side sweeps, short forelock bangs over the forehead, and her single upright ahoge cowlick sticking off the crown — keep it asymmetric, not centered.",
      "add the two pink cone hairpieces if drawing the eden look — one on each side near the back of the bob. they sit on the hair, are decorative pieces, and do not replace the ahoge.",
      "finish with small details: tiny nose dot, small mouth low on the face, the round green eye highlights, and the smug or wobbly expression last so you can place brows and mouth together for the mood."
    ],
    "palette": [
      {
        "part": "hair",
        "color": "pale desaturated pink (reads ash-grey flat)",
        "hex": "#E4D2D6"
      },
      {
        "part": "hair shadow",
        "color": "muted rosy mauve",
        "hex": "#B89AA0"
      },
      {
        "part": "eyes (iris)",
        "color": "soft green",
        "hex": "#5FB87A"
      },
      {
        "part": "eye highlight",
        "color": "white starburst catchlight",
        "hex": "#FFFFFF"
      },
      {
        "part": "skin",
        "color": "warm pale cream",
        "hex": "#F8E1D2"
      },
      {
        "part": "eden uniform",
        "color": "charcoal-black with white collar trim",
        "hex": "#23232A"
      },
      {
        "part": "uniform accents",
        "color": "gold buttons / red bow",
        "hex": "#C9A23F"
      }
    ],
    "proTips": [
      "keep the lineweight thin and even — anya is a clean, soft character. heavy black outlines age her up and break the cute read. reserve any thicker line for the upper eyelid and the hair silhouette only.",
      "leave the eye highlights as pure negative space (white paper), not painted-over white. the big round catchlight plus the small starburst sparkle is what makes her eyes read on-model — don't crowd them.",
      "shade the hair with one soft mauve tone tucked under the bangs and behind the side sweeps, not all over. her hair is mostly flat pale value with minimal rendering; over-shading muddies the pale pink toward grey.",
      "stay on-model by watching the eye spacing and the ahoge placement — if the eyes drift together or too high, it stops looking like anya. her smug grin and the worried sweat-drop are separate expression states, so commit to one mood per drawing rather than blending them."
    ],
    "faqsMore": [
      {
        "q": "is anya's hair pink or grey? i can't tell from my reference.",
        "a": "both, depending on the art. canonically it's a very desaturated pale pink that reads almost ash-grey in flat color and shifts pinker in the anime's soft lighting. trace the value your reference shows, then when you redraw freehand, mix a pale grey with a touch of rose rather than a saturated pink — saturated pink is the most common off-model mistake."
      },
      {
        "q": "how big should the eyes actually be?",
        "a": "big, but spaced wide. each eye is roughly one eye-width tall and they sit low on the face with more than a full eye-width of gap between them. beginners draw them too close and too high — overlay your trace, then redraw checking that the gap and the low eye line survived."
      },
      {
        "q": "do i have to draw the pink horn things?",
        "a": "those are her two pink cone hairpieces, decorative accessories worn with the eden look — not horns and not part of the hair itself. for casual anya you can skip them and just keep the side bob and the single ahoge cowlick. add the two cones when you want the school version."
      }
    ]
  }
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
  const lead = c.whyRich || `${c.short} is a ${c.difficulty.toLowerCase()}-level character to trace.`;
  return `${lead} Trace it a few times, then redraw without the overlay — that last rep is where it actually clicks.`;
}

// Signature visual identifiers a tracer must nail to keep the likeness.
export function charFeatures(c) {
  return Array.isArray(c.features) ? c.features : [];
}

// A single character-specific proportion pointer (head/face/body sizing).
export function charProportion(c) {
  return c.proportionNote || '';
}

// Common failure cases that break the likeness, each with a concrete fix.
export function charMistakes(c) {
  return Array.isArray(c.mistakes) ? c.mistakes : [];
}

// Versions / forms / eras worth tracing, and how each changes the approach.
export function charVariations(c) {
  return Array.isArray(c.variations) ? c.variations : [];
}

// Character-specific construction order — how to build the figure from base
// shapes (distinct from the generic app-usage steps below).
export function charConstruction(c) {
  return Array.isArray(c.construction) ? c.construction : [];
}

// Canonical colors { part, color, hex } — doubles as a palette fact-check.
export function charPalette(c) {
  return Array.isArray(c.palette) ? c.palette : [];
}

// Finishing / technique advice (line weight, negative space, shading).
export function charProTips(c) {
  return Array.isArray(c.proTips) ? c.proTips : [];
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
  const base = [
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
      a: `Yes. TraceMate runs right in your phone browser — point the camera at paper, line up your ${c.short} reference, and trace by hand. No app install, and every account gets 3 free sessions to try.`,
    },
  ];
  // Character-specific FAQs (verified canon) come after the generic three.
  const extra = Array.isArray(c.faqsExtra) ? c.faqsExtra : [];
  const more = Array.isArray(c.faqsMore) ? c.faqsMore : [];
  return [...base, ...extra, ...more];
}
