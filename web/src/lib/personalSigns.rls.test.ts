import migration from '../../../supabase/migrations/202610180001_personal_signs.sql?raw';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const ALICE = '00000000-0000-4000-8000-000000000001';
const BOB = '00000000-0000-4000-8000-000000000002';
let db: PGlite;

async function asUser(id: string, role = 'authenticated') {
  await db.exec(`reset role; set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
}
async function insert(userId = ALICE, features = Array(1260).fill(0.1)) {
  return db.query('insert into public.personal_sign_samples(user_id,label,features,frames_with_hand) values ($1,$2,$3,30) returning id', [userId, 'HELLO', features]);
}

describe('personal sample migration and actual Postgres row security', () => {
  beforeAll(async () => {
    db = await PGlite.create();
    // Supabase supplies these roles/auth objects in production. Only the test harness creates them.
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      grant usage on schema auth to anon, authenticated;
      insert into auth.users values ('${ALICE}'),('${BOB}');`);
    await db.exec(migration);
  }, 15000);
  beforeEach(async () => { await db.exec('reset role; delete from public.personal_sign_samples'); await asUser(ALICE); });
  afterAll(async () => { await db?.close(); });

  it('allows an owner to insert, read and delete their own examples', async () => {
    await insert();
    expect((await db.query('select label from public.personal_sign_samples')).rows).toEqual([{ label: 'HELLO' }]);
    expect((await db.query('delete from public.personal_sign_samples returning id')).rows).toHaveLength(1);
  });
  it('keeps saved examples immutable even for their owner', async () => {
    await insert();
    await expect(db.query("update public.personal_sign_samples set label = 'WRONG'")).rejects.toThrow('permission denied');
    expect((await db.query('select label from public.personal_sign_samples')).rows).toEqual([{ label: 'HELLO' }]);
  });
  it('prevents a second account from reading, deleting or reassigning another account’s examples', async () => {
    await insert(); await asUser(BOB);
    expect((await db.query('select * from public.personal_sign_samples')).rows).toHaveLength(0);
    expect((await db.query('delete from public.personal_sign_samples returning id')).rows).toHaveLength(0);
    await expect(db.query(`update public.personal_sign_samples set user_id = '${BOB}'`)).rejects.toThrow('permission denied');
    await expect(insert(ALICE)).rejects.toThrow('row-level security');
    await insert(BOB); await asUser(ALICE);
    expect((await db.query('select user_id from public.personal_sign_samples')).rows).toEqual([{ user_id: ALICE }]);
  });
  it('denies anonymous access and authenticated requests without a user identity', async () => {
    await insert(); await asUser('', 'anon');
    await expect(db.query('select * from public.personal_sign_samples')).rejects.toThrow('permission denied');
    await expect(insert()).rejects.toThrow('permission denied');
    await asUser('');
    expect((await db.query('select * from public.personal_sign_samples')).rows).toHaveLength(0);
    await expect(insert()).rejects.toThrow('row-level security');
  });
  it('rejects malformed feature arrays, missing hands, nonfinite numbers, and unsupported versions', async () => {
    for (const features of [[0.1], Array(1260).fill(null), Array(1260).fill(3), Array(1260).fill('NaN'), Array(1260).fill('Infinity')]) {
      await expect(insert(ALICE, features)).rejects.toThrow();
    }
    await expect(db.query("insert into public.personal_sign_samples(label,features,frames_with_hand) values ('HELLO',array_fill(0.1::real,array[1260]),23)")).rejects.toThrow();
    await expect(db.query("insert into public.personal_sign_samples(label,features,frames_with_hand,feature_version) values ('HELLO',array_fill(0.1::real,array[1260]),30,'wrong')")).rejects.toThrow();
  });
  it('enforces the account quota in SQL while leaving another account’s allowance independent', async () => {
    await db.exec("insert into public.personal_sign_samples(label,features,frames_with_hand) select 'HELLO',array_fill(0.1::real,array[1260]),30 from generate_series(1,500)");
    await expect(insert()).rejects.toThrow('Sample limit');
    await asUser(BOB); await insert(BOB);
    expect((await db.query('select id from public.personal_sign_samples')).rows).toHaveLength(1);
  }, 15000);
  it('deletes a user’s data when their auth account is removed', async () => {
    await insert(); await db.exec(`reset role; delete from auth.users where id = '${ALICE}'`);
    expect((await db.query('select id from public.personal_sign_samples')).rows).toHaveLength(0);
    await db.query('insert into auth.users values ($1)', [ALICE]);
  });
});
