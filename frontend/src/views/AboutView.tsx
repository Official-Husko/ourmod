import {ComponentChildren} from 'preact';
import {useEffect, useState} from 'preact/hooks';
import {BuildInfo} from '../types';
import {BuildInfo as FetchBuildInfo, ListTables} from '../../wailsjs/go/desktop/App';
import {CommandLine} from '../components/CommandLine';
import {SignalBox} from '../components/SignalBox';

// Static content, but the "four rules" here aren't aspirational copy - each
// one describes something this codebase actually does today: Session
// restores every value on detach (internal/app/ourmod/engine/session.go),
// cheats are plain YAML anyone can read (pkg/cheats, tables/), and there's
// no account/update/payment system of any kind. Stats below are real
// counts, not the mockup's placeholder numbers ("62 contributors" etc.) -
// there's nothing to report yet beyond what's actually true.
export function AboutView() {
  const [tableCount, setTableCount] = useState<number | null>(null);
  const [build, setBuild] = useState<BuildInfo | null>(null);

  useEffect(() => {
    ListTables().then((t) => setTableCount(t.length));
    FetchBuildInfo().then(setBuild);
  }, []);

  return (
    <div class="view-pad">
      <div class="view-header"><span>about</span></div>

      <div class="settings-columns">
        <div class="settings-main about-body">
          <CommandLine command="cat about.txt" right={build ? `${build.os}/${build.arch}` : ''}/>

          <p class="about-lede">
            OurMod reads memory in a running game process and writes values you pick.
            It keeps no account and phones nothing home.
          </p>

          <div class="stat-row">
            <Stat value={tableCount ?? '-'} label="tables local"/>
            <Stat value="0" label="bytes sent home"/>
            <Stat value="0" label="accounts required"/>
            <Stat value={build?.goVersion.replace('go', '') ?? '-'} label="go version"/>
          </div>

          <div class="section-label">THE FOUR RULES</div>
          <div class="rules-list">
            <Rule n="01">Singleplayer only. Anti-cheat services read the same memory writes a trainer makes - the limit is theirs, not ours.</Rule>
            <Rule n="02">Every value written is restored on detach - see Session in the engine package. A save already on disk is not ours to undo.</Rule>
            <Rule n="03">Cheats are plain YAML, not compiled blobs. A table's signature, patch, or hook bytes are sitting right there in Scripts.</Rule>
            <Rule n="04">No paid tier, no key, no gate. There's no account system to put one behind.</Rule>
          </div>
        </div>

        <div class="settings-side">
          <SignalBox tone="warn" title="A ban is not reversible by us">
            Use OurMod on offline, singleplayer sessions and nothing else.
          </SignalBox>

          <div class="section-label">PROJECT</div>
          <div class="kv-list">
            {build && <div class="kv-row"><span class="dim">built with</span><span>{build.goVersion}</span></div>}
            <div class="kv-row"><span class="dim">platforms</span><span>linux (windows planned)</span></div>
            <div class="kv-row"><span class="dim">funding</span><span>none &middot; no paid tier</span></div>
            <div class="kv-row"><span class="dim">telemetry</span><span>none</span></div>
          </div>

          <div class="section-label">SOURCE</div>
          <div class="kv-list">
            <div class="kv-row"><span class="dim">module</span><span>github.com/Official-Husko/ourmod</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat(props: {value: string | number; label: string}) {
  return (
    <div class="stat">
      <div class="stat-value">{props.value}</div>
      <div class="stat-label">{props.label}</div>
    </div>
  );
}

function Rule(props: {n: string; children: ComponentChildren}) {
  return (
    <div class="rule-row">
      <span class="rule-n">{props.n}</span>
      <span>{props.children}</span>
    </div>
  );
}
