/**
 * Lazy wrapper around TiptapPromptEditor. Keeps the ~60KB+ Tiptap chunk
 * out of the initial bundle — the import fires only when this component
 * mounts, which only happens when the operator flips the "Rich editor"
 * toggle on in CreateCampaign.
 *
 * The fallback is a plain `<Textarea>` that mirrors the editor's
 * controlled-value contract, so keystrokes during the chunk's network
 * fetch still land in the prompt.
 */

import { Suspense, lazy } from 'react';
import { Textarea } from '../ui/textarea';
import type { TiptapPromptEditorProps } from './TiptapPromptEditor';

const TiptapPromptEditor = lazy(() => import('./TiptapPromptEditor'));

export function LazyTiptapPromptEditor(props: TiptapPromptEditorProps) {
  return (
    <Suspense fallback={<Fallback {...props} />}>
      <TiptapPromptEditor {...props} />
    </Suspense>
  );
}

function Fallback({
  value,
  onChange,
  placeholder,
  disabled,
}: TiptapPromptEditorProps) {
  return (
    <Textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      rows={6}
      className="min-h-[120px] font-mono text-sm"
    />
  );
}
