# UI Redesign Plan — ccreids_logo_modern.svg Inspiration

## Design Language Shift

| | Old (logo.png) | New (ccreids_logo_modern.svg) |
|---|---|---|
| Brand accent | Orange `#f06520` | Indigo `#5B4FE0` |
| Primary text | White on orange | Dark `#1A1A1A` on light |
| Surface | Warm orange tint `#fff7f2` | Indigo tint `#F0EEFF` + warm sand `#F9F8F5` |
| Dividers | n/a | Stone `#E2E0D8` |
| Secondary text | Polaris gray `#6d7175` | Warm muted `#888780` |
| Hero style | Bold orange gradient banner | Minimal: warm-white card, 3px indigo top border |
| Wordmark | Orange gradient text | Solid dark `#1A1A1A` |

---

## Files to Modify (in order)

### 1. `app/styles/enhancements.css` — PRIMARY (do all CSS changes here first)

#### A. Replace `:root` variables

```css
/* OLD */
--dp-brand:          #f06520;
--dp-brand-light:    #fbb040;
--dp-brand-dark:     #c84a00;
--dp-brand-gradient: linear-gradient(135deg, #fbb040 0%, #f06520 55%, #c84a00 100%);
--dp-brand-bg:       #fff7f2;
--dp-brand-border:   rgba(240, 101, 32, 0.35);

/* NEW */
--dp-brand:          #5B4FE0;
--dp-brand-light:    #7B6FFF;
--dp-brand-dark:     #4035B8;
--dp-brand-gradient: #5B4FE0;          /* flat — no gradient in new identity */
--dp-brand-bg:       #F0EEFF;
--dp-brand-border:   rgba(91, 79, 224, 0.30);
/* add new tokens: */
--dp-ink:            #1A1A1A;
--dp-stone:          #E2E0D8;
--dp-warm-bg:        #F9F8F5;
--dp-muted:          #888780;
```

#### B. Fix `.dp-stat-value--brand` (gradient-clip breaks on flat color)

Remove the webkit gradient-clip block; replace with plain color:
```css
/* OLD */
background: var(--dp-brand-gradient);
-webkit-background-clip: text;
-webkit-text-fill-color: transparent;
background-clip: text;

/* NEW */
color: var(--dp-brand);
```

#### C. Fix `.dp-dev-nav__wordmark` (same gradient-clip issue)

Remove gradient-clip block; replace with:
```css
color: var(--dp-ink);  /* #1A1A1A — matches SVG wordmark weight */
```

#### D. Rewrite `.dp-hero` — minimal light treatment

```css
.dp-hero {
  background: var(--dp-warm-bg);         /* #F9F8F5 warm white */
  border: 1px solid var(--dp-stone);     /* #E2E0D8 hairline */
  border-top: 3px solid var(--dp-brand); /* 3px indigo accent */
  color: var(--dp-ink);                  /* dark text */
  /* remove old: color: #fff, shadow stays */
}
.dp-hero::before { display: none; }     /* remove checkerboard — not needed on light bg */
.dp-hero__title  { color: var(--dp-ink); text-shadow: none; }
.dp-hero__sub    { color: var(--dp-muted); opacity: 1; }  /* explicit muted, remove opacity */
.dp-hero__badge  { background: var(--dp-brand); color: #fff; border: none; }
```

#### E. `.dp-badge--active` — use explicit `--dp-brand` not gradient

```css
.dp-badge--active { background: var(--dp-brand); color: #fff; }
```

#### F. Keep orange on `.dp-alert--warning` (semantic urgency)

Override so urgent alerts don't turn indigo:
```css
.dp-alert--warning {
  background: #fff7f2;
  border-color: rgba(240, 101, 32, 0.35);
}
```

All other classes that reference `--dp-brand`, `--dp-brand-bg`, `--dp-brand-border`, `--dp-brand-gradient` automatically update via variable cascade — no changes needed to:
- `.dp-stat-card--total` (border + bg via vars)
- `.dp-filter-btn--active` (background via var)
- `.dp-dev-nav__link:hover`, `.dp-dev-nav__link--active` (via vars)
- `.dp-drop-card:hover` (border + shadow via `--dp-brand-border`)
- `.dp-stat-label--brand` (color via `--dp-brand`)

---

### 2. `app/routes/app.jsx`

Two one-line changes:
```js
// Line 5 — swap logo import
import logoUrl from "../assets/ccreids_logo_modern.svg";  // was logo.png

// Line 25 — console stub colour
"color:#5B4FE0;font-weight:bold"  // was #f06520
```

The SVG has a transparent background — it renders natively on the white nav bar with no `filter` needed.

---

### 3. `app/routes/app._index.jsx`

One-line change:
```js
// Line 6 — swap logo import
import logoUrl from "../assets/ccreids_logo_modern.svg";  // was logo.png
```

Hero JSX structure is unchanged — `.dp-hero__logo-wrap` (white card) still wraps the logo, which now shows the modern SVG mark.

---

### 4. `app/routes/app.drops.new.jsx`

Helper text inline color (2 lines):
```js
// Lines 124, 146
color: "#888780"   // was "#6d7175" — align to new warm muted palette
```
Leave error color `#d72c0d` unchanged (semantic critical red).

---

### 5. `app/components/drops/ProductCard.jsx`

Secondary text color only (5 lines):
```js
// Lines 12, 78, 84, 98, 103  — anywhere "#6d7175" appears
"#888780"   // was "#6d7175"
```
Leave stock level semantic colors unchanged (`#d72c0d`, `#ffc453`, `#008060`).

---

## Verification Checklist

Run dev server (`npm run dev`) and visit each page in dev-bypass mode:

- [ ] **Nav**: SVG logo visible (ring + indigo arrow); "Drop Predator" wordmark is dark `#1A1A1A`; active link is indigo text on `#F0EEFF` bg
- [ ] **Dashboard hero**: warm-white `#F9F8F5` background, 3px indigo top border, SVG logo in white card, dark title text, "CCREIDS" pill is solid indigo
- [ ] **Total Drops card**: `#F0EEFF` background, `#5B4FE0` left border, stat number in solid indigo (not transparent)
- [ ] **Active/Scheduled/Completed cards**: green/amber/neutral — unchanged
- [ ] **Filter tabs** (`/app/drops`): active tab is solid `#5B4FE0` white text; hover is indigo text + border
- [ ] **StatusBadge "Active"**: solid indigo, white text
- [ ] **Other badges**: Draft/Scheduled/Completed/Cancelled unchanged
- [ ] **Drop card hover**: indigo tint border + shadow
- [ ] **Overdue alert banner**: still orange/warm (semantic override kept)
- [ ] **Zero orange remaining**: search codebase for `#f06520`, `#fbb040`, `#c84a00` — none in source files after changes
