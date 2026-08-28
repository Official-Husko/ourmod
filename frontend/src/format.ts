// Matches the mockup's checksum display exactly: "sha256 " + first 4 hex
// chars + "…" + last 4, e.g. "sha256 4f9c…a1b7".
export function formatChecksum(checksum: string): string {
  if (!checksum) return '';
  return `sha256 ${checksum.slice(0, 4)}…${checksum.slice(-4)}`;
}
