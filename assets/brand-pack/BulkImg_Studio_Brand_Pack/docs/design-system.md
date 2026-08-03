# BulkImg Studio — SlateStack Design System

**System name:** SlateStack Design System (SSDS)  
**Type:** Fully custom visual design system  
**Product:** BulkImg Studio  
**Primary treatment:** Dark slate  
**Secondary treatment:** Light slate-gray

## 1. Design-system decision

BulkImg Studio uses a fully custom design system rather than adopting Material Design, Fluent, Carbon, Ant Design, or another pre-styled framework.

The visible product language is SlateStack. Accessibility and interaction primitives may be implemented with Radix UI, while Tailwind CSS or CSS variables can be used for styling. Lucide may be used as the base icon library, customized to SlateStack rules.

```text
Visual language: SlateStack Design System
UI primitives: Radix UI
Styling system: Tailwind CSS + CSS variables
Icon system: Lucide, customized to SlateStack rules
```

## 2. Core principles

### Layered, not flat
The interface reflects the stacked-image logo through grouped panels, batch cards, layered image previews, and restrained elevation.

### Matte, not glossy
Surfaces should feel like matte slate, powder-coated metal, soft polymer, and brushed graphite.

Avoid heavy glassmorphism, mirror reflections, neon glow, glossy gradients, and excessive blur.

### Depth without noise
Depth is created with subtle edge highlights, soft shadows, and tonal separation rather than decorative effects.

### Monochrome first
Deep slate and cool gray form the identity. Functional colors are reserved for state communication only.

### AI without clichés
Do not use brains, robots, circuitry heads, magic wands, neural-network motifs, or constant sparkles.

## 3. Typography

### Primary display typeface — Manrope
Use for:
- Marketing headlines
- Page titles
- Product name
- Major dashboard statistics
- Section headings
- Selected high-emphasis buttons

### Primary interface typeface — Inter
Use for:
- Navigation
- Body text
- Forms
- Tables
- Filters
- Settings
- Notifications
- Tooltips

### Technical typeface — JetBrains Mono
Use selectively for:
- File names
- Image dimensions
- Job IDs
- Model names
- API keys
- Generation parameters
- Technical logs

Do not bundle font files inside the brand pack. Acquire fonts through their official distribution channels.

## 4. Typography scale

| Style | Typeface | Size / line-height | Weight |
|---|---|---:|---:|
| Display | Manrope | 48 / 56 px | 700 |
| H1 | Manrope | 36 / 44 px | 700 |
| H2 | Manrope | 28 / 36 px | 650 |
| H3 | Manrope | 22 / 30 px | 600 |
| Section title | Manrope | 18 / 26 px | 600 |
| Body large | Inter | 18 / 28 px | 400 |
| Body | Inter | 16 / 24 px | 400 |
| UI label | Inter | 14 / 20 px | 500 |
| Small | Inter | 13 / 18 px | 400 |
| Caption | Inter | 12 / 16 px | 500 |
| Technical | JetBrains Mono | 12 / 18 px | 500 |

### Heading rule
```css
font-family: "Manrope", sans-serif;
font-weight: 650;
letter-spacing: -0.025em;
```

### Body rule
```css
font-family: "Inter", sans-serif;
font-weight: 400;
letter-spacing: -0.005em;
```

### Label and button rule
```css
font-family: "Inter", sans-serif;
font-weight: 550;
letter-spacing: 0;
```

### Technical metadata rule
```css
font-family: "JetBrains Mono", monospace;
font-weight: 500;
letter-spacing: -0.01em;
```

Avoid full uppercase headings. Uppercase is reserved for compact category labels and metadata.

## 5. Geometry

Use an 8-point grid with a supporting 4-point half-step.

```text
Spacing: 4, 8, 12, 16, 24, 32, 40, 48, 64
```

### Radius scale
```text
Small control:       6px
Input and button:    8px
Card:               12px
Large panel:        16px
Modal:              20px
Marketing feature:  24px
App icon:           28–30%
```

The logo may use stronger rounded corners. Product components should use controlled radii and should not become excessively pill-shaped.

## 6. Elevation and shadows

### Dark mode
```css
box-shadow:
  0 1px 2px rgba(11, 15, 20, 0.18),
  0 8px 24px rgba(11, 15, 20, 0.14);
```

### Light mode
```css
box-shadow:
  0 1px 2px rgba(38, 48, 60, 0.08),
  0 10px 30px rgba(38, 48, 60, 0.10);
```

## 7. Iconography

Base library: Lucide, visually normalized to SlateStack.

```text
Stroke width: 1.75px
Default size: 20px
Small size: 16px
Large size: 24px
Corner treatment: Rounded
Default color: Cool Gray
Active color: Silver Gray or Deep Slate
```

Filled icons should be limited to selected states and compact status indicators.

## 8. Motion

Motion is quiet, deliberate, and mechanical.

```css
--motion-fast: 120ms;
--motion-standard: 180ms;
--motion-slow: 260ms;

--ease-standard: cubic-bezier(0.2, 0, 0, 1);
--ease-enter: cubic-bezier(0, 0, 0.2, 1);
--ease-exit: cubic-bezier(0.4, 0, 1, 1);
```

Use:
- Soft fades
- 4–8 px directional movement
- Progressive image loading
- Smooth panel expansion
- Subtle card-stacking transitions

Avoid:
- Bounce
- Elastic easing
- Exaggerated scaling
- Playful spring motion

## 9. Logo usage

The approved mark is the rounded-square stacked-image icon.

### Primary logo
Use the dark-mode logo for:
- Dark application shells
- App-store artwork
- Product launch graphics
- Dark presentation covers
- Primary marketing identity

### Secondary logo
Use the light slate-gray logo for:
- Light product surfaces
- Documentation
- White or mist-gray presentation backgrounds
- Light interface themes

### Do not
- Add letters or a monogram inside the symbol
- Add AI sparkles, circuits, brains, gears, or camera-shutter motifs
- Rebuild the mark with different proportions
- Recolor it with saturated gradients
- Flatten or remove its layered depth
- Place it on visually noisy backgrounds

## 10. Recommended implementation foundation

```text
Radix UI: accessibility and interaction primitives
Tailwind CSS: utility implementation and token mapping
CSS variables: theme switching and runtime customization
Lucide: base icon set, visually normalized
```

These tools support implementation. They do not replace the custom SlateStack visual language.
