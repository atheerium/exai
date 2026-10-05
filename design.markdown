# design.markdown — Exaai Neobrutalist System

Status: active spec. Supersedes the soft-shadow/soft-radius rules in `DESIGN.md` where they conflict.
Applies to: authenticated app (dashboard, builder, library, favourites, auth screens, ops).
Out of scope: the landing page (`src/app/page.tsx`) stays on the current soft system until it is redesigned separately.

## Why this change

Teacher feedback: the previous pass was "pretty but not clear". Buttons did not read as
pressable, fields blended into the page, and the contrast between control and surface was too
quiet to scan quickly. Neobrutalism is chosen deliberately for that reason: hard borders, flat
fills and physical shadows make every control's extent and state unmistakable at a glance.

Trade-off accepted: this is louder and less "calm" than the previous register. It suits a task
tool used in bursts under time pressure, but it is not a quiet reading environment. The exam
document surface (preview, print, PDF) is deliberately excluded from this treatment so generated
papers stay official-looking.

## Principles

1. **Structure is visible.** Every control has a hard 2px ink border. Nothing floats unframed.
2. **State is physical.** Buttons sit on a hard shadow and press down into it. No fades, no bounce.
3. **One loud accent.** Forest green marks the primary action only. Ink is for structure, not decoration.
4. **Flat fills.** No gradients, no blur, no glass. Surfaces are solid and tinted.
5. **Legible over elegant.** Weight and contrast carry hierarchy instead of size alone.

## Color

Structural ink is the existing deep green-black (`--foreground`), not pure `#000`, so the palette
stays on-brand and keeps the "tinted neutrals" law intact.

| Token | Value | Role |
| --- | --- | --- |
| `--background` | `150 40% 97%` | Page: slightly deeper so white cards separate hard |
| `--foreground` | `152 30% 9%` | Ink. Also the structural border colour |
| `--card` | `0 0% 100%` | Raised surface: maximum punch against the page |
| `--primary` | `152 68% 24%` | Forest green: primary actions, active step |
| `--primary-foreground` | `150 40% 99%` | Text on green |
| `--muted-foreground` | `152 14% 32%` | Darker than before: secondary text must be readable at a glance |
| `--border` | `152 30% 9%` | Borders are INK, not grey. This is the core change |
| `--input` | `152 30% 9%` | Field borders match, so fields read as strong as buttons |
| `--ring` | `152 68% 24%` | Focus ring: green, 3px, offset 2px so it reads on any surface |
| `--destructive` | `0 72% 48%` | Destructive actions |
| `--radius` | `0.25rem` | 4px: chunky, close to square, still not sharp |

Rules:
- Never tint a border grey. If it is a border, it is ink.
- No `bg-white/NN` translucency for structure. Transparency is only for overlay scrims.
- Success stays emerald so it does not collide with the forest-green primary.

## Elevation (hard shadows, zero blur)

Replace the blurred green-tinted shadow scale with hard offsets. This is the signature change.

| Token | Value |
| --- | --- |
| `shadow-xs` | `2px 2px 0 0 hsl(var(--foreground))` |
| `shadow-sm` | `2px 2px 0 0 hsl(var(--foreground))` |
| `shadow` | `4px 4px 0 0 hsl(var(--foreground))` |
| `shadow-md` | `4px 4px 0 0 hsl(var(--foreground))` |
| `shadow-lg` | `6px 6px 0 0 hsl(var(--foreground))` |

Rules:
- Never use a blurred shadow. If a shadow is needed, it is one of the offsets above.
- Resting controls use `shadow-sm`; primary CTAs use `shadow`.
- On `active`, the shadow is REMOVED and the element translates down-right by the same amount.
  This is the only animation on a control: `active:translate-x-[2px] active:translate-y-[2px] active:shadow-none`.

## Components

### Button
- Base: `border-2 border-foreground rounded font-bold shadow-sm`
- default: `bg-primary text-primary-foreground`, hover `shadow`, active presses in
- outline: `bg-card text-foreground`, hover `bg-accent`
- secondary: `bg-secondary text-secondary-foreground`
- ghost: `border-transparent shadow-none`, hover `bg-accent`
- destructive: `bg-destructive text-destructive-foreground`
- link: `border-0 shadow-none underline`
- Disabled: `opacity-100` with `bg-muted text-muted-foreground border-border` (a disabled control must
  still look like a control). Never rely on opacity alone.
- Focus: `focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background`
- Transition: `transition-transform` only. Colour changes are instant.

### Input / Select / Textarea
- `border-2 border-foreground rounded bg-card shadow-sm`
- Placeholder `text-muted-foreground` (no `/` opacity)
- Hover: `bg-accent/40`
- Focus: `ring-[3px] ring-ring ring-offset-2 ring-offset-background`, border stays ink
- Disabled: `bg-muted text-muted-foreground` (readable, still clearly a field)

### Card
- `rounded border-2 border-foreground bg-card shadow`
- Interactive cards: hover `shadow-lg`, active presses in

### Badge
- `rounded-full border-2 font-bold`
- default: `bg-primary/15 text-primary`
- success: `bg-emerald-100 text-emerald-900`
- muted: `bg-muted text-muted-foreground`
- outline: `bg-card text-foreground`

### Stepper (builder)
- Pill buttons become hard-edged: `rounded` with `border-2`
- Active: `bg-primary text-primary-foreground border-foreground shadow-sm`
- Locked: `bg-muted text-muted-foreground border-foreground`, not `opacity-40`
- Completed check stays visible

### Empty states
- `border-2 border-dashed border-foreground bg-card` (not a hairline grey dash)
- Always contain a real action button, never a dead end

### Toasts / Modal
- Toasts: `border-2 border-foreground shadow`
- Modal scrim: `bg-foreground/50`
- Modal panel: `border-2 border-foreground shadow-lg`

## Motion

- 100ms `ease-out` on transform only
- Button press: translate + shadow removal (the only signature motion)
- Toasts: fade in 150ms
- No bounce, no spring, no orchestrated page-load sequences, no animated layout properties

## Typography

- Inter, unchanged family
- Headings: `font-extrabold`
- Section labels, button labels, stepper: `font-bold`
- Body and fields: `font-medium` for labels, `font-normal` for input text
- Sentence case everywhere. No uppercase eyebrows. No em dashes.

## Accessibility

- Ink borders + flat fills mean contrast is structural: body text on `--card` must stay at or above
  WCAG AA (4.5:1), and no interactive control may rely on colour alone.
- Every icon-only control needs `aria-label` **and** `title`.
- Visible focus ring on every control.
- Disabled controls must remain legible, not just faded.

## Out of scope

- Landing page, exam document preview, print styles, PDF/DOCX rendering.
  These keep the soft system; a brutalist frame around an official exam paper would be wrong.
