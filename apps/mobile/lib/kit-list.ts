import * as Print from 'expo-print';
import { Platform } from 'react-native';

// "What to bring" text → sections. One item per line; a line ending in ":" starts
// a new section, a line starting "Note:" is small print attached to the section
// it sits in. Items before any heading land in an untitled first section.
export type KitSection = { heading: string | null; items: string[]; notes: string[] };

export function parseKitList(text: string): KitSection[] {
  const sections: KitSection[] = [];
  let current: KitSection | null = null;
  const ensure = () => {
    if (!current) {
      current = { heading: null, items: [], notes: [] };
      sections.push(current);
    }
    return current;
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) {
      continue;
    }
    if (line.endsWith(':')) {
      current = { heading: line.slice(0, -1).trim(), items: [], notes: [] };
      sections.push(current);
    } else if (/^note:/i.test(line)) {
      ensure().notes.push(line.replace(/^note:\s*/i, ''));
    } else {
      ensure().items.push(line);
    }
  }
  return sections;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// A printable tick-box checklist in the style of the club's PDF kit lists.
export function buildKitChecklistHtml(title: string, when: string, text: string): string {
  const body = parseKitList(text)
    .map((sec) => {
      // Long optional lists go in two columns, as on the club PDF.
      const twoCol = sec.items.length > 8 && /optional/i.test(sec.heading ?? '');
      const items = sec.items.map((i) => `<li>${escapeHtml(i)}</li>`).join('');
      const notes = sec.notes.map((n) => `<p class="note">${escapeHtml(n)}</p>`).join('');
      return `<section>${sec.heading ? `<h2>${escapeHtml(sec.heading)}</h2>` : ''}<ul${
        twoCol ? ' class="cols"' : ''
      }>${items}</ul>${notes}</section>`;
    })
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)} — kit checklist</title>
<style>
  body { font-family: 'Jost', system-ui, sans-serif; color: #1f2428; margin: 32px 40px; font-size: 13px; }
  h1 { color: #b5402a; font-weight: 500; font-size: 20px; margin: 0 0 2px; }
  .when { color: #666; margin: 0 0 18px; }
  h2 { font-size: 14px; margin: 18px 0 6px; break-after: avoid; }
  ul { list-style: none; padding: 0 0 0 28px; margin: 0; }
  ul.cols { columns: 2; column-gap: 32px; }
  li { position: relative; padding: 2px 0 2px 24px; break-inside: avoid; }
  li::before { content: ''; position: absolute; left: 0; top: 3px; width: 12px; height: 12px; border: 1.2px solid #555; border-radius: 2px; }
  .note { font-style: italic; font-size: 11px; color: #555; margin: 6px 0 0 52px; }
  .actions { margin-bottom: 20px; }
  .actions button { font: inherit; padding: 8px 14px; border-radius: 8px; border: 0; background: #2f4858; color: #fff; cursor: pointer; }
  @media print { .actions { display: none; } body { margin: 0; } }
</style></head><body>
<div class="actions"><button onclick="window.print()">Print / save as PDF</button></div>
<h1>${escapeHtml(title)} — kit checklist</h1>
<p class="when">${escapeHtml(when)}</p>
${body}
</body></html>`;
}

// Opens the checklist ready to print or save as PDF: the system print sheet on
// native, a new tab on web (expo-print's web printAsync prints the current page).
export async function openKitChecklist(title: string, when: string, text: string) {
  const html = buildKitChecklistHtml(title, when, text);
  if (Platform.OS !== 'web') {
    await Print.printAsync({ html });
    return;
  }
  const blob = new Blob([html], {
    type: 'text/html;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  // Give the new tab time to load before releasing the blob.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
