import {JSX} from 'preact';

// A small, dependency-free line tokenizer for our own cheat-table YAML -
// not a general YAML parser. Colors follow the mockup's CodeBlock palette:
// keys in light blue, strings in green, numbers in amber, comments/
// punctuation dimmed.
export function YamlBlock(props: {source: string}) {
  const lines = props.source.split('\n');

  return (
    <pre class="code-block">
      {lines.map((line, i) => (
        <span key={i}>
          {highlightLine(line)}
          {i < lines.length - 1 ? '\n' : ''}
        </span>
      ))}
    </pre>
  );
}

function highlightLine(line: string): JSX.Element {
  const comment = line.match(/^(\s*)(#.*)$/);
  if (comment) {
    return (
      <>
        {comment[1]}
        <span class="tok-comment">{comment[2]}</span>
      </>
    );
  }

  const kv = line.match(/^(\s*)(- )?([A-Za-z0-9_]+)(:)(\s*)(.*)$/);
  if (kv) {
    const [, indent, dash, key, colon, sp, rest] = kv;
    return (
      <>
        {indent}
        {dash && <span class="tok-punct">{dash}</span>}
        <span class="tok-key">{key}</span>
        <span class="tok-punct">{colon}</span>
        {sp}
        {highlightValue(rest)}
      </>
    );
  }

  const bareItem = line.match(/^(\s*)(- )(.*)$/);
  if (bareItem) {
    const [, indent, dash, rest] = bareItem;
    return (
      <>
        {indent}
        <span class="tok-punct">{dash}</span>
        {highlightValue(rest)}
      </>
    );
  }

  // Continuation line of a block scalar (e.g. hook.body's hex bytes).
  return <span class="tok-value">{line}</span>;
}

function highlightValue(text: string): JSX.Element {
  if (text === '') return <></>;

  const trimmed = text.trim();

  if (/^".*"$/.test(trimmed)) {
    return <span class="tok-string">{text}</span>;
  }
  if (/^[-+]?\d+(\.\d+)*$/.test(trimmed)) {
    return <span class="tok-number">{text}</span>;
  }
  return <span class="tok-value">{text}</span>;
}
