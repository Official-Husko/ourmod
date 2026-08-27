import {useEffect, useState} from 'preact/hooks';

// Types text out once (no delete/loop) - for CommandLine's "$ ..." lines,
// which should look like they're being typed when a screen loads, not
// rotate like the Library search bar's example placeholder.
export function useTypeOnce(text: string, speed = 22): {typed: string; done: boolean} {
  const [typed, setTyped] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    setTyped('');
    setDone(text.length === 0);

    let i = 0;
    const timer = window.setInterval(() => {
      i++;
      setTyped(text.slice(0, i));
      if (i >= text.length) {
        window.clearInterval(timer);
        setDone(true);
      }
    }, speed);

    return () => window.clearInterval(timer);
  }, [text, speed]);

  return {typed, done};
}
