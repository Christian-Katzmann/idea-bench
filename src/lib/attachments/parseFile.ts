/**
 * Client-side file parsers for the campaign-wizard Context attach
 * affordance. Heavy parsers (`pdfjs-dist`, `mammoth`) are dynamically
 * imported so they ship in their own Rollup chunks and only land in the
 * browser when the operator drops a file of that type. txt/md are read
 * inline — there's no library to defer.
 *
 * No file ever leaves the browser; we extract text and inline it into the
 * Context textarea.
 */

export type AttachmentKind = 'txt' | 'md' | 'pdf' | 'docx';

export const ACCEPTED_EXTENSIONS: readonly string[] = [
  '.txt',
  '.md',
  '.pdf',
  '.docx',
] as const;

export const ACCEPT_ATTRIBUTE = ACCEPTED_EXTENSIONS.join(',');

/** 5 MB per-file cap before we even try to parse. */
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export type AttachmentErrorCode =
  | 'unsupported_type'
  | 'too_large'
  | 'parse_failed'
  | 'encrypted_pdf'
  | 'empty';

export class AttachmentParseError extends Error {
  constructor(message: string, public readonly code: AttachmentErrorCode) {
    super(message);
    this.name = 'AttachmentParseError';
  }
}

export function detectKind(filename: string): AttachmentKind | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.txt')) return 'txt';
  if (lower.endsWith('.md')) return 'md';
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.docx')) return 'docx';
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const WHITESPACE_RE = /\s+/g;

/**
 * Validate-and-extract. Throws `AttachmentParseError` with a typed code so
 * the UI can render a tailored message (encrypted PDFs vs unsupported
 * types vs oversized).
 */
export async function parseFile(file: File): Promise<string> {
  const kind = detectKind(file.name);
  if (kind === null) {
    throw new AttachmentParseError(
      `Unsupported file type. Accepted: ${ACCEPTED_EXTENSIONS.join(', ')}`,
      'unsupported_type',
    );
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new AttachmentParseError(
      `File is ${formatBytes(file.size)}; max is ${formatBytes(MAX_FILE_SIZE_BYTES)}.`,
      'too_large',
    );
  }

  let text: string;
  try {
    if (kind === 'txt' || kind === 'md') {
      text = await file.text();
    } else if (kind === 'pdf') {
      text = await parsePdf(file);
    } else {
      text = await parseDocx(file);
    }
  } catch (err) {
    if (err instanceof AttachmentParseError) throw err;
    const msg = err instanceof Error ? err.message : 'Unknown parse error';
    throw new AttachmentParseError(
      `Could not read this file: ${msg}`,
      'parse_failed',
    );
  }

  if (text.replace(WHITESPACE_RE, '').length === 0) {
    throw new AttachmentParseError(
      'No text could be extracted from this file.',
      'empty',
    );
  }
  return text.trim();
}

async function parsePdf(file: File): Promise<string> {
  // Dynamic import keeps pdfjs (≈hundreds of kB) out of the main bundle.
  // The worker is shipped as a separate hashed asset via Vite's `?url`
  // import; pdfjs spawns it lazily on `getDocument`.
  const [pdfjs, workerUrlMod] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrlMod.default;

  const buf = await file.arrayBuffer();
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/password/i.test(msg) || /encrypted/i.test(msg)) {
      throw new AttachmentParseError(
        'This PDF is password-protected. Remove the password and try again.',
        'encrypted_pdf',
      );
    }
    throw err;
  }

  const parts: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ');
    parts.push(pageText);
  }
  return parts.join('\n\n');
}

async function parseDocx(file: File): Promise<string> {
  // Mammoth has a browser-only entry that skips its Node deps. Dynamic
  // import keeps it (and its JSZip transitive) out of the main bundle.
  const mammoth = (await import('mammoth/mammoth.browser.js')) as unknown as {
    extractRawText: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
  };
  const buf = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buf });
  return result.value;
}
