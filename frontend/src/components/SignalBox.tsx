import {ComponentChildren} from 'preact';

export function SignalBox(props: {tone: 'warn' | 'err' | 'ok'; title: string; children: ComponentChildren}) {
  return (
    <div class={`signal-box tone-${props.tone}`}>
      <div class="signal-title">{props.title}</div>
      <div class="signal-body">{props.children}</div>
    </div>
  );
}
