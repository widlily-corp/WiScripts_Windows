import React from 'react';

export interface MarkdownRendererProps {
  content?: string;
  children?: string;
  className?: string;
}

export type MarkdownBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'blockquote'; text: string }
  | { type: 'code'; lang: string; code: string }
  | { type: 'paragraph'; text: string };

export function parseInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const regex = /\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|(?<!\*)\*([^*]+)\*(?!\*)|(?<!_)_([^_]+)_(?!_)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.substring(lastIndex, match.index));
    }

    if (match[1] !== undefined && match[2] !== undefined) {
      // Link [text](url)
      nodes.push(
        <a
          key={`link-${match.index}`}
          href={match[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand hover:underline font-medium"
        >
          {match[1]}
        </a>
      );
    } else if (match[3] !== undefined) {
      // Inline code `code`
      nodes.push(
        <code
          key={`code-${match.index}`}
          className="font-mono text-[11px] bg-surface-active text-brand px-1.5 py-0.5 rounded border border-border"
        >
          {match[3]}
        </code>
      );
    } else if (match[4] !== undefined || match[5] !== undefined) {
      // Bold **text** or __text__
      const content = match[4] ?? match[5];
      nodes.push(
        <strong key={`bold-${match.index}`} className="font-semibold text-text-primary">
          {content}
        </strong>
      );
    } else if (match[6] !== undefined || match[7] !== undefined) {
      // Italic *text* or _text_
      const content = match[6] ?? match[7];
      nodes.push(
        <em key={`italic-${match.index}`} className="italic text-text-secondary">
          {content}
        </em>
      );
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.substring(lastIndex));
  }

  return nodes;
}

export function parseMarkdownBlocks(raw: string): MarkdownBlock[] {
  if (!raw) return [];
  const normalized = raw.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 1. Code Block ```
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length && lines[i].trim().startsWith('```')) {
        i++;
      }
      blocks.push({
        type: 'code',
        lang,
        code: codeLines.join('\n'),
      });
      continue;
    }

    // 2. Headings (#, ##, ###)
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      blocks.push({ type: 'heading', level, text });
      i++;
      continue;
    }

    // 3. Blockquote (> quote)
    if (line.trim().startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        const content = lines[i].trim().replace(/^>\s?/, '');
        quoteLines.push(content);
        i++;
      }
      blocks.push({
        type: 'blockquote',
        text: quoteLines.join('\n'),
      });
      continue;
    }

    // 4. Bullet list item (- item or * item)
    const listMatch = line.match(/^\s*[-*]\s+(.*)$/);
    if (listMatch) {
      const listItems: string[] = [];
      while (i < lines.length) {
        const itemMatch = lines[i].match(/^\s*[-*]\s+(.*)$/);
        if (!itemMatch) break;
        listItems.push(itemMatch[1].trim());
        i++;
      }
      blocks.push({
        type: 'list',
        items: listItems,
      });
      continue;
    }

    // 5. Empty line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // 6. Regular paragraph text
    const paragraphLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trim().startsWith('```') &&
      !lines[i].match(/^(#{1,6})\s+(.*)$/) &&
      !lines[i].trim().startsWith('>') &&
      !lines[i].match(/^\s*[-*]\s+(.*)$/)
    ) {
      paragraphLines.push(lines[i].trim());
      i++;
    }

    if (paragraphLines.length > 0) {
      blocks.push({
        type: 'paragraph',
        text: paragraphLines.join(' '),
      });
    }
  }

  return blocks;
}

export function MarkdownRenderer({ content, children, className = '' }: MarkdownRendererProps) {
  const rawText = content ?? children ?? '';
  const blocks = parseMarkdownBlocks(rawText);

  return (
    <div className={`space-y-3 text-xs text-text-secondary ${className}`}>
      {blocks.map((block, idx) => {
        switch (block.type) {
          case 'heading': {
            if (block.level === 1) {
              return (
                <h1 key={idx} className="text-base font-bold text-text-primary mt-4 mb-2 tracking-tight">
                  {parseInline(block.text)}
                </h1>
              );
            }
            if (block.level === 2) {
              return (
                <h2 key={idx} className="text-sm font-semibold text-text-primary mt-3 mb-1.5 pb-1 border-b border-border tracking-tight">
                  {parseInline(block.text)}
                </h2>
              );
            }
            return (
              <h3 key={idx} className="text-xs font-semibold text-text-primary mt-2.5 mb-1 tracking-tight">
                {parseInline(block.text)}
              </h3>
            );
          }
          case 'list': {
            return (
              <ul key={idx} className="list-disc list-inside space-y-1.5 my-2 pl-2 text-xs text-text-secondary leading-relaxed">
                {block.items.map((item, itemIdx) => (
                  <li key={itemIdx} className="marker:text-brand">
                    {parseInline(item)}
                  </li>
                ))}
              </ul>
            );
          }
          case 'blockquote': {
            return (
              <blockquote
                key={idx}
                className="border-l-2 border-brand pl-3 py-2 my-2 text-xs text-text-secondary italic bg-surface rounded-r border-t border-b border-r border-border/80 leading-relaxed"
              >
                {parseInline(block.text)}
              </blockquote>
            );
          }
          case 'code': {
            return (
              <pre
                key={idx}
                className="font-mono text-xs bg-background p-3 rounded-[6px] border border-border text-text-primary overflow-x-auto my-2 font-mono leading-relaxed select-text"
              >
                <code>{block.code}</code>
              </pre>
            );
          }
          case 'paragraph': {
            return (
              <p key={idx} className="text-xs text-text-secondary leading-relaxed my-1 font-sans">
                {parseInline(block.text)}
              </p>
            );
          }
          default:
            return null;
        }
      })}
    </div>
  );
}
