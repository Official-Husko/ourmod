// A settings-style toggle row: fake switch + label + optional hint text.
// With no `onChange`, it's inert and shows a "coming soon" badge - that's
// every use in Settings today, where there's genuinely no settings-
// persistence layer yet. Passing `checked`/`onChange` turns it into a real,
// clickable toggle instead (Save mods, on the game panel's sidebar).
export function ToggleRow(props: {
  label: string;
  hint?: string;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  tone?: 'accent' | 'warn';
}) {
  const live = props.onChange !== undefined;
  const onClass = props.checked ? ` toggle-on toggle-${props.tone ?? 'accent'}` : '';

  return (
    <div class="toggle-row">
      {live ? (
        <div
          class={`toggle-fake toggle-live${onClass}`}
          role="switch"
          aria-checked={!!props.checked}
          onClick={() => props.onChange!(!props.checked)}
        />
      ) : (
        <div class="toggle-fake" aria-disabled="true"/>
      )}
      <div>
        <div class="toggle-label">{props.label}</div>
        {props.hint && <div class="toggle-hint">{props.hint}</div>}
      </div>
      {!live && <span class="coming-soon">coming soon</span>}
    </div>
  );
}
