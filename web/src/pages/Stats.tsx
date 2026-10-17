import { Badge, Icon, PageHeader, Surface } from '../components/ui';
import { useEffect, useState } from 'react';
import { API_BASE } from '../lib/api';
import './Stats.css';

type Summary = { utterances: number; e2e_p50: number | null; e2e_p95: number | null; gloss_p50: number | null; tts_p50: number | null; fallback_rate: number | null };
type Trend = { bucket: string; utterances: number; avg_e2e_ms: number | null; max_e2e_ms: number | null };
type Weak = { gloss: string; n: number; avg_conf: number; accept_rate: number };
type StatsT = { configured: boolean; summary?: Summary; trend?: Trend[]; weakest_signs?: Weak[] };
const ms = (v: number | null | undefined) => (v == null ? '–' : `${Math.round(Number(v))} ms`);

export default function Stats() {
  const [s, setS] = useState<StatsT | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    const load = () => fetch(`${API_BASE}/api/stats`).then((r) => r.json()).then((d: StatsT) => { setS(d); setErr(''); }).catch(() => setErr('Stats unavailable'));
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);
  const heading = <PageHeader eyebrow="SIGNLINE / INSIGHTS" title="The conversation, at a glance."
    description="A quiet look at pipeline performance over the last 15 minutes. Live data refreshes every five seconds."
    accessory={<Badge tone={s?.configured && !err ? 'positive' : 'neutral'}>{s?.configured && !err ? 'Live stats' : 'Awaiting data'}</Badge>} />;
  if (err || !s || !s.configured) return <main className="stats" id="main-content">{heading}<Surface className="state-panel" aria-labelledby="stats-state-title"><span className="icon-well"><Icon name="chart" /></span><h2 id="stats-state-title">{err ? 'A little interruption.' : !s ? 'Gathering the details.' : 'A space for your insights.'}</h2><p role={err ? 'alert' : 'status'}>{err || (!s ? 'Loading pipeline stats…' : 'Database not configured. Your pipeline insights will appear here once the backend database is connected.')}</p><a className="ui-button ui-button--secondary" href="#/">Back to conversation <Icon name="arrow" /></a></Surface></main>;
  const trend = s.trend ?? [];
  const max = Math.max(1, ...trend.map((t) => Number(t.avg_e2e_ms ?? 0)));
  const pts = trend.map((t, i) => `${(i / Math.max(1, trend.length - 1)) * 300},${78 - (Number(t.avg_e2e_ms ?? 0) / max) * 70}`).join(' ');
  const sum = s.summary;
  return (
    <main className="stats" id="main-content">
      {heading}
      <div className="kpis">
        <Surface><b>{ms(sum?.e2e_p50)}</b><span>median sign → voice</span></Surface>
        <Surface><b>{ms(sum?.e2e_p95)}</b><span>p95 sign → voice</span></Surface>
        <Surface><b>{ms(sum?.gloss_p50)}</b><span>Gemini median</span></Surface>
        <Surface><b>{ms(sum?.tts_p50)}</b><span>voice start median</span></Surface>
        <Surface><b>{sum?.utterances ?? 0}</b><span>sentences</span></Surface>
        <Surface><b>{sum?.fallback_rate == null ? '–' : `${Math.round(Number(sum.fallback_rate) * 100)}%`}</b><span>offline fallbacks</span></Surface>
      </div>
      <Surface className="trend-panel" aria-labelledby="trend-title"><div className="panel-heading"><div><p className="eyebrow">THE LAST 30 MINUTES</p><h2 id="trend-title">Finding the rhythm.</h2></div><span className="note">Sign-to-voice latency</span></div>
      {trend.length ? <svg viewBox="0 0 300 80" width="600" height="160" role="img" aria-label="Average sign-to-voice latency per minute, last 30 minutes">
        <polyline fill="none" stroke="var(--color-accent)" strokeWidth="2" points={pts} />
      </svg> : <p className="stats-empty">Latency trends will appear after the first conversation.</p>}
      <div className="chart-axis"><span>30 minutes ago</span><span>Now</span></div></Surface>
      <Surface aria-labelledby="sign-stats-title"><div className="panel-heading"><h2 id="sign-stats-title">Signs in focus</h2><span className="note">Lowest acceptance first</span></div><div className="table-scroll"><table>
        <thead><tr><th>sign</th><th>seen</th><th>avg confidence</th><th>accepted</th></tr></thead>
        <tbody>
          {(s.weakest_signs ?? []).map((w) => (
            <tr key={w.gloss}><td>{w.gloss}</td><td>{w.n}</td><td>{Number(w.avg_conf).toFixed(2)}</td><td>{Math.round(Number(w.accept_rate) * 100)}%</td></tr>
          ))}
        </tbody>
      </table></div>{!s.weakest_signs?.length && <p className="stats-empty">No signs recorded in the last 30 minutes.</p>}</Surface>
    </main>
  );
}
