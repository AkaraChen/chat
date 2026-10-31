# Generative UI spec

How an answer gets laid out. This is the source the prompts and components
are written from; see [sources.md](./sources.md) for where the ideas came
from.

## Goals

- Pick a layout for what the user is trying to do, not for the topic. "How
  does TCP work" and "list the steps of the TCP handshake" are about the same
  subject but want different views.
- Prefer structure the app can check (json-render specs against a catalog)
  over free-form markup. Free-form HTML is the escape hatch, not the default.
- The prose carries the explanation. A view or widget carries only what is
  easier to see than to read.

## Turn flow

1. Unless the message is small talk, or the answer is clearly a short piece
   of prose, the model calls `read_me` with one or more modules.
2. `read_me` returns the shared rules, the guidance for each module asked
   for, and the spec format with only the components those modules use.
3. The model writes prose, and puts views where they help:
   - a json-render spec in a ` ```spec ` fence, or
   - a `show_widget` call, for the `widget` module only.
4. A message may hold several views and widgets. Each one sits where it was
   written, with prose between them.

## Modules

Each module names what the user is doing, when to pick it, the components it
may use, and a short routing table from phrasing to component.

| Module        | The user wants to…                       | Components                                   |
| ------------- | ---------------------------------------- | -------------------------------------------- |
| `explain`     | understand how something works           | Flow, Structure, Steps, Notes                |
| `interactive` | try values and see the effect            | Panel, Slider, Toggle, Choice, Readout, Plot |
| `compare`     | choose between options                   | Options, Comparison, Rows                    |
| `assess`      | know whether something can or will work  | Rows, Notes, Sources                         |
| `data`        | read a set of numbers                    | StatStrip, LineChart, BarChart, Table        |
| `recap`       | get a meeting, thread or doc sorted out  | Decisions, OpenItems, Todo, Notes, Record    |
| `code`        | review a pull request (GitHub connected) | Changes, Diff, Rows, Notes                   |
| `widget`      | see something no component can draw      | `show_widget` (HTML/SVG)                     |

Every module may also use `Sources` and `FollowUps`. The `code` module is
offered only when a GitHub token is stored.

Routing is by verb. The model may load more than one module when an answer
needs two kinds of view, for example `explain` for the mechanism and `data`
for the numbers.

## Shared rules

- Explanations, headings and introductions go in the prose, never in a view.
- One view answers one question. A complex topic gets several small views,
  each preceded by a sentence that says what it shows.
- Say only what is delivered: if the prose promises two views, there are
  two.
- Numbers, names and sources come only from tool results or from the user's
  own text. With no data, say so and draw nothing.
- Budgets, which the catalog enforces where it can:
  - at most 4 items side by side;
  - node labels of at most 5 words;
  - at most 12 nodes in a diagram;
  - one tone that carries meaning per view, plus neutral.
- Tones are semantic: `neutral`, `accent`, `positive`, `negative` and
  `warning`. The accent is the app's one blue. Colour never just counts
  steps.
- Text fields render inline markdown only: bold, code and links.
- `FollowUps` holds at most 3 questions the user may want to ask next. Each
  one is sent as the user's message when pressed.

## Specs

- JSONL RFC 6902 patches inside a ` ```spec ` fence. Each view starts
  by setting `/root`, and a new `/root` starts a new view.
- The root is always `Answer`, and every other element is listed in its
  children.
- Interactive views set `/state` right after `/root`, before any element.
- The `interactive` module may use:
  - `$state`, `$bindState`, `$template` and `$cond` in props;
  - `visible` conditions;
  - `$computed` with the functions `calc` (arithmetic over named variables)
    and `format`.

  It may not use `on`, `repeat` or `watch`, and no other module may use
  state or expressions at all.

- `calc` evaluates `+ - * / % ^`, parentheses, unary minus, and `min`,
  `max`, `abs`, `round`, `floor`, `ceil`, `sqrt`, `pow`, `log` and `exp`,
  over the variables it is given. It never calls `eval`. A result that is
  not a finite number shows as `—`.
- Shown numbers are always rounded by the component. Readout and Plot take a
  `precision`.
- When a message ends, every view is checked against the catalog. A view
  that fails is dropped and its prose is kept. Views that pass are kept even
  when another view in the same message failed.
- Earlier answers reach the model as one line per view naming the
  components it showed, not as the spec.

## Widgets

`show_widget({ title, html })` draws an HTML fragment, which may contain
inline SVG.

- **Sandbox.**
  - The frame is `<iframe sandbox="allow-scripts">`, with an opaque origin
    and no access to the app or its cookies.
  - Its CSP is `default-src 'none'`. Inline scripts and styles are allowed,
    and scripts may also come from cdnjs, jsDelivr, unpkg and esm.sh.
  - Images may only be `data:` and `blob:`, and `connect-src` is `'none'`.
- **Sanitizing.** Each version of the fragment goes through
  [DOMPurify](https://github.com/cure53/DOMPurify) inside the frame, then
  is parsed in an inert `<template>` before morphdom moves it in. The
  config (`widget-sanitize.ts`) builds on DOMPurify's defaults, which already
  drop `javascript:` URLs, SVG animations and unknown tags. On top of those
  it:
  - keeps `<script>`, `<style>` and the usual event handlers, which widgets
    need;
  - forbids `<meta>` (a refresh moves the frame), `<link>` (DNS prefetch),
    `<base>`, nested frames, plugins and `<form>` (a submit reloads the
    frame);
  - forbids the `ping`, `target`, `action`, `formaction`, `srcdoc` and
    `download` attributes.

  `SAFE_FOR_XML` is off: it drops any element whose text holds a `<`, which
  would take out ordinary scripts, and the fragment never goes into XML.
  The frame tells the host what was removed, and the host logs it.

- **Streaming.** The fragment streams in as the tool input arrives and is
  patched with morphdom. Scripts run once, after the input is complete.
- **Theme.** The host passes its colour tokens in as CSS variables
  (`--paper`, `--ink`, `--ink-secondary`, `--line`, `--accent`, `--add`,
  `--remove`, `--warn`, `--fill`…), and updates them when the theme
  changes. Form controls come pre-styled, and the outer background is
  transparent.
- **Height.** The frame reports its content height, and the host sizes the
  iframe to it. There is no inner scrolling.
- **Bridge.** Inside the frame, `sendPrompt(text)` asks a follow-up and
  `openLink(url)` opens an http(s) link in a new tab. The host acts on
  either only while the frame has focus, which means the user just
  interacted with it, and at most once a second. On a shared, read-only
  page both do nothing.
- **History.** Only the widgets in the latest assistant message keep their
  HTML in the model's history, so the model can change them. Older widgets
  are cut down to their title.
- **Widget rules** (in the `widget` module):
  - no `<html>`, `<head>` or `<body>`;
  - style first, then content, then scripts;
  - inline styles over large `<style>` blocks;
  - no gradients, shadows or blur;
  - colours from the variables only, so dark mode works;
  - no fixed positioning and no nested scrolling;
  - two font weights;
  - sentence case.
- **Navigation.** No markup left after sanitizing can move the frame, but
  a script still can (`location = …`). The host treats a second `load` of
  the frame, or a `pagehide` it reports, as a widget leaving its shell. It
  takes the frame down and shows one line in its place.
- **Risk.** A navigating script reaches its URL before the host sees it, so
  it can still leak what the model wrote. A prompt-injected web page could
  ask for this. The frame holds nothing the model did not write, and the
  tool is only offered after `read_me` has loaded the widget module.

## Trace

- `read_me` shows as the first row, with the modules it loaded.
- `show_widget` does not show in the trace: the widget is what the user
  sees.
