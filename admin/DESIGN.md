---
name: Sales Engine Admin
description: Cross-business oversight in the inherited Sales Engine visual world
colors:
  canvas: "#041014"
  mint: "#2ae9c9"
  mint-hover: "#6cf0d9"
  wine: "#39233a"
  lavender: "#f4edf6"
  paper: "#fff"
  ink: "#111522"
  muted: "#626879"
  line: "#e1dfe5"
  pipeline: "#784880"
  won: "#087b6e"
  source-purple: "#d88bec"
  source-gold: "#f4c789"
typography:
  display:
    fontFamily: "Poppins, sans-serif"
    fontSize: "clamp(32px, 3vw, 44px)"
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Poppins, sans-serif"
    fontSize: "21px"
    fontWeight: 500
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Poppins, sans-serif"
    fontSize: "13px"
  supporting:
    fontFamily: "Poppins, sans-serif"
    fontSize: "12px"
rounded:
  field: "8px"
  button: "9px"
  panel: "16px"
  tab: "22px"
  navigation: "30px"
spacing:
  compact: "8px"
  control: "12px"
  mobile-inset: "18px"
  section: "24px"
  panel-inset: "26px"
  panel-gap: "28px"
components:
  button-primary:
    backgroundColor: "{colors.mint}"
    textColor: "#06252b"
    rounded: "{rounded.button}"
    padding: "10px 14px"
  button-primary-hover:
    backgroundColor: "{colors.mint-hover}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    padding: "10px 14px"
  card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "11px 12px"
---

# Design System: Sales Engine Admin

## Overview

**Creative North Star: "The inherited Sales Engine workspace"**

The dashboard and approved social listening implementation establish this visual world. A textured deep teal canvas surrounds lifted white workspaces, with wine analytical surfaces and pale lavender supporting panels. Mint identifies actions and active navigation. CRM inherits that identity rather than establishing a separate palette.

The interface is compact, analytical, and suited to platform administrators managing client businesses. CRM uses local illustrative data; its management controls are demonstrations that reset on refresh. This document records the implemented system, not a promise of live service behavior.

**Key Characteristics:**
- White workspaces balanced with wine and lavender panels.
- Poppins typography and aligned tabular numerals.
- Rounded controls, soft structural elevation, and visible focus states.
- Scroll-triggered analytics with hover and keyboard inspection.

## Colors

### Primary
Mint marks primary actions and the active view in white capsule navigation. The teal canvas provides the surrounding atmosphere, not the default interior color of every card.

### Secondary
Wine anchors analytical contrast and contextual tooltips; lavender provides a lighter supporting plane. Pipeline purple and dark green distinguish open and won chart series. Source charts use mint, purple, and gold with visible labels and counts.

### Neutral
Paper carries tables, inputs, and most analytical workspaces. Ink is their primary text; muted supports explanatory copy and chart labels; line separates data without overpowering it.

**The Balanced Workspace Rule.** Preserve the observed mixture of white, wine, lavender, and teal; the user explicitly rejected an all-green surface.

## Typography

**Display Font:** Poppins with the application's sans-serif fallback stack.
**Body Font:** Poppins. Montserrat is loaded by the shared shell but is not the CRM body or chart face.

Page titles use a light regular display role. Panel headings are medium-weight and slightly tightened. Body copy is compact; supporting descriptions, tables, and chart legends use smaller sizes. Metric values use regular-to-medium weight and tabular numerals, with CRM's responsive metric range from 32 to 46px. Numerical chart summaries use 36px on desktop and 30px on mobile.

## Layout

The shared content boundary is capped at 1660px, centered with 5% horizontal padding. CRM starts with its page heading, a business scope control, five horizontally scrollable views, and four summary cards. Its Overview places a wide trend next to a narrower wine donut, followed by stage and client-value charts and a full-width client portfolio table. The other views use the inherited master-detail, table, dialog, and activity patterns.

The analytical grid uses a 1.65:1 split with a minimum 320px right column and 26px gaps. At 1100px it becomes 1.3:1 with a 300px minimum and 20px gaps. At 760px it stacks in one column with 24px gaps and 18px panel insets. Tables retain their data width and scroll horizontally; navigation also scrolls rather than squeezing labels.

## Elevation & Depth

Depth combines the dark textured canvas, colored analytical planes, and diffuse structural shadows. Panels use `0 12px 32px #00000038, 0 3px 10px #ffffff26`. Capsule navigation uses `0 7px 20px #00000032`; ordinary button hover uses `0 3px 8px #39233a14`. CRM tooltips use `0 6px 20px #0003`. These are soft shadows, not hard offset silhouettes.

## Shapes

Panels use gently rounded 16px corners, fields 8px, and ordinary buttons 9px. View navigation is a 30px capsule with 22px active controls. Tables and grouping rows use restrained strokes and rounded corners. Donut geometry, circular legend markers, and rounded bars express data rather than ornamental motifs.

## Components

### Buttons
Mint primary actions have dark text and medium-bold weight. White secondary controls use a pale border and shift toward lavender on hover. Disabled buttons reduce opacity and retain a disabled cursor. Focus uses a 2px teal outline with 4px offset; focus on wine analytical surfaces uses white.

### Chips
Small semantic badges annotate quality, status, and counts with tinted backgrounds. Keep explicit labels: chart and state meaning is not carried by color alone.

### Cards / Containers
White panels contain the majority of controls and records. Wine source cards invert typography and use a faint inherited texture; lavender supports stage analysis. Headers use generous 24px by 26px padding, reduced on mobile. Do not apply tooltip elevation to resting workspaces.

### Inputs / Fields
Fields have white interiors, a pale gray border, and rounded corners. They inherit Poppins, show a visible focus outline, and use dark text even when placed on the teal canvas. Checkbox accent is deep green.

### Navigation
Shared product navigation remains in the shell. CRM view navigation uses white capsules, mint selection, icon-and-text labels, and horizontal scrolling on narrow screens. Its views are Overview, Client pipelines, Records, Data quality, and Activity log.

### Analytical charts
Record momentum uses two smooth lines and a faint area fill; source distribution uses a wine-backed donut; stage distribution uses horizontal bars; client value uses paired vertical bars. Every chart derives from the scoped CRM records. Financial values are illustrative EUR estimates, not booked revenue.

An IntersectionObserver at 20% intersection toggles chart visibility. Line drawing, area reveal, donut sweep, and bar growth replay when the chart re-enters view. Draw/sweep lasts 0.8s; bars last 0.65s with `cubic-bezier(0.16, 1, 0.3, 1)`. Client bars stagger by 60ms, with the second series offset by 40ms. Reduced-motion preferences disable these animations. If IntersectionObserver is unavailable, charts remain visible.

Hover and keyboard focus show exact values. Focusable line date regions, donut arcs and legends, and stage/client buttons expose accessible labels; stage and client bars also navigate to relevant records or workspaces. Trend, stage, and value charts include expandable data tables. Tooltip text contrasts with its host: wine on white charts, white on the wine donut.

## Smart Leads workspace

Smart Leads follows the same teal canvas, white workspace, wine analysis, lavender support, and mint active controls. Client ownership stays visible above sample-pool metrics. An intent donut and selectable outreach bars lead into buying-signal coverage and the prospect directory. Chart segments and coverage controls narrow the directory; evidence opens in a native dialog with local review notes.

Client selector panels on Smart Leads, Social Listening, and CRM stick below the navigation at desktop widths. Their offset uses the measured header height and their height fits the viewport, with internal scrolling for longer lists. Mobile Smart Leads uses a compact client dropdown and expandable advanced filters.

## Do's and Don'ts

### Do:
- **Do** preserve white workspaces, wine analysis, lavender support, and mint active states.
- **Do** keep client ownership visible and label analytical definitions.
- **Do** provide keyboard inspection alongside hover and respect reduced motion.
- **Do** preserve horizontal table scrolling on narrow screens.

### Don't:
- **Don't** fill the entire interface with green surfaces.
- **Don't** imply illustrative CRM values or local changes are live business results.
- **Don't** rely on chart color alone to convey source, stage, or value.
