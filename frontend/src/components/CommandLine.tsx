import {useTypeOnce} from '../hooks/useTypeOnce';

// Types the command out once when it mounts (or when the command text
// changes), then reveals the right-aligned status text once typing
// finishes - like a command executing and printing its result.
export function CommandLine(props: {command: string; right?: string}) {
  const {typed, done} = useTypeOnce(props.command);

  return (
    <div class="command-line">
      <span class="command-line-cmd">
        $ {typed}
        <span class={`command-cursor${done ? ' command-cursor-blink' : ''}`}>&#9615;</span>
      </span>
      {props.right && <span class={`command-line-right${done ? ' command-line-right-visible' : ''}`}>{props.right}</span>}
    </div>
  );
}
