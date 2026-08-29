# Design

The durable visual system for Creative AI. Written 2026-08-30, replacing the
gradient-accented world that preceded it.

Direction seed key `3ef0e060` (scope: direction, mode: operate, assigned
index 6 of the grounded list).

---

## Direction contract

**THESIS.** A generation is a *take*, and this interface is the paperwork that
records it. The category ships a chat box with a gallery under it and calls the
output "results"; this refuses that, and treats every job as a numbered take on
a camera report — settings are printed fields, the prompt is the notes column,
the keeper gets circled.

**OWN-WORLD.** Production paperwork rendered for a screen: the camera report and
the call sheet. Ruled field boxes whose label sits *inside* the rule, tabular
figures in mono, department-column layout, a stamped state block, and one
grease-pencil accent that only ever marks a take. Ink neutrals on a dark ground —
dark because the work being judged is imagery, viewed for hours under office
light, and paper-white would blow out every frame beside it. Recognisable with
all content removed by the ruled label-in-rule field and the take table.

**STORY.** The user understands they are running a shoot, not querying a model.
They believe the tool keeps an honest record: what was asked, what it cost, what
came back, what failed and why. They fill in a report and print takes.

**FIRST VIEWPORT (Studio).** A report header across the top — production name,
date, and the credit balance as remaining stock. Below it the setup block: mode
as a department selector, then the printed fields for this department. The notes
column — the prompt — is the largest field on the sheet, and the expose button
sits at its foot carrying the take cost. Takes accumulate beneath in a numbered
table.

**FORM.** Camera report / call-sheet paperwork. Position 6 on the ordered
grounded list (scopes, contact sheet, slate, lens barrel, EDL notation,
paperwork, stock packaging). No staging challenger was fused: the dealt cards
were a seven-segment display, a cracktro scroller, a green capsule lawn, and a
gate board. The gate board was the only near-fit and lost on product clarity —
its whole grammar is live reranking, and nothing here reranks.

---

## Colour

**Strategy: restrained.** Neutrals plus one accent. The user came to operate;
colour that owns regions would fight the imagery, which is the actual content.

Ground is dark, decided from the scene rather than by category habit: long
indoor sessions judging generated frames. A paper-white ground would make every
image look washed and every video look bright.

| Token | Value | Role |
|---|---|---|
| `--ground` | `#0b0b0c` | The desk. Neutral, not blue or violet |
| `--sheet` | `#141416` | A form laid on the desk |
| `--sheet-raised` | `#1b1b1e` | A field on that form |
| `--rule` | `#2a2a2e` | Printed rule |
| `--rule-strong` | `#3d3d43` | Rule under focus or on a header |
| `--ink` | `#ededee` | Filled-in value |
| `--ink-muted` | `#a1a1a6` | Printed body |
| `--ink-faint` | `#82828a` | Printed label. Measured ≥4.5:1 on all three grounds |
| `--pencil` | `#e0563c` | Grease pencil. The one accent |
| `--pencil-dim` | `#8f3728` | Grease pencil at rest |
| `--stamp-good` | `#5fa37a` | Approved stamp |

**The accent has one job.** `--pencil` marks a take: the selected reference, the
circled keeper, the primary action that spends credits. It is never decoration,
never a gradient, never a glow. If it appears somewhere that is not a take or an
action, it is wrong.

**Neutrals are truly neutral.** No violet or blue cast. The previous world's
tint made every generated image look colour-shifted next to it.

## The logo is the exception

The violet → magenta → orange gradient mark is a standing brand commitment
(`PRODUCT.md`). It survives **as the mark only** — the small rounded square in
the nav and on sign-in. It does not appear as an interface accent, a button
fill, a text fill, or a divider. That is the whole of its licence.

## Type

System stacks, in the mode's register. Operate surfaces are well served by
workhorse faces, and this world's sources were set in whatever the production
office had.

- **Prose and labels:** the platform UI stack.
- **Figures, settings, ids, timecodes, costs:** the platform mono stack, always
  with `font-variant-numeric: tabular-nums`. Numbers on a form line up in
  columns; proportional figures in a take table is the tell that nobody looked.

Labels are small, uppercase, and letterspaced — the printed field caption, not a
sentence. Values are ink, at rest, in normal case.

Tracking floor `-0.02em` on headings. No display type above `2rem`: a camera
report has no hero.

## Components

**Field.** The primitive. A bordered box whose caption sits inside the top rule,
notched into it, exactly as a form prints its field name. Focus raises the rule
to `--rule-strong`; it does not glow.

**Take table.** Numbered rows, tabular figures, the state stamped in a fixed
column. Rows are ruled, never carded — a card inside a form is a lapse.

**Stamp.** A short uppercase word in a hairline box: `EXPOSED`, `PRINTED`,
`NO GOOD`. State is stamped, not tinted into the whole row.

**Department selector.** The mode row. Segmented, hairline-divided, the active
segment carrying an inked bottom rule rather than a filled pill.

Corner radius stays at 2–4px. Paperwork has square corners; the small radius is
a screen concession, not a style. **No pills, no capsules, no 999px radius.**

## Prohibitions

Each is checked against the world's own materials — this world genuinely does
not use any of them.

- **No gradient anywhere but the logo mark.** Named because it is what we came
  from.
- **No card grids as page structure.** The sheet is the structure; rules divide
  it.
- **No pill or capsule shapes.** A form has no lozenges.
- **No glow, no coloured halo, no glass blur.** Elevation is a rule, or a
  shadow with a real offset — never both on one element.
- **No colour-coded rows.** State is stamped in its own column so a colourblind
  user reads it and a monochrome print still carries it.

## Motion

Almost none, and that is the world: paper does not animate. What moves is state
arriving — a take appearing in the table, a stamp landing. Exponential ease-out,
under 200ms, from an already-visible position. `prefers-reduced-motion` removes
it entirely.

## Accessibility

Every token pair above 4.5:1 for body and label text, measured rather than
judged. The systemic `:focus-visible` ring stays, drawn in `--pencil` — focus is
the user marking their place. State never depends on colour alone, which is what
the stamp column is for.
