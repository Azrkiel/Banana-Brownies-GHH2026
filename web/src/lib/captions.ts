import type { Caption } from './types';

export function upsertCaption(list: Caption[], c: Caption): Caption[] {
  const i = list.findIndex((x) => x.id === c.id);
  if (i === -1) return [...list, c].slice(-50);
  const next = list.slice();
  next[i] = c;
  return next;
}
