// Decorative, matching the mockup's CommandLine element on nearly every
// screen - not a real shell, just a styled label.
export function CommandLine(props: {command: string; right?: string}) {
  return (
    <div class="command-line">
      <span class="command-line-cmd">$ {props.command}</span>
      {props.right && <span class="command-line-right">{props.right}</span>}
    </div>
  );
}
