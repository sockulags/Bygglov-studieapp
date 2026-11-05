import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Renders an answer's Markdown. Raw HTML in the text is not rendered (react-markdown's
 * default), and links open nowhere inside the app: they are shown as text with the address.
 */
export function TutorMarkdown({ children }: { children: string }) {
  return (
    <div className="tutor-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children: label, href }) => (
            <span>
              {label}
              {href && typeof label === 'string' && label !== href ? ` (${href})` : null}
            </span>
          ),
          img: ({ alt }) => <span>{alt ?? ''}</span>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
