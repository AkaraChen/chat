# Sources

What the generative UI here was modelled on. Nothing in this repository is
copied from them: [spec.md](./spec.md) describes the behaviour in our own
words, and the prompts and components are written from that spec.

## Claude

- [Claude now creates interactive charts, diagrams and visualizations](https://claude.com/blog/claude-builds-visuals)
  (Anthropic, March 2026). Inline visuals in chat: temporary, made in
  the answer, and kept apart from Artifacts.
- [pi-generative-ui](https://github.com/Michaelliv/pi-generative-ui), a
  reconstruction of claude.ai's `show_widget` for the pi agent. Its
  `.pi/extensions/generative-ui/claude-guidelines/` holds guideline text
  pulled out of exported claude.ai conversations (the `read_me` tool
  results). That text is Anthropic's prompt, not the repository author's
  work, so it is **not** reproduced here. What we took from it is structure
  only:
  - The model loads guidance on demand, one module per kind of visual,
    before it draws.
  - It picks the visual from what the user is trying to do (the verb), not
    from the subject (the noun).
  - Hard budgets on how much one visual may hold.
  - Explanations stay in the prose, and the visual holds only the visual.
  - HTML streamed into a sandboxed frame and patched with morphdom, with
    scripts run once the stream ends.
  - A `sendPrompt` bridge that lets the visual ask a follow-up question.

## ChatGPT

- [ChatKit widgets](https://developers.openai.com/api/docs/guides/chatkit-widgets):
  JSON widget trees with actions handled by the host.
- Intelligent UI (GPT-6, October 2026). OpenAI describes it only as "a
  library of native, streamable components" with "a compiler that processes
  the interface as the model generates it". Third-party write-ups such as
  [eesel](https://www.eesel.ai/blog/chatgpt-intelligent-ui) and
  [Tabbit](https://go.tabbit.ai/blog/chatgpt-intelligent-ui) add what is
  known: values worked out by the client with no further model call, a
  self-contained mini app when no component fits, and Markdown when nothing
  else can be shown.

## Libraries

- [json-render](https://github.com/vercel-labs/json-render): the catalog,
  JSONL patch streaming, state, expressions and actions used here.
- [morphdom](https://github.com/patrick-steele-idem/morphdom): DOM diffing
  inside the widget frame.
- [DOMPurify](https://github.com/cure53/DOMPurify): cleans each widget
  fragment before it is shown.
