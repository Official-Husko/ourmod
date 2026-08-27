import {useEffect, useState} from 'preact/hooks';
import {TableSource} from '../../wailsjs/go/desktop/App';
import {YamlBlock} from '../components/YamlBlock';

export function ScriptsView(props: {tablePath: string | null; tableName: string | null}) {
  const {tablePath, tableName} = props;
  const [source, setSource] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tablePath) {
      setSource('');
      return;
    }
    TableSource(tablePath).then(setSource).catch((err) => setError(String(err)));
  }, [tablePath]);

  if (!tablePath) {
    return (
      <div class="view-pad">
        <div class="view-header"><span>scripts</span></div>
        <div class="empty-big">
          <div class="empty-title">NO GAME SELECTED</div>
          <p>Pick a game in Library to read its table source.</p>
        </div>
      </div>
    );
  }

  return (
    <div class="view-pad">
      <div class="view-header"><span>scripts &middot; {tableName}</span></div>
      <p class="hint">Read-only source of <code>{tablePath}</code>. Edit the file directly to change it.</p>
      {error ? (
        <div class="empty-big"><div class="empty-title">COULD NOT READ FILE</div><p>{error}</p></div>
      ) : (
        <YamlBlock source={source}/>
      )}
    </div>
  );
}
