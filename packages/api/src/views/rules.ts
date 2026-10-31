// The rules every view follows, whatever module it comes from. Written for
// this app; see docs/generative-ui/spec.md, "Shared rules".

export const sharedRules = `# Laying out an answer

The prose explains; a view shows what is quicker to see than to read. Put every explanation, heading and introduction in the prose. A view holds no paragraphs and no headings of its own.

- One view answers one question. When a topic needs more, use several small views, and before each one write a sentence that says what it shows.
- Deliver what the prose promises. If it says there are two views, there are two.
- Numbers, names and sources come only from tool results or from the user's own words. When the data is missing, say so in the prose and draw nothing.
- Keep it small. At most four things sit side by side. A box or node label has at most five words. A diagram has at most twelve nodes. When something does not fit, split it into an overview and a detail view.
- Colour means something. Tones are neutral, accent, positive, negative and warning. Leave most things neutral and use accent for the one thing the user should look at. Never give each step its own colour.
- Write labels in sentence case, never in Title Case or capitals.
- End with FollowUps only when a next question is likely, with at most three. Its prompts are full questions the user could have typed.
- Small talk, a one-line answer or a request for plain prose gets no view.`;
