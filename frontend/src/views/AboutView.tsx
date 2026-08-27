import {ComponentChildren} from 'preact';

// Static content, but the "four rules" here aren't aspirational copy - each
// one describes something this codebase actually does today: Session
// restores every value on detach (internal/app/ourmod/engine/session.go),
// cheats are plain YAML anyone can read (pkg/cheats, tables/), and there's
// no account/update/payment system of any kind.
export function AboutView() {
  return (
    <div class="view-pad">
      <div class="view-header"><span>about</span></div>

      <div class="about-body">
        <p class="about-lede">
          OurMod reads memory in a running game process and writes values you pick.
          It keeps no account and phones nothing home.
        </p>

        <div class="rules-grid">
          <Rule title="Singleplayer only">
            Attaching writes into a live process. That's fine for a singleplayer save;
            it's how anti-cheat systems detect trainers in anything else.
          </Rule>
          <Rule title="Restore on detach">
            Every patch or hook OurMod installs is undone when you detach, in the
            reverse order it was applied - see Session in the engine package.
          </Rule>
          <Rule title="Readable source required">
            Cheats are plain YAML, not compiled blobs. A table's signature, patch, or
            hook bytes are sitting right there in the Scripts view.
          </Rule>
          <Rule title="No paid tier">
            There's no account system to put one behind.
          </Rule>
        </div>

        <div class="section-label">SOURCE</div>
        <div class="kv-list">
          <div class="kv-row"><span class="dim">module</span><span>github.com/Official-Husko/ourmod</span></div>
        </div>
      </div>
    </div>
  );
}

function Rule(props: {title: string; children: ComponentChildren}) {
  return (
    <div class="rule-card">
      <div class="rule-title">{props.title}</div>
      <p>{props.children}</p>
    </div>
  );
}
