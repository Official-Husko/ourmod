// A settings-style toggle row: fake switch + label + optional hint text +
// a "coming soon" badge. Every use today is inert - there's no persisted
// settings file or saved-mods mechanism yet - so this is always disabled;
// it exists so a not-yet-implemented behaviour still gets the real layout
// instead of being left out of the screen entirely.
export function ToggleRow(props: {label: string; hint?: string}) {
  return (
    <div class="toggle-row">
      <div class="toggle-fake" aria-disabled="true"/>
      <div>
        <div class="toggle-label">{props.label}</div>
        {props.hint && <div class="toggle-hint">{props.hint}</div>}
      </div>
      <span class="coming-soon">coming soon</span>
    </div>
  );
}
