import { useEffect, useState } from 'react';
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
    const load = () => fetch('/api/stats').then((r) => r.json()).then((d: StatsT) => { setS(d); setErr(''); }).catch(() => setErr('Stats unavailable'));
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);
  if (err) return <p>{err}</p>;
  if (!s) return <p>Loading…</p>;
  if (!s.configured) return <p>Database not configured.</p>;
  const trend = s.trend ?? [];
  const max = Math.max(1, ...trend.map((t) => Number(t.avg_e2e_ms ?? 0)));
  const pts = trend.map((t, i) => `${(i / Math.max(1, trend.length - 1)) * 300},${78 - (Number(t.avg_e2e_ms ?? 0) / max) * 70}`).join(' ');
  const sum = s.summary;
  return (
    <main className="stats">
      <h2>Live pipeline stats — last 15 minutes (Tiger Data)</h2>
      <div className="kpis">
        <div><b>{ms(sum?.e2e_p50)}</b><span>median sign → voice</span></div>
        <div><b>{ms(sum?.e2e_p95)}</b><span>p95 sign → voice</span></div>
        <div><b>{ms(sum?.gloss_p50)}</b><span>Gemini median</span></div>
        <div><b>{ms(sum?.tts_p50)}</b><span>voice start median</span></div>
        <div><b>{sum?.utterances ?? 0}</b><span>sentences</span></div>
        <div><b>{sum?.fallback_rate == null ? '–' : `${Math.round(Number(sum.fallback_rate) * 100)}%`}</b><span>offline fallbacks</span></div>
      </div>
      <svg viewBox="0 0 300 80" width="600" height="160" role="img" aria-label="Average sign-to-voice latency per minute, last 30 minutes">
        <polyline fill="none" stroke="#5b2ea6" strokeWidth="2" points={pts} />
      </svg>
      <table>
        <thead><tr><th>sign</th><th>seen</th><th>avg confidence</th><th>accepted</th></tr></thead>
        <tbody>
          {(s.weakest_signs ?? []).map((w) => (
            <tr key={w.gloss}><td>{w.gloss}</td><td>{w.n}</td><td>{Number(w.avg_conf).toFixed(2)}</td><td>{Math.round(Number(w.accept_rate) * 100)}%</td></tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
