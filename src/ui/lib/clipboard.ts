export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

export async function clearClipboardIfMatches(value: string): Promise<void> {
  try {
    const current = await navigator.clipboard.readText();
    if (current === value) await navigator.clipboard.writeText('');
  } catch {
    /* clipboard may be denied */
  }
}
