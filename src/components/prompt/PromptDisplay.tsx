import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { PromptStructured } from '../../lib/api';

/**
 * Shared prompt renderer used by both the voter battle screen and the
 * creation-flow preview panel. Two modes:
 *
 *  - Structured prompts (new): render instructions, input, and output
 *    format as distinct typographic blocks, mirroring how humans parse
 *    briefs ("what to do", "what to do it on", "how to shape the answer").
 *  - Legacy prompts: render the single `text` blob as markdown with
 *    soft-line-breaks preserved so existing `\n- bullet` prompts come
 *    back as actual bullets without needing creator intervention.
 *
 *  `context` is the original optional sidecar field — rendered as a
 *  muted aside below the body in both modes.
 */

interface PromptLike {
  text: string;
  context: string | null;
  structured: PromptStructured | null;
}

export interface PromptDisplayProps {
  prompt: PromptLike;
  /**
   * When true, caps visible height and shows a "Show more" disclosure
   * once the content exceeds the threshold. Use on the battle screen
   * so long prompts don't push A/B outputs below the fold. Leave off
   * in the creation preview — creators want to see everything.
   */
  collapsible?: boolean;
  /** Collapse threshold in px (default 220). */
  collapseThreshold?: number;
  className?: string;
}

const MARKDOWN_PLUGINS = [remarkGfm, remarkBreaks];

export function PromptDisplay({
  prompt,
  collapsible = false,
  collapseThreshold = 220,
  className,
}: PromptDisplayProps) {
  const { structured, text, context } = prompt;

  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Measure whether the rendered body exceeds the threshold. Re-measure
  // on content change AND on width change (a narrower viewport can flip
  // an otherwise-fine prompt into "needs collapsing").
  const measure = useCallback(() => {
    if (!collapsible) return;
    const el = bodyRef.current;
    if (!el) return;
    setIsOverflowing(el.scrollHeight > collapseThreshold + 8);
  }, [collapsible, collapseThreshold]);

  useLayoutEffect(() => {
    measure();
  }, [measure, prompt.text, prompt.structured, prompt.context]);

  useEffect(() => {
    if (!collapsible) return;
    const el = bodyRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [collapsible, measure]);

  const shouldClamp = collapsible && isOverflowing && !expanded;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div
        className={cn(
          'relative overflow-hidden transition-[max-height] duration-300 ease-out',
        )}
        style={
          shouldClamp ? { maxHeight: `${collapseThreshold}px` } : undefined
        }
      >
        <div ref={bodyRef} className="flex flex-col gap-3">
          {structured && structured.instructions ? (
            <>
              <Markdown>{structured.instructions}</Markdown>
              {structured.input ? (
                <FieldBlock label="Input" tone="quote">
                  <Markdown>{structured.input}</Markdown>
                </FieldBlock>
              ) : null}
              {structured.outputFormat ? (
                <FieldBlock label="Output format" tone="panel">
                  <Markdown>{structured.outputFormat}</Markdown>
                </FieldBlock>
              ) : null}
            </>
          ) : (
            <Markdown>{text}</Markdown>
          )}
        </div>

        {shouldClamp && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-b from-transparent to-card"
          />
        )}
      </div>

      {collapsible && isOverflowing && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="self-start inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
          aria-expanded={expanded}
        >
          <span>{expanded ? 'Show less' : 'Show more'}</span>
          <ChevronDown
            className={cn(
              'size-3 transition-transform duration-200',
              expanded && 'rotate-180',
            )}
          />
        </button>
      )}

      {context ? <ContextBlock>{context}</ContextBlock> : null}
    </div>
  );
}

function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-mini">
      <ReactMarkdown remarkPlugins={MARKDOWN_PLUGINS}>{children}</ReactMarkdown>
    </div>
  );
}

function FieldBlock({
  label,
  tone,
  children,
}: {
  label: string;
  tone: 'quote' | 'panel';
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1.5',
        tone === 'quote' && 'border-l-2 border-border pl-3',
        tone === 'panel' &&
          'rounded-md border border-border bg-surface-highlight/40 px-3 py-2',
      )}
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <div>{children}</div>
    </div>
  );
}

function ContextBlock({ children }: { children: string }) {
  return (
    <div className="flex flex-col gap-1 border-l-2 border-border pl-3">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Context
      </span>
      <div className="text-xs text-muted-foreground">
        <div className="prose-mini" style={{ fontSize: '12px' }}>
          <ReactMarkdown remarkPlugins={MARKDOWN_PLUGINS}>
            {children}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
