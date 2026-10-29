import React from 'react';

// Teaching bubbles, tutorial pages and answer feedback share plain paragraphs
// and bullet lists. Text stays escaped; this does not interpret HTML or Markdown.
export function renderTextBlocks(text: string) {
  const blocks: { list: boolean; lines: string[] }[] = [];
  let current: (typeof blocks)[number] | undefined;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) { current = undefined; continue; }
    const list = line.startsWith('- ');
    if (!current || current.list !== list) {
      current = { list, lines: [] };
      blocks.push(current);
    }
    current.lines.push(list ? line.slice(2) : line);
  }
  return blocks.map((block, index) => block.list
    ? <ul key={index} className={`list-disc pl-4 space-y-1 ${index > 0 ? 'mt-2' : ''}`}>
      {block.lines.map((line, item) => <li key={item}>{line}</li>)}
    </ul>
    : <p key={index} className={index > 0 ? 'mt-2' : 'm-0'}>{block.lines.join('\n')}</p>);
}
