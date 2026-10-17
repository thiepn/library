/** Reader-only shareable quotation. Never includes a private URL, raw work ID, or unresolvable CFI. */
export interface PassageReference {
  text: string;
  title: string;
  location: string;
}
export function formatPassageReference(input: PassageReference): string {
  const quote = input.text.replace(/\s+/g, ' ').trim();
  if (!quote) throw new Error('Select a passage first.');
  const title = input.title.replace(/\s+/g, ' ').trim() || 'Untitled book';
  const location = input.location.replace(/\s+/g, ' ').trim();
  return \`“\${quote}”\n— \${title}\${location ? \`, \${location}\` : ''}\`;
}

/** Refuse silently-failing clipboard operations. No remote service, permission prompt, or persistence. */
export async function copyPassageReference(input: PassageReference): Promise<boolean> {
  const text = formatPassageReference(input);
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
