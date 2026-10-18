import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../lib/auth';
import { Badge, Button, PageHeader, Surface } from '../components/ui';
import { BirdScene } from '../components/BirdScene';
import { loadPersonalSamples, savePersonalSample, deletePersonalSamples } from '../lib/personalSigns';
import { MAX_PERSONAL_SAMPLES, MIN_SIGN_EXAMPLES, signLabel, trainPersonalModel, validateWordSample, type PersonalSample, type WordSample } from '../lib/personalModel';
import { useSignCapture } from '../lib/useSignCapture';
import { loadWordForest, predictSharedAndPersonal, sharedAndPersonalLabels } from '../lib/wordRecognition';
import type { WordForest, WordPrediction } from '../lib/wordModel';
import './PersonalSigns.css';

export default function PersonalSigns() {
  const auth = useAuth();
  const [working, setWorking] = useState(false);
  return <main className="personal-page" id="main-content">
    <PageHeader title="My signs" accessory={auth.user ? <Button disabled={working} onClick={async () => {
      setWorking(true); try { await auth.signOut(); } finally { setWorking(false); }
    }}>Sign out</Button> : <Badge>Personal vocabulary</Badge>} />
    {auth.error && <p className="error-banner" role="alert">{auth.error}</p>}
    {auth.loading ? <p role="status">Checking your account…</p> : !auth.user ? <Surface className="account-welcome">
      <BirdScene scene="nest" className="account-bird" />
      <div><h2>Signs that feel like you.</h2>
        <p>Make an account with GitHub and teach SignLine your own small vocabulary. Your examples belong to your account.</p>
        <p>Save a few examples of each sign, try a fresh capture, then use your personal model in calls.</p>
        <Button variant="primary" disabled={!auth.configured || working} onClick={async () => {
          setWorking(true); try { await auth.signIn(); } finally { setWorking(false); }
        }}>Sign in with GitHub</Button>
        {!auth.configured && <p role="status">Account sign-in is being set up. Calls and local recording are still available.</p>}
        <p className="note">GitHub creates your account on your first sign-in. We do not request access to your repositories.</p>
        <a href="#/conversation">Continue to calls</a>
      </div>
    </Surface> : <TrainingWorkspace key={auth.user.id} userId={auth.user.id} name={typeof auth.user.user_metadata.user_name === 'string' ? auth.user.user_metadata.user_name : 'your account'} />}
  </main>;
}

type Pending = WordSample & { id: string; label: string };
function TrainingWorkspace({ userId, name }: { userId: string; name: string }) {
  const [samples, setSamples] = useState<PersonalSample[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [label, setLabel] = useState('HELLO');
  const [consent, setConsent] = useState(false);
  const [camera, setCamera] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [pending, setPending] = useState<Pending | null>(null);
  const [prediction, setPrediction] = useState<WordPrediction | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [shared, setShared] = useState<WordForest | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const stopCamera = useCallback(() => { generation.current++; setCamera(false); setCapturing(false); setPending(null); setPrediction(null); }, []);
  const { video, engine, ready, error: cameraError } = useSignCapture(camera && consent, stopCamera);
  const counts = useMemo(() => {
    const result = new Map<string, number>();
    for (const sample of samples) result.set(sample.label, (result.get(sample.label) ?? 0) + 1);
    return [...result].sort(([a], [b]) => a.localeCompare(b));
  }, [samples]);
  const trained = useMemo(() => {
    try { return { model: trainPersonalModel(samples, 1), reason: '' }; }
    catch (cause) { return { model: null, reason: cause instanceof Error ? cause.message : 'Add more examples.' }; }
  }, [samples]);

  useEffect(() => {
    // Tests mirror calls: your signs first, then the shared words. Without it, only your signs are tried.
    const controller = new AbortController();
    loadWordForest(controller.signal).then(setShared, () => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    void refresh(controller.signal);
    return () => {
      // This is a monotonically increasing operation counter, not a DOM ref.
      // oxlint-disable-next-line react-hooks/exhaustive-deps
      generation.current++; controller.abort();
    };
  // A different account remounts this workspace and disposes all private state.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function refresh(signal = lifetime.current!.signal) {
    setLoading(true); setError(''); setLoaded(false);
    try { const result = await loadPersonalSamples(userId, signal); if (!signal.aborted) { setSamples(result); setLoaded(true); } }
    catch (cause) { if (!signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load examples.'); }
    finally { if (!signal.aborted) setLoading(false); }
  }

  async function capture(test: boolean) {
    if (!engine.current || capturing || saving || !loaded || !consent) return;
    let captureLabel: string;
    try { captureLabel = signLabel(label); } catch (cause) { setError((cause as Error).message); return; }
    const attempt = generation.current;
    setCapturing(true); setProgress(0); setPending(null); setPrediction(null); setError(''); setMessage('Sign now, over about one second.');
    try {
      const sample = await engine.current.capture(frames => { if (attempt === generation.current) setProgress(frames); });
      if (attempt !== generation.current) return;
      validateWordSample(sample);
      if (test) {
        if (!trained.model) return;
        setPrediction(predictSharedAndPersonal(shared, trained.model, sample));
        setMessage('Test capture only. This example was not saved or used for training.');
      } else {
        setPending({ ...sample, id: crypto.randomUUID(), label: captureLabel });
        setMessage(`Captured ${captureLabel}. Save it if that was the sign you intended, or discard it and try again.`);
      }
    } catch (cause) {
      if (attempt === generation.current) setError(cause instanceof Error ? cause.message : 'Capture failed. Try again.');
    } finally { if (attempt === generation.current) setCapturing(false); }
  }

  async function save() {
    if (!pending || saving || !consent) return;
    const captured = pending;
    const signal = lifetime.current!.signal;
    setSaving(true); setError('');
    try {
      const sample = await savePersonalSample(userId, captured.label, captured, signal, captured.id);
      if (signal.aborted) return;
      setSamples(current => [...current.filter(x => x.id !== sample.id), sample]); setPending(null);
      setMessage(`Saved an example of ${sample.label} to your account.`);
    } catch (cause) { if (!signal.aborted) setError(cause instanceof Error ? cause.message : 'Save failed. Retry this example.'); }
    finally { if (!signal.aborted) setSaving(false); }
  }

  async function remove(value: string) {
    if (saving) return;
    const signal = lifetime.current!.signal;
    const ids = samples.filter(sample => value === '*' || sample.label === value).map(sample => sample.id);
    setSaving(true); setError(''); setPrediction(null); setConfirmDelete(null);
    try {
      await deletePersonalSamples(userId, ids, signal, value === '*' ? null : value);
      if (signal.aborted) return;
      setSamples(current => current.filter(x => !ids.includes(x.id)));
      setMessage(value === '*' ? 'All your training examples have been deleted.' : `Deleted your examples of ${value}.`);
    } catch (cause) { if (!signal.aborted) { setError(cause instanceof Error ? cause.message : 'Delete failed.'); setLoaded(false); } }
    finally { if (!signal.aborted) setSaving(false); }
  }

  const busy = capturing || saving;
  return <>
    <p className="personal-intro">Signed in as <strong>{name}</strong>. Teach one-handed, isolated signs in your own small vocabulary. Recognition can make mistakes; always review a suggestion.</p>
    <div className="personal-layout">
      <div>
        <Surface aria-labelledby="teach-title">
          <h2 id="teach-title">Teach a sign</h2>
          <p>Save at least {MIN_SIGN_EXAMPLES} varied examples of each sign. Your signs are added to the shared words. Keep the same hand and framing when using your model.</p>
          <label className="field">Sign name<input value={label} maxLength={40} disabled={busy || Boolean(pending)} onChange={event => { setLabel(event.target.value); setPrediction(null); }} /></label>
          <label className="check-field"><input type="checkbox" checked={consent} disabled={saving} onChange={event => { stopCamera(); setConsent(event.target.checked); }} /><span>I agree to save my hand landmarks to my private account for personal recognition. No video or audio is uploaded.</span></label>
          <div className="personal-camera">
            <video ref={video} muted playsInline className="mirror" aria-label="Training camera preview" />
            {!camera && <div className="personal-camera-placeholder"><BirdScene scene="nest" /><span>Camera off</span></div>}
          </div>
          <div className="button-row">
            <Button disabled={!consent || saving} onClick={() => { if (camera) stopCamera(); else setCamera(true); }}>{camera ? 'Stop camera' : 'Start camera'}</Button>
            <Button variant="primary" disabled={!ready || busy || !loaded || Boolean(pending) || samples.length >= MAX_PERSONAL_SAMPLES} onClick={() => void capture(false)}>{capturing ? 'Capturing…' : 'Capture example'}</Button>
          </div>
          {camera && !ready && !cameraError && <p role="status">Starting camera and hand model…</p>}
          {cameraError && <p className="error-banner" role="alert">{cameraError}</p>}
          {capturing && <progress aria-label="Capture progress" max={30} value={progress} />}
          {pending && <div className="sample-review"><h3>Save {pending.label}?</h3><p>Only save this example if your intended sign was captured correctly.</p><div className="button-row">
            <Button variant="primary" disabled={saving || !consent} onClick={() => void save()}>{saving ? 'Saving…' : `Save ${pending.label}`}</Button>
            <Button disabled={saving} onClick={() => { setPending(null); setMessage('Example discarded.'); }}>Discard example</Button>
          </div></div>}
          <p role="status">{message}</p>
        </Surface>
      </div>
      <div className="personal-sidebar">
        <Surface aria-labelledby="examples-title"><div className="panel-heading"><h2 id="examples-title">Your examples</h2><Badge>{samples.length} / {MAX_PERSONAL_SAMPLES}</Badge></div>
          <p>Your saved landmarks are private to this account. They are not added to the shared model. Deleting a sign removes its examples from your personal model.</p>
          {loading ? <p role="status">Loading your examples…</p> : <>
            {!samples.length && loaded && <p>No examples yet. Start with HELLO and a second sign you use.</p>}
            <ul className="personal-labels">{counts.map(([value, count]) => <li key={value}>
              <div><strong>{value}</strong><span>{count} examples · {count < MIN_SIGN_EXAMPLES ? `${MIN_SIGN_EXAMPLES - count} more needed` : 'Ready'}</span></div>
              <Button variant="ghost" size="small" disabled={busy || !loaded || Boolean(pending)} onClick={() => setConfirmDelete(value)}>Delete {value}</Button>
            </li>)}</ul>
            <div className="button-row"><Button disabled={busy || Boolean(pending)} onClick={() => void refresh()}>Reload examples</Button>
              <Button variant="danger" disabled={!samples.length || busy || !loaded || Boolean(pending)} onClick={() => setConfirmDelete('*')}>Delete all examples</Button></div>
          </>}
          {confirmDelete && <div className="sample-review"><p>{confirmDelete === '*' ? 'Delete all your saved training examples?' : `Delete every example of ${confirmDelete}?`} This cannot be undone.</p><div className="button-row"><Button variant="danger" disabled={busy} onClick={() => void remove(confirmDelete)}>Confirm deletion</Button><Button disabled={busy} onClick={() => setConfirmDelete(null)}>Cancel</Button></div></div>}
          {error && <p className="error-banner" role="alert">{error}</p>}
        </Surface>
        <Surface className="personal-model-test" aria-labelledby="try-title"><h2 id="try-title">Try your model</h2>
          <p>{trained.model ? `Ready for ${trained.model.labels.length} of your signs${shared ? ` plus the shared words` : ''}: ${sharedAndPersonalLabels(shared, trained.model).join(', ')}. It rebuilds when your examples change.` : trained.reason}</p>
          <Button disabled={!ready || !trained.model || !loaded || busy || Boolean(pending)} onClick={() => void capture(true)}>Test a fresh sign</Button>
          {prediction && <div className="sample-review" role="status">{prediction.accepted ? <><h3>{prediction.label}</h3><p>{trained.model?.labels.includes(prediction.label) ? 'One of your signs.' : 'A shared word.'} Does this match your sign? This is a suggestion, not a measured accuracy result.</p></> : <p>No confident match. Try different examples or keep using typed captions.</p>}</div>}
          <p className="note">Fresh tests stay on this device. In a call, choose Shared words + my signs under Your trained signs. Suggestions are never sent automatically.</p>
          <a href="#/conversation">Go to calls</a>
        </Surface>
      </div>
    </div>
  </>;
}
