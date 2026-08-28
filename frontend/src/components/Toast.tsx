import {useEffect, useState} from 'preact/hooks';

// A CLI-styled error toast that actually plays an exit transition instead
// of vanishing instantly (a plain conditional render can't animate out,
// since the element is just gone the instant the condition flips) - it
// stays mounted for one transition duration after `message` clears so the
// fit-out animation has time to run.
export function Toast(props: {message: string | null}) {
  const [rendered, setRendered] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (props.message) {
      setRendered(props.message);
      // Mount with visible=false first, then flip on the next frame so the
      // CSS transition has a starting state to animate from.
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }

    setVisible(false);
    const timer = window.setTimeout(() => setRendered(null), 220);
    return () => window.clearTimeout(timer);
  }, [props.message]);

  if (!rendered) return null;

  return (
    <div class={`toast${visible ? ' toast-visible' : ''}`}>
      <span class="toast-prompt">&gt;</span>
      <span>{rendered}</span>
    </div>
  );
}
