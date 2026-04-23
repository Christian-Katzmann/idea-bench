/**
 * Tiptap rich-text editor for structured prompt authoring. Adapted from
 * the reuse-kit's tiptap-shadcn-toolbar-kit (pattern-mode), re-skinned
 * to ModelArena's Base UI + design-system vocabulary.
 *
 * ⚠ This module imports Tiptap which ships ~60KB+ gzipped. DO NOT
 * import directly — always load via `LazyTiptapPromptEditor` so the
 * chunk only ships when a user explicitly enables the editor. The
 * bundle-budget commitment (HANDOFF §D / PERF-V2) depends on this.
 *
 * Scope: bold / italic / code / code-block / bullet list / ordered list
 * via StarterKit. Deliberately no dropdowns, popovers, colors, images,
 * or tables — ModelArena prompts don't need them, and each extension is
 * more dependencies to ship. If a prompt author needs headings, they
 * can switch to the plain textarea fallback.
 */

import { useCallback, useEffect } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold as BoldIcon,
  Code as CodeIcon,
  Italic as ItalicIcon,
  List as ListIcon,
  ListOrdered as ListOrderedIcon,
  SquareCode as CodeBlockIcon,
} from 'lucide-react';
import { cn } from '../../lib/utils';

export interface TiptapPromptEditorProps {
  /** Plain-text representation of the current prompt. */
  value: string;
  /** Fires with the editor's plain text whenever the document changes. */
  onChange: (plainText: string) => void;
  /** Optional placeholder shown in the editable region. */
  placeholder?: string;
  /** Disables editing — used while a generation is streaming. */
  disabled?: boolean;
}

/**
 * Tiptap editor component. Consumed via LazyTiptapPromptEditor so
 * production bundles only load the Tiptap chunk on demand.
 *
 * We export plain text (not HTML) because ModelArena's prompt storage
 * is plain-text — the text field is what the LLM sees. Formatting
 * helps the operator author, not the model. If prompts ever need to
 * preserve HTML/Markdown structure server-side, swap `editor.getText()`
 * for `editor.getHTML()` here.
 */
export default function TiptapPromptEditor({
  value,
  onChange,
  placeholder,
  disabled = false,
}: TiptapPromptEditorProps) {
  const editor = useEditor(
    {
      extensions: [StarterKit.configure({})],
      content: value,
      editable: !disabled,
      onUpdate: ({ editor: ed }) => {
        onChange(ed.getText());
      },
      editorProps: {
        attributes: {
          class: cn(
            'min-h-[120px] max-h-[360px] overflow-y-auto rounded-md border border-border bg-background',
            'px-3 py-2 text-sm leading-relaxed outline-none',
            'focus:border-foreground/40',
            'prose prose-sm max-w-none dark:prose-invert',
            disabled && 'opacity-70 cursor-not-allowed',
          ),
          'data-slot': 'tiptap-editor',
        },
      },
    },
    [],
  );

  // External value changes (e.g. prompt loaded from server) should
  // sync into the editor — but only when they differ from the current
  // text so typing isn't clobbered.
  useEffect(() => {
    if (!editor) return;
    if (editor.getText() === value) return;
    editor.commands.setContent(value, false);
  }, [editor, value]);

  useEffect(() => {
    if (!editor) return;
    if (editor.isEditable !== !disabled) {
      editor.setEditable(!disabled);
    }
  }, [editor, disabled]);

  if (!editor) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <Toolbar editor={editor} disabled={disabled} />
      <EditorContent editor={editor} data-placeholder={placeholder} />
    </div>
  );
}

/**
 * Compact toolbar rendered above the editor. Buttons are plain
 * <button type="button"> with ModelArena's ink-on-paper styling —
 * deliberately NOT using @/components/ui/button because its sizes
 * don't fit a toolbar and importing it would drag the full variant
 * system into the lazy chunk. Toolbar styling is intentionally
 * minimal so the warm-paper aesthetic stays front-and-center.
 */
function Toolbar({
  editor,
  disabled,
}: {
  editor: ReturnType<typeof useEditor>;
  disabled: boolean;
}) {
  const toggle = useCallback(
    (
      run: () => boolean,
      isActive: () => boolean,
      label: string,
      Icon: typeof BoldIcon,
    ) => {
      const active = isActive();
      return (
        <button
          type="button"
          title={label}
          aria-label={label}
          aria-pressed={active}
          onClick={() => run()}
          disabled={disabled}
          className={cn(
            'flex size-7 items-center justify-center rounded-sm border border-transparent text-muted-foreground',
            'hover:border-border hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/60',
            'disabled:cursor-not-allowed disabled:opacity-50',
            active &&
              'border-border bg-surface-highlight/60 text-foreground',
          )}
        >
          <Icon className="size-3.5" />
        </button>
      );
    },
    [disabled],
  );

  if (!editor) return null;

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex items-center gap-0.5"
    >
      {toggle(
        () => editor.chain().focus().toggleBold().run(),
        () => editor.isActive('bold'),
        'Bold',
        BoldIcon,
      )}
      {toggle(
        () => editor.chain().focus().toggleItalic().run(),
        () => editor.isActive('italic'),
        'Italic',
        ItalicIcon,
      )}
      {toggle(
        () => editor.chain().focus().toggleCode().run(),
        () => editor.isActive('code'),
        'Inline code',
        CodeIcon,
      )}
      <span className="mx-1 h-4 w-px bg-border" aria-hidden />
      {toggle(
        () => editor.chain().focus().toggleBulletList().run(),
        () => editor.isActive('bulletList'),
        'Bullet list',
        ListIcon,
      )}
      {toggle(
        () => editor.chain().focus().toggleOrderedList().run(),
        () => editor.isActive('orderedList'),
        'Ordered list',
        ListOrderedIcon,
      )}
      <span className="mx-1 h-4 w-px bg-border" aria-hidden />
      {toggle(
        () => editor.chain().focus().toggleCodeBlock().run(),
        () => editor.isActive('codeBlock'),
        'Code block',
        CodeBlockIcon,
      )}
    </div>
  );
}
