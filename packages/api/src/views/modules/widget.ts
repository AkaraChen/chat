import type { ViewModule } from "../types";

export const id = "widget" as const;

export const summary =
  "see something no component can draw: a cross-section, a spatial metaphor, a simulation, a custom mock-up";

export const when =
  "Use only when no component in the other modules can show it: the mechanism needs a picture (a cross-section, packets moving, a ball rolling down a slope), or a small simulation or mock-up. A chart, a list, a flow of boxes or a calculator belongs in the other modules. Prose: before the widget, say what it shows and what to try.";

export const routes = [
  [
    "how does a hash map / attention / TCP actually work",
    "an SVG picture of the mechanism, with a control if the real thing has one",
  ],
  ["show me what this screen could look like", "a mock-up of the screen"],
  [
    "let me play with a bouncing ball / a queue / a sort",
    "a small simulation with start and reset",
  ],
] as const;

export const guide = `Draw a widget with show_widget({ title, html }). html is a fragment of HTML, which may hold inline SVG. The app streams it into a sandboxed frame as you write it, then runs its scripts once it is complete.

Order and streaming
- Write a short <style> first (under about 15 lines), then the content, then <script> last. Content written early shows early.
- Prefer inline style attributes, so controls look right while they stream in.
- No <html>, <head> or <body>, no comments, and no hidden sections, tabs or carousels while streaming. Show everything stacked. A script may add steps after the stream ends.

Look
- The frame is transparent and fills the column, which is about 680px wide. Do not set a background on the outer element.
- Flat: no gradients, shadows, blur or glow. Corners use var(--radius) (10px), and borders are 1px solid var(--line-quiet).
- Use only these colours, which follow the app's light and dark mode: --paper (surface), --fill (quiet surface), --ink (text), --ink-secondary (muted text), --ink-tertiary (hints), --line-quiet, --line and --line-strong (borders), --accent and --accent-soft (the one blue, for the focus), --add and --add-soft (positive), --remove and --remove-soft (negative), --warn (warning). Never hard-code a colour that has to read in both modes. A physical scene (sky, water, metal) may use fixed colours throughout.
- Text: font sizes 12 to 16px, weight 400, with 500 for emphasis only. Sentence case. No emoji.
- SVG: set viewBox="0 0 680 H" and width="100%", so one unit is one pixel. Leave 20px of margin and size boxes from their longest label (about 8px per character at 14px). Arrows never cross a box. Use stroke and fill from the colour variables.
- Form controls (button, input, select, range) come styled. Write them bare.
- No position: fixed and no scrolling inside the widget. The frame grows to fit its content.
- Round every number you show.

Behaviour
- Scripts may load libraries from cdnjs.cloudflare.com, cdn.jsdelivr.net, unpkg.com or esm.sh. Nothing else is reachable: no fetch and no images from the web (data: URLs only).
- Sorting, filtering, stepping and arithmetic happen in the script. Call sendPrompt("a full question") only for a next step that needs you to think; mark such a button with ↗.
- Links: <a href="https://…"> or openLink(url) open in a new tab.
- The app removes <meta>, <link>, <base>, <form>, nested frames, objects and embeds, SVG animations, target and ping attributes, and javascript: URLs before showing the widget. Use buttons and inputs without a form, and CSS for animation. A widget that navigates its own frame is taken down.
- Animate only transform and opacity, keep loops under two seconds, and respect prefers-reduced-motion.
- When the real thing has a control (a thermostat, a learning rate, a buffer size), give the widget that control.`;

export const widget: ViewModule = {
  id,
  summary,
  when,
  routes,
  components: [],
  usage: {},
  guide,
};
