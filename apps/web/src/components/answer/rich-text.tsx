import { cn } from "@my-better-t-app/ui/lib/utils";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const components: Components = {
  a: ({ href, children }) =>
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

/**
 * Assistant prose. Markdown becomes HTML, and shadcn/typeset styles it.
 * The chat preset owns size, leading, and the space between blocks.
 */
export function RichText({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("typeset typeset-chat", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={urlTransform}
        components={components}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
