export type ManualAlbumLineParseResult =
  | { kind: 're-release' }
  | { kind: 'invalid' }
  | { kind: 'parsed'; artistName: string; discName: string };

export function parseManualAlbumLine(line: string): ManualAlbumLineParseResult {
  if (line.toLowerCase().includes('re-release')) {
    return { kind: 're-release' };
  }

  // Keep the original first-occurrence replacement and split semantics.
  const normalizedLine = line.replace(' - ', ' – ');
  const [artistName, discInfo] = normalizedLine.split(' – ');
  if (!artistName || !discInfo) {
    return { kind: 'invalid' };
  }

  let discName = discInfo.trim();
  const suffix = discName.match(/\(([^)]+)\)$/);
  if (suffix) {
    discName = discName.replace(`(${suffix[1]})`, '').trim();
  }

  return { kind: 'parsed', artistName, discName };
}
