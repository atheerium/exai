# DESIGN.md

> **Superseded in part.** `design.markdown` is the active spec: it replaces the soft blurred
> shadows, the large radii, and the grey borders described below with a neobrutalist system
> (2px ink borders, hard zero-blur offset shadows, 4px radius, press-on-active buttons).
> Where the two disagree, `design.markdown` wins. The sections kept below are still accurate:
> product context, the "tinted neutrals, never pure `#000`/`#fff`" colour law, typography
> (Inter), and the structural/absolute bans.

Design tokens for Exaai. Defined in `src/app/globals.css` (HSL custom properties) and `tailwind.config.ts`.

## Color strategy
Restrained: green-tinted neutrals + one accent (Forest green) reserved for primary actions, current selection, and status. Every surface carries a subtle green tint; never pure `#fff` or `#000`.

### Tokens (light theme, the only theme)
| Token | HSL | Role |
| --- | --- | --- |
| `--background` | `150 40% 98%` | Page background (Paper) |
| `--card` | `150 45% 99.4%` | Card surface, brightest layer |
| `--popover` | `150 45% 99.6%` | Popovers, toasts |
| `--foreground` | `152 30% 9%` | Ink (deep green-black) |
| `--primary` | `152 68% 24%` | Forest green, brand + actions |
| `--secondary` | `150 30% 95%` | Secondary buttons, soft fills |
| `--muted` | `150 28% 94.5%` | App shell wash, muted badges |
| `--muted-foreground` | `152 12% 37%` | Secondary text, AA on Paper |
| `--accent` | `148 45% 92.5%` | Hover tint (Mist) |
| `--destructive` | `0 72% 48%` | Destructive actions, AA on white |
| `--border` | `150 18% 87%` | Card borders |
| `--input` | `150 16% 81%` | Form control borders, clearly visible |
| `--ring` | `152 62% 34%` | Focus rings |

## Typography
Inter (400/500/600/700/800), loaded via Google Fonts in `src/app/layout.tsx`. One family carries everything. Product scale, tight ratios: text-xs 12, text-[13px], text-sm 14, base 16, text-[15px] for lg buttons, 4xl/6xl display on the landing hero. All button labels are `font-semibold`. No uppercase eyebrow labels; sentence case copy; no em dashes.

## Elevation
Green-tinted shadows, never pure black (`tailwind.config.ts` boxShadow overrides):
- `shadow-sm` (resting cards, buttons): `0 1px 2px hsl(152 40% 10% / 0.05)`
- `shadow` DEFAULT (hover lift): two-layer, 0.06-0.07 alpha
- `shadow-md`: two-layer, 0.09 alpha
- `shadow-lg` / `shadow-xl`: toasts, modals, landing hero mock

## Radius
`--radius: 0.75rem`. Cards and inputs use `rounded-lg` (12px), buttons `rounded-md` (10px), badges pills (`rounded-full`).

## Components
All primitives live in `src/components/ui/`. Every interactive component has default, hover, active, focus-visible, and disabled states:
- **Button** (`button.tsx`): 150ms `ease-out` transitions on color/shadow/transform, press = `active:scale-[0.98]` + slight darken, focus ring with page-colored offset. Sizes: h-10 default, h-9 sm, h-11 lg, h-9 icon.
- **Input/Select/Textarea**: filled `bg-background` (recessed against cards), `hover:border-primary/40`, focus ring replaces the border (`focus-visible:border-transparent`).
- **Badge**: pill; `default` variant is a soft `bg-primary/10 text-primary` tint (never full saturation on inactive states), `success` is emerald-100/800.
- **Toast** (`toast.tsx`): window-event based, `bg-card`, tinted semantic borders.
- **Card** (`card.tsx`): `rounded-lg border bg-card shadow-sm`.
- **Nav** (`components/nav/app-nav.tsx`): sticky, `bg-background/85 backdrop-blur-md`, active link = `bg-primary/10 text-primary` via `usePathname`.

## Motion
150-250ms, ease-out. Motion conveys state only: hover deepens, press compresses, toasts fade in. No page-load choreography, no bounce.

## Bans (per register)
No side-stripe borders, no gradient text, no glassmorphism as default, no hero-metric template, no identical card grids, no modal as first thought, no full-saturation color on inactive states, no display fonts in labels or data.
No hardcoded `bg-white` / `bg-black` on any surface: cards and containers use `bg-card`, form fields use `bg-background`, translucent overlays keep the token (`bg-card/90`).
