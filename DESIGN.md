# Design

The durable visual system for Creative AI. Rewritten 2026-08-31.

## What this is

**The brief is pinned.** The owner named Higgsfield as the bar and showed its
surfaces. This system executes that canon at full fidelity rather than
interpreting it: the job is to reach that craft level for this product, not to
be different for its own sake.

It replaces a camera-report direction chosen from a concept roll the day before.
That direction was defensible and the owner did not want it. A pinned brief
beats a roll, and arguing the point was the mistake.

## Colour

Restrained: a dark canvas, neutral panels, one saturated signal.

| Token | Value | Role |
|---|---|---|
| `--bg` | `#0a0a0b` | The canvas. Panels float on it |
| `--surface` | `#151619` | A panel |
| `--bg-elevated` | `#1d1e22` | A chip or field inside a panel |
| `--surface-hover` | `#26272c` | Chip hover, and the active chip |
| `--border` | `#26272c` | Panel edge |
| `--border-strong` | `#3a3b41` | Active chip edge, scrollbar thumb |
| `--text` | `#ffffff` | 19.8:1 on the canvas |
| `--text-muted` | `#a0a0a8` | 7.6:1 |
| `--text-faint` | `#8b8b94` | 5.9:1 on canvas, 4.9:1 on a chip |
| `--signal` | `#d6f24f` | Primary actions only |
| `--signal-ink` | `#0a0a0b` | **The only ink allowed on the signal** |

**The signal always carries black.** White on it measures **1.26:1** — invisible.
Black measures 15.7:1. This is not a style preference; the hue admits one ink.

The signal marks the action that spends credits, and nothing else. Not headings,
not borders, not decoration.

The violet-magenta-orange gradient survives on the logo mark alone.

## Shape

Panels `18px`, controls `12px`, chips `10px`. Generous, because the canon is
soft-cornered panels floating on a canvas — not a ruled form.

Elevation is the raised surface itself. A panel is a lighter fill with a
one-pixel edge; there is no shadow under it as well.

## Components

**Panel.** The unit of layout. Setup is a panel, the composer is a panel, the
viewer is the canvas showing through.

**Chip (`.opt`).** How every setting is carried: value legible at a glance, the
whole chip a target, active state by fill and edge rather than colour.

**Composer.** One panel holding the prompt and the primary action side by side.
The prompt inside it carries no chrome of its own — a bordered field inside a
bordered panel is two frames around one input.

## Prohibitions

- **No white text on the signal.** 1.26:1.
- **No signal outside primary actions.**
- **No gradient outside the logo mark.**
- **No border plus shadow on one element.** Elevation is declared once.
- **No platform scrollbars.** Three scrolling regions would otherwise put three
  chunky light bars down a dark canvas; they are hairlines in the rule greys.

## Motion

Short, and only on state: hover fills, a result arriving. Under 200ms.
`prefers-reduced-motion` removes it.

## Accessibility

Every pair above measured, not judged. The `:focus-visible` ring is drawn in the
signal at 2px with an offset — it is the one place the signal appears that is
not a primary action, and it earns that as the keyboard user's only position
indicator.
