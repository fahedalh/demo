# UI/UX Design System

## Principles
1. **Calm confidence** — generous whitespace, one primary action per view, quiet chrome.
2. **Brand-adaptive** — the platform palette is neutral; each business's `primaryColor` re-tints its
   public page and booking wizard through CSS variables (`--brand`), so a clinic feels clinical and a
   salon feels warm without separate themes.
3. **Bidirectional by construction** — logical properties only (`ms-`, `me-`, `ps-`, `start-`),
   directional icons flip with `rtl:rotate-180`, numbers stay LTR inside RTL text.
4. **Motion with purpose** — 150–250 ms ease-out for state changes, step transitions slide in the
   reading direction; everything respects `prefers-reduced-motion`.

## Tokens (CSS variables, HSL, defined in `client/src/index.css`)
| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `--background` | 0 0% 100% | 224 28% 7% | page |
| `--foreground` | 224 30% 12% | 210 25% 96% | text |
| `--card` | 0 0% 100% | 224 26% 10% | surfaces |
| `--muted` / `--muted-foreground` | 220 20% 96% / 220 10% 42% | 224 20% 15% / 220 12% 65% | secondary text, fills |
| `--primary` | 243 75% 58% (indigo) | 243 85% 70% | primary actions |
| `--accent` | 168 70% 40% (teal) | 168 60% 50% | highlights, success-ish accents |
| `--destructive` | 0 72% 51% | 0 70% 60% | danger |
| `--border` / `--ring` | 220 16% 90% / primary | 224 18% 20% / primary | |
| `--radius` | 0.875rem | | cards `rounded-2xl`, controls `rounded-xl` |

Status colours (badges & calendar): pending = amber, confirmed = indigo, completed = emerald,
cancelled = slate, rejected = rose, no_show = orange.

Gradient (used sparingly: hero, pricing highlight, empty-state art):
`linear-gradient(135deg, hsl(243 75% 58%), hsl(280 70% 60%) 50%, hsl(168 70% 45%))`.

## Typography
* Latin: **Plus Jakarta Sans** (400/500/600/700/800). Arabic: **IBM Plex Sans Arabic** (400/500/600/700).
  Font family switches with `lang`.
* Scale: display 56/64 · h1 40/48 · h2 30/38 · h3 22/30 · body 15/24 · small 13/20 · micro 12/16.
* Tracking: −0.02em on display/h1 (Latin only; Arabic uses 0).

## Spacing & layout
4-pt base; section padding `py-20 md:py-28`; container `max-w-7xl px-4 sm:px-6 lg:px-8`;
dashboards: 264 px sidebar (collapsible to a sheet on < lg), content `max-w-[1400px]`.

## Elevation
`shadow-soft` (0 1px 2px / 0 4px 16px −4px, 6% alpha) for cards; `shadow-lift` on hover;
dialogs use backdrop blur.

## Components (`client/src/components/ui`)
Button (default, secondary, outline, ghost, destructive, link; sm/md/lg/icon; `loading`),
Input, Textarea, Label, Select (Radix), Checkbox, Switch, Badge, Card, Dialog, Sheet,
DropdownMenu, Tabs, Tooltip, Avatar, Skeleton, Separator, Toaster (sonner).
Composites: PageHeader, StatCard, DataTable (sortable, paginated, empty/loading/error states),
EmptyState, ConfirmDialog, FormField, StatusBadge, WeeklyScheduleEditor, CustomFieldsEditor,
Calendar (day/week/month, drag-and-drop), BookingWizard, BusinessCard, MapView, LanguageSwitch,
ThemeToggle.

## Patterns
* **Forms**: label above, helper/error below, submit button shows spinner and disables; success →
  toast + close/redirect; server field errors map back onto fields.
* **Empty states**: icon, one-line explanation, primary action.
* **Loading**: skeletons that match final layout; never spinners for whole pages.
* **Destructive actions**: confirm dialog naming the object.
* **Tables on mobile**: collapse into stacked cards.

## Accessibility checklist
Visible focus ring (`ring-2 ring-ring ring-offset-2`), 44 px touch targets, `aria-live` for toasts,
labelled icon buttons, colour never the only signal (status badges include text), skip link.
