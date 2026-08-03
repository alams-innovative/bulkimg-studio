# BulkImg Studio — Color Branding

## Brand character

The palette is built around deep slate, graphite, steel gray, silver gray, mist gray, and soft white. The brand is predominantly monochrome. Shape, layering, and contrast should identify BulkImg Studio before accent color does.

## Core palette

| Token | HEX | RGB | Primary use |
|---|---:|---:|---|
| Slate Black | `#0B0F14` | 11, 15, 20 | Darkest background |
| Midnight Slate | `#11171F` | 17, 23, 31 | Dark page background |
| Deep Slate | `#18212B` | 24, 33, 43 | Primary brand color |
| Slate Surface | `#222D39` | 34, 45, 57 | Cards, sidebars, panels |
| Graphite Slate | `#344150` | 52, 65, 80 | Elevated surfaces |
| Steel Gray | `#566272` | 86, 98, 114 | Borders, controls |
| Cool Gray | `#7D8794` | 125, 135, 148 | Muted labels and icons |
| Silver Gray | `#B5BDC7` | 181, 189, 199 | Secondary text and light logo areas |
| Mist Gray | `#D5DAE0` | 213, 218, 224 | Light panels |
| Cloud Gray | `#E9ECEF` | 233, 236, 239 | Light background |
| Soft White | `#F6F7F9` | 246, 247, 249 | Highest light surface |

## Dark-mode tokens

```css
--background-primary: #0B0F14;
--background-secondary: #11171F;
--surface-primary: #18212B;
--surface-elevated: #222D39;

--logo-container: #1B232D;
--logo-front-card: #D6DBE1;
--logo-middle-card: #566170;
--logo-back-card: #323C48;
--logo-mountain: #252E39;
--logo-highlight: #EEF1F4;
```

### Dark-mode gradient

```css
background: linear-gradient(
  145deg,
  #222B36 0%,
  #151B23 55%,
  #0D1218 100%
);
```

## Light-mode tokens

The light theme remains cool and slate-based rather than becoming pure white.

```css
--background-primary: #E5E8EC;
--background-secondary: #EDF0F3;
--surface-primary: #F4F5F7;
--surface-elevated: #FAFAFB;

--logo-container: #D8DDE3;
--logo-front-card: #F1F3F5;
--logo-middle-card: #BAC2CC;
--logo-back-card: #9DA7B3;
--logo-mountain: #8D97A3;
--logo-outline: #C1C8D0;
```

### Light-mode gradient

```css
background: linear-gradient(
  145deg,
  #F2F4F6 0%,
  #E2E6EA 55%,
  #CBD2D9 100%
);
```

## Functional colors

Functional colors communicate status and are not primary brand colors.

| Purpose | HEX | Usage |
|---|---:|---|
| Success | `#55A887` | Completed generation, successful upload |
| Information | `#668FB3` | Information and neutral progress |
| Warning | `#C59A57` | Usage limits and caution |
| Error | `#B96568` | Failed jobs and destructive actions |

## Color usage rules

1. Keep marketing and product chrome predominantly monochrome.
2. Use functional colors only where a state must be communicated.
3. Use deep slate for authority and structure.
4. Use mist and silver grays for breathing room and hierarchy.
5. Avoid saturated blue-purple AI gradients.
6. Avoid pure black where Slate Black provides sufficient contrast.
7. Avoid pure white across large areas; use Soft White or Cloud Gray.
8. Preserve tonal separation between stacked layers.
