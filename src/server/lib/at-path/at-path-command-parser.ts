/**
 * Vendored from /Users/christiankatzmann/Dev/reuse-kit/ready/at-path-command-parser/src/at-path-command-parser.ts
 *
 * @ command parser for file references. Handles \ escapes, ambient
 * punctuation, sentence-terminal periods, and multi-dot paths.
 *
 * Licensed under Apache-2.0 (original © 2025 AionUi).
 */

export interface AtCommandPart {
  type: 'text' | 'atPath';
  content: string;
}

function unescapeAtPath(rawPath: string): string {
  const path = rawPath.startsWith('@') ? rawPath.substring(1) : rawPath;
  return path.replace(/\\(.)/g, '$1');
}

export function parseAllAtCommands(query: string): AtCommandPart[] {
  const parts: AtCommandPart[] = [];
  let currentIndex = 0;

  while (currentIndex < query.length) {
    let atIndex = -1;
    let nextSearchIndex = currentIndex;
    while (nextSearchIndex < query.length) {
      if (
        query[nextSearchIndex] === '@' &&
        (nextSearchIndex === 0 || query[nextSearchIndex - 1] !== '\\')
      ) {
        atIndex = nextSearchIndex;
        break;
      }
      nextSearchIndex++;
    }

    if (atIndex === -1) {
      if (currentIndex < query.length) {
        parts.push({ type: 'text', content: query.substring(currentIndex) });
      }
      break;
    }

    if (atIndex > currentIndex) {
      parts.push({
        type: 'text',
        content: query.substring(currentIndex, atIndex),
      });
    }

    let pathEndIndex = atIndex + 1;
    let inEscape = false;
    while (pathEndIndex < query.length) {
      const char = query[pathEndIndex];
      if (inEscape) {
        inEscape = false;
      } else if (char === '\\') {
        inEscape = true;
      } else if (/[,\s;!?()[\]{}]/.test(char)) {
        break;
      } else if (char === '.') {
        const nextChar =
          pathEndIndex + 1 < query.length ? query[pathEndIndex + 1] : '';
        if (nextChar === '' || /\s/.test(nextChar)) {
          break;
        }
      }
      pathEndIndex++;
    }
    const rawAtPath = query.substring(atIndex, pathEndIndex);
    const atPath = unescapeAtPath(rawAtPath);
    parts.push({ type: 'atPath', content: atPath });
    currentIndex = pathEndIndex;
  }
  return parts.filter(
    (part) => !(part.type === 'text' && part.content.trim() === ''),
  );
}

export function extractAtPaths(query: string): string[] {
  const parts = parseAllAtCommands(query);
  return parts
    .filter((part) => part.type === 'atPath' && part.content !== '')
    .map((part) => part.content);
}

export function hasAtReferences(query: string): boolean {
  return extractAtPaths(query).length > 0;
}

export function reconstructQuery(
  parts: AtCommandPart[],
  pathReplacer?: (path: string) => string,
): string {
  return parts
    .map((part) => {
      if (part.type === 'text') {
        return part.content;
      }
      if (pathReplacer) {
        return pathReplacer(part.content);
      }
      return '@' + part.content;
    })
    .join('');
}
