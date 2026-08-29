# Product

Written 2026-08-30 from established project truth in `PROJECT_STATE.md`,
`CAPABILITY_MAP.md`, `BUILD_PLAN.md`, and eleven working sessions with the
owner — not from a fresh interview. Correct anything that reads wrong.

## Platform

web

## Users

Naveen Reddy builds and operates this for his employer. The intended users are
that company's own creative and marketing people: they produce ad and campaign
material, they are not engineers, and they are not colourists or editors either.
They work at a desk, indoors, on a laptop, in sessions long enough that the
credit balance in the corner matters to them.

Today there is exactly one real user — the builder — plus whoever he shows it
to. HR and management have seen it over a public tunnel.

## Product Purpose

Turn a description into finished creative material — images, video, speech, and
3D meshes — through one workspace, on top of the company's existing BytePlus
ModelArk credits.

The working loop is not "type a prompt, receive an artifact". It is *generate,
tweak, compare*: settings are adjusted, a saved character is cast, a shot is
re-graded, and results are held side by side.

## Positioning

Built to reach the level of Higgsfield, using the full BytePlus catalogue rather
than a thin wrapper over three endpoints. `CAPABILITY_MAP.md` tracks that parity
gap honestly.

One capability is genuinely ahead: **3D generation**, which Higgsfield does not
offer at all.

## Operating Context

- Long working sessions at a desk, indoors, artificial light. Not mobile-first,
  though the nav already carries a mobile row.
- Every action spends real money. A generation costs credits; a failed one is
  refunded; a 3D mesh runs about $0.40 of provider spend.
- Generation is slow and asynchronous: images seconds, video a minute or two,
  a 3D mesh around 100 seconds. Waiting is a normal state, not an edge case.
- Nothing is deployed. It runs locally, exposed by a tunnel when shown.

## Capabilities and Constraints

Shipped: text and multi-reference image, batch of up to 15, image-to-video,
first/last keyframes, video extend and edit, standard and expressive speech,
speech-to-text, text-to-3D and image-to-3D, saved characters usable across every
tool, a camera/lens/look shot grammar shared by Studio and both agents, semantic
search over the user's own library, prompt-box attachments.

Hard constraints, all confirmed live and recorded in `MODELARK_API_REFERENCE.md`:

- The provider **rejects input images that may show a real human face**. This
  blocks lipsync and limits character work to generated or non-portrait imagery.
- Voice cloning fails upstream at the provider's gateway. Not our bug; blocked
  on their support.
- Credit cost and model id are coupled — changing one without the other
  silently mis-bills against real spend.
- The provider's documentation is incomplete and its samples are sometimes
  wrong. Contracts are marked confirmed or unconfirmed for this reason.

## Brand Commitments

The gradient mark (violet → magenta → orange) is the product's logo and is
recognised by people who have already seen the tool. It survives as the mark.

**Not a commitment:** that gradient as the interface's accent everywhere. The
owner chose on 2026-08-30 to replace the visual world with something that reads
as professional film-studio software.

Name in use: **Creative AI**.

## Evidence on Hand

Real generated output across every capability, the user's own library, live
provider errors, measured costs and timings. No customer quotes, no benchmarks,
no pricing — none exist, and none may be invented.

## Product Principles

- **Verify before claiming.** A contract is confirmed only when a real call
  proved it. This project lost days to assumed shapes.
- **Never spend the user's money silently.** Cost is shown before the action,
  refunds are automatic, and indexing that costs tokens is user-triggered.
- **An error names its recovery.** "It failed" sends the user back to the same
  button with the same settings.
- **Show what will be sent.** Composed prompts are displayed, not applied
  behind the user's back.

## Accessibility & Inclusion

Dark interface by deliberate choice, not habit. Contrast is measured, not
eyeballed: `--text-faint` was raised after measuring 3.47:1. A systemic
`:focus-visible` ring exists, `prefers-reduced-motion` is honoured, and status
regions announce through `aria-live`.

Open: a full keyboard walkthrough of Studio.
