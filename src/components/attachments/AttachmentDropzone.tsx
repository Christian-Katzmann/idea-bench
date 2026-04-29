/**
 * Drag-and-drop / file-picker affordance under the per-prompt Context
 * textarea on the campaign creation wizard. Files are parsed in the
 * browser; the extracted text is appended to the textarea via the
 * caller-provided `onAppend` callback. The dropzone is stateless
 * regarding the textarea — it just emits parsed text + filename.
 *
 * A11y: the dropzone is a focusable button-like region. Enter/Space
 * trigger the native file picker; Esc dismisses the latest error.
 */

import { useCallback, useId, useRef, useState } from 'react';
import { Loader2, Paperclip, Upload, X } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';
import {
  ACCEPT_ATTRIBUTE,
  AttachmentParseError,
  formatBytes,
  parseFile,
} from '@/lib/attachments/parseFile';

interface ProcessedFile {
  /** Render-stable id; not the filename (operators may attach two files
   *  with the same name from different folders). */
  id: string;
  filename: string;
  size: number;
  charsAppended: number;
  truncated: number;
}

export interface AttachmentDropzoneProps {
  onAppend: (filename: string, text: string) => {
    appended: number;
    truncated: number;
    rejected: boolean;
  };
  /** ID of the textarea this dropzone augments — used for aria-controls. */
  controlsId: string;
  className?: string;
}

let nextLocalId = 0;
const makeId = () => `att-${++nextLocalId}-${Date.now()}`;

export function AttachmentDropzone({
  onAppend,
  controlsId,
  className,
}: AttachmentDropzoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [files, setFiles] = useState<ProcessedFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const dragDepth = useRef(0);

  const dismissErrors = useCallback(() => setErrors([]), []);

  const ingest = useCallback(
    async (incoming: FileList | File[]) => {
      const list = Array.from(incoming);
      if (list.length === 0) return;

      setBusy(true);
      setErrors([]);
      const newErrors: string[] = [];
      const processed: ProcessedFile[] = [];

      for (const file of list) {
        try {
          const text = await parseFile(file);
          const result = onAppend(file.name, text);
          if (result.rejected) {
            newErrors.push(
              `${file.name}: context is full — remove some text and try again.`,
            );
            continue;
          }
          processed.push({
            id: makeId(),
            filename: file.name,
            size: file.size,
            charsAppended: result.appended,
            truncated: result.truncated,
          });
        } catch (err) {
          const msg =
            err instanceof AttachmentParseError
              ? err.message
              : err instanceof Error
                ? err.message
                : 'Unknown error';
          newErrors.push(`${file.name}: ${msg}`);
        }
      }

      if (processed.length > 0) {
        setFiles((prev) => [...prev, ...processed]);
      }
      if (newErrors.length > 0) setErrors(newErrors);
      setBusy(false);
    },
    [onAppend],
  );

  const handleFileInput: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const files = e.target.files;
    if (files) void ingest(files);
    // Reset so picking the same file twice still fires onChange.
    e.target.value = '';
  };

  const openPicker = () => inputRef.current?.click();

  const onDragEnter: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    dragDepth.current += 1;
    if (e.dataTransfer.types.includes('Files')) setDragActive(true);
  };
  const onDragLeave: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragActive(false);
    }
  };
  const onDragOver: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void ingest(e.dataTransfer.files);
    }
  };

  const onKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openPicker();
    } else if (e.key === 'Escape' && errors.length > 0) {
      e.preventDefault();
      dismissErrors();
    }
  };

  const removeFile = (id: string) =>
    setFiles((prev) => prev.filter((f) => f.id !== id));

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div
        role="button"
        tabIndex={0}
        aria-controls={controlsId}
        aria-label="Attach files. Drop files here or press Enter to open the file picker."
        aria-busy={busy || undefined}
        onClick={openPicker}
        onKeyDown={onKeyDown}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={cn(
          'flex items-center justify-between gap-3 rounded-lg border border-dashed bg-card px-3 py-2.5 text-[12px] transition-colors',
          'cursor-pointer outline-none',
          'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
          dragActive
            ? 'border-foreground/40 bg-surface-highlight'
            : 'border-border hover:border-foreground/20',
        )}
      >
        <span className="flex items-center gap-2 text-muted-foreground">
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Paperclip className="size-3.5" aria-hidden />
          )}
          <span>
            {busy
              ? 'Reading files…'
              : 'Drop .txt, .md, .pdf, or .docx — or '}
            {!busy && (
              <span className="font-medium text-foreground underline-offset-2 hover:underline">
                browse
              </span>
            )}
          </span>
        </span>
        <Upload className="size-3.5 text-muted-foreground" aria-hidden />
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
          onChange={handleFileInput}
          className="sr-only"
          tabIndex={-1}
        />
      </div>

      {errors.length > 0 && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[11px] text-destructive"
        >
          <ul className="flex-1 space-y-0.5">
            {errors.map((msg, i) => (
              <li key={i}>{msg}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={dismissErrors}
            aria-label="Dismiss errors"
            className="-mr-1 rounded p-0.5 text-destructive/80 transition-colors hover:text-destructive focus-visible:outline-2 focus-visible:outline-destructive/60"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      )}

      {files.length > 0 && (
        <ul className="flex flex-col gap-1">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px]"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Paperclip
                  className="size-3 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <span className="truncate font-medium text-foreground">
                  {f.filename}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {formatBytes(f.size)}
                </span>
                {f.truncated > 0 && (
                  <span className="shrink-0 rounded-full bg-surface-highlight px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    truncated {f.truncated.toLocaleString()} chars
                  </span>
                )}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => removeFile(f.id)}
                className="text-muted-foreground hover:text-foreground"
                aria-label={`Remove ${f.filename} from the list`}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
