import { cn } from "@my-better-t-app/ui/lib/utils";
import { cjk } from "@streamdown/cjk";
import { createElement, type ComponentProps } from "react";
import { Streamdown, type Components } from "streamdown";

// Streamdown's own components carry Tailwind classes that would win over
// typeset. Plain elements leave the look to typeset.
const PLAIN = [
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "strong",
  "em",
  "blockquote",
  "hr",
  "pre",
  "code",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "img",
] as const;

type Plain = Record<string, unknown> & { node?: unknown };

const components: Components = {
  ...Object.fromEntries(
    PLAIN.map((tag) => [tag, ({ node: _node, ...props }: Plain) => createElement(tag, props)]),
  ),
  a: ({ node: _node, href, children }: ComponentProps<"a"> & { node?: unknown }) =>
    href ? (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    ) : (
      <>{children}</>
    ),
};

/** Keep http(s) and mailto. Drop javascript: and other schemes. */
function urlTransform(url: string) {
  const value = url.trim();
  if (/^(https?:\/\/|mailto:)/i.test(value)) return value;
  return "";
}

// Emphasis next to CJK punctuation (`**“好”**的`) and autolinks that run into
// CJK text both parse the way a reader expects.
const plugins = { cjk };

/**
 * Assistant prose. Streamdown parses it, so markdown cut off mid-stream (an
 * open `**`, link or fence) still renders cleanly; shadcn/typeset styles it.
 * The chat preset owns size, leading, and the space between blocks.
 */
export function RichText({
  text,
  className,
  streaming = false,
}: {
  text: string;
  className?: string;
  streaming?: boolean;
}) {
  return (
    <Streamdown
      className={cn("typeset typeset-chat", className)}
      components={components}
      plugins={plugins}
      urlTransform={urlTransform}
      linkSafety={{ enabled: false }}
      controls={false}
      isAnimating={streaming}
    >
      {text}
    </Streamdown>
  );
}
