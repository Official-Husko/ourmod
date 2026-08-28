import {useEffect, useState} from 'preact/hooks';
import {JSX} from 'preact';

// Tries each URL in `srcs` in order (Steam-derived first, a table's own
// direct URL second - see steamArt.ts), advancing on load failure via
// onError. Renders nothing once every candidate has failed (or if `srcs`
// is empty), so a caller can simply layer this over its own placeholder
// and let the placeholder show through when no art is available - no
// separate "did everything fail" callback needed.
export function FallbackImage(props: {
  srcs: (string | undefined | false)[];
  alt: string;
  class?: string;
  style?: JSX.CSSProperties;
}) {
  const candidates = props.srcs.filter((s): s is string => !!s);
  const [index, setIndex] = useState(0);

  // A different feature/table can hand this a whole new candidate list -
  // start over from the first one instead of carrying over a stale index.
  useEffect(() => setIndex(0), [candidates.join('|')]);

  if (index >= candidates.length) return null;

  return (
    <img
      src={candidates[index]}
      alt={props.alt}
      class={props.class}
      style={props.style}
      onError={() => setIndex((i) => i + 1)}
    />
  );
}
