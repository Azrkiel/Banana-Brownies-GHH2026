import { getSupabase } from './supabase';
import { MAX_PERSONAL_SAMPLES, PERSONAL_FEATURE_VERSION, signLabel, validateWordSample, type PersonalSample, type WordSample } from './personalModel';

function client() {
  const result = getSupabase();
  if (!result) throw new Error('Account services are not configured yet.');
  return result;
}
type Row = { id: string; user_id: string; label: string; features: number[]; frames_with_hand: number; feature_version: string; created_at: string };
function parseSample(row: Row, userId: string): PersonalSample {
  if (row.user_id !== userId || row.feature_version !== PERSONAL_FEATURE_VERSION || typeof row.id !== 'string' ||
      typeof row.label !== 'string' || typeof row.created_at !== 'string') throw new Error('Unsupported training data.');
  const sample = { id: row.id, label: signLabel(row.label), features: row.features, framesWithHand: row.frames_with_hand, createdAt: row.created_at };
  validateWordSample(sample);
  return sample;
}

export async function loadPersonalSamples(userId: string, signal: AbortSignal): Promise<PersonalSample[]> {
  const { data, error, count } = await client().from('personal_sign_samples')
    .select('id,user_id,label,features,frames_with_hand,feature_version,created_at', { count: 'exact' })
    .eq('user_id', userId).order('created_at').order('id').limit(MAX_PERSONAL_SAMPLES + 1).abortSignal(signal);
  signal.throwIfAborted();
  if (error) throw new Error('Could not load your examples. Check the connection and try again.');
  if (count === null || data.length !== count || count > MAX_PERSONAL_SAMPLES) throw new Error('Could not load your complete dataset. Check the database row limit.');
  return (data as Row[]).map(row => parseSample(row, userId));
}

export async function savePersonalSample(userId: string, label: string, sample: WordSample, signal: AbortSignal, id: string): Promise<PersonalSample> {
  validateWordSample(sample);
  const { data, error } = await client().from('personal_sign_samples').insert({
    id, user_id: userId, label: signLabel(label), feature_version: PERSONAL_FEATURE_VERSION,
    features: sample.features.map(x => Math.round(x * 100000) / 100000), frames_with_hand: sample.framesWithHand,
  }).select('id,user_id,label,features,frames_with_hand,feature_version,created_at').abortSignal(signal).single();
  signal.throwIfAborted();
  if (error) {
    // Retrying after a lost response must not create a duplicate training example.
    const existing = await client().from('personal_sign_samples')
      .select('id,user_id,label,features,frames_with_hand,feature_version,created_at')
      .eq('id', id).eq('user_id', userId).abortSignal(signal).single();
    signal.throwIfAborted();
    if (!existing.error) {
      const previous = parseSample(existing.data as Row, userId);
      if (previous.label === signLabel(label) && previous.framesWithHand === sample.framesWithHand &&
          previous.features.every((x, i) => Math.abs(x - sample.features[i]) < 0.00002)) return previous;
    }
  }
  if (error) throw new Error('Could not save this example. Check your connection and the 500-example limit, then retry.');
  return parseSample(data as Row, userId);
}

export async function deletePersonalSamples(userId: string, ids: string[], signal: AbortSignal, label: string | null): Promise<void> {
  if (!ids.length) return;
  // Filter by owner/label rather than putting hundreds of UUIDs in an oversized URL.
  let query = client().from('personal_sign_samples').delete().eq('user_id', userId);
  if (label !== null) query = query.eq('label', signLabel(label));
  const { data, error } = await query.select('id').abortSignal(signal);
  signal.throwIfAborted();
  if (error || !ids.every(id => data.some(row => row.id === id))) throw new Error('Could not delete all selected examples. Reload your examples and retry.');
}
