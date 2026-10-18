import original from '../../../supabase/migrations/202610180001_personal_signs.sql?raw';
import migration from '../../../supabase/migrations/20261018162231_personal_signs_v2.sql?raw';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';
it('migrates real Postgres rows in place, enforces version/shape, norm, quota, immutability and RLS', async () => {
  const db = await PGlite.create();
  const alice = '00000000-0000-4000-8000-000000000001', bob = '00000000-0000-4000-8000-000000000002';
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to anon,authenticated; insert into auth.users values ('${alice}'),('${bob}');`);
    await db.exec(original);
    await db.exec(`insert into personal_sign_samples(user_id,label,features,frames_with_hand) values ('${alice}','HELLO',array_fill(.1::real,array[1260]),30)`);
    await db.exec(migration);
    expect((await db.query('select feature_version, cardinality(features) as n from personal_sign_samples')).rows).toEqual([{ feature_version: 'word-v1', n: 1260 }]);
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${alice}',false)`);
    const embedding = Array(192).fill(0); embedding[2] = 1;
    const insert = (version: string, x: number[], owner = alice) => db.query('insert into personal_sign_samples(user_id,label,feature_version,features,frames_with_hand,model_sha256) values ($1,$2,$3,$4,32,$5)', [owner,'BOOK',version,x,'a'.repeat(64)]);
    await insert('holistic_v2_emb192', embedding); await insert('holistic-v2', Array(5568).fill(.1));
    for (const [version,x] of [['holistic-v2',embedding], ['holistic_v2_emb192',Array(192).fill(.5)], ['word-v1',embedding], ['invalid',embedding], ['holistic-v2',Array(5568).fill(NaN)]] as [string,number[]][]) await expect(insert(version,x)).rejects.toThrow();
    await expect(insert('holistic_v2_emb192', embedding,bob)).rejects.toThrow('row-level security');
    await expect(db.exec("update personal_sign_samples set label='CHANGED'")).rejects.toThrow('permission denied');
    await db.exec(`select set_config('request.jwt.claim.sub','${bob}',false)`);
    expect((await db.query('select * from personal_sign_samples')).rows).toHaveLength(0);
    await db.exec(`select set_config('request.jwt.claim.sub','${alice}',false)`);
    await db.exec("insert into personal_sign_samples(label,features,frames_with_hand) select 'HELLO',array_fill(.1::real,array[1260]),30 from generate_series(1,497)");
    await expect(insert('holistic_v2_emb192', embedding)).rejects.toThrow('Sample limit');
    await db.exec('reset role; set role anon'); await expect(db.query('select * from personal_sign_samples')).rejects.toThrow('permission denied');
  } finally { await db.close(); }
}, 20000);
