import {ComponentChildren} from 'preact';
import {useEffect, useState} from 'preact/hooks';
import {BuildInfo, TableSummary} from '../types';
import {BuildInfo as FetchBuildInfo, ListTables} from '../../wailsjs/go/desktop/App';
import {BrowserOpenURL} from '../../wailsjs/runtime/runtime';
import {CommandLine} from '../components/CommandLine';
import {SignalBox} from '../components/SignalBox';

const VERSION = 'v0.1.0-dev';
const LICENSE = 'GPL-3.0';
const LICENSE_URL = 'https://github.com/Official-Husko/ourmod/blob/main/LICENSE';

// Static content, but the "four rules" here aren't aspirational copy - each
// one describes something this codebase actually does today: Session
// restores every value on detach (internal/app/ourmod/engine/session.go),
// cheats are plain YAML anyone can read (pkg/cheats, tables/), and there's
// no account/update/payment system of any kind. Stats and authors below
// come from actually reading tables/ - there's nothing to report yet
// beyond what's actually true. LICENSE is now a real file in the repo
// root (plain GPLv3, unmodified) - checked directly rather than assumed.
export function AboutView() {
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [build, setBuild] = useState<BuildInfo | null>(null);

  useEffect(() => {
    ListTables().then(setTables);
    FetchBuildInfo().then(setBuild);
  }, []);

  const totalCheats = tables.reduce((sum, t) => sum + t.featureCount, 0);
  const authors = [...new Set(tables.flatMap((t) => t.author.split(',').map((a) => a.trim()).filter(Boolean)))];

  return (
    <div class="game-view">
      <div class="view-header">
        <span>about</span>
        <span class="spacer"/>
        <span class="dim mono-sm">{VERSION} &middot; {LICENSE} &middot; {authors.length} author{authors.length === 1 ? '' : 's'}</span>
      </div>

      <div class="settings-columns view-pad">
        <div class="settings-main about-body">
          <CommandLine command="cat about.txt" right="A HOST FOR TABLES, NOT A CHEAT ITSELF"/>

          <div class="page-title">What OurMod is</div>
          <div class="about-copy">
            <p>
              OurMod attaches to a running singleplayer game, reads the values a cheat
              table points at, and writes the ones you switch on. It is a host for those
              tables and nothing more - it ships no cheats of its own.
            </p>
            <p>
              Everything runs on your machine. There is no account, no library sync, and
              no usage figure sent anywhere. Tables are plain YAML files on disk, so you
              can read one before you trust it - open Scripts on any game to see exactly
              what it does.
            </p>
          </div>

          <div class="stat-row">
            <Stat value={tables.length} label="tables local"/>
            <Stat value={totalCheats} label="cheats total"/>
            <Stat value="0" label="bytes sent home"/>
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
            <div class="kv-row"><span class="dim">version</span><span>{VERSION}</span></div>
            {build && <div class="kv-row"><span class="dim">built with</span><span>{build.goVersion}</span></div>}
            <div class="kv-row"><span class="dim">platforms</span><span>linux (windows planned)</span></div>
            <div class="kv-row">
              <span class="dim">license</span>
              <a class="text-link" href={LICENSE_URL} onClick={(e) => { e.preventDefault(); BrowserOpenURL(LICENSE_URL); }}>
                {LICENSE}
              </a>
            </div>
            <div class="kv-row"><span class="dim">funding</span><span>none &middot; no paid tier</span></div>
            <div class="kv-row"><span class="dim">telemetry</span><span>none</span></div>
          </div>

          <div class="section-label">TABLE AUTHORS</div>
          {authors.length === 0 ? (
            <span class="hint">No tables loaded yet.</span>
          ) : (
            <div class="chip-row">
              {authors.map((a) => <span key={a} class="author-chip">{a}</span>)}
            </div>
          )}

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
