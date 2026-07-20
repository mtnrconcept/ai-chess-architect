import assert from 'node:assert/strict';
import test from 'node:test';
import { assertConfirmedSupabaseTarget } from './supabase-target.mjs';

const projectRef = 'abcdefghijklmnopqrst';
const confirmedEnv = {
  SUPABASE_PROJECT_ID: projectRef,
  SUPABASE_PROJECT_REF_CONFIRMATION: projectRef,
};

test('accepts a direct database URL matching the confirmed project', () => {
  assert.equal(
    assertConfirmedSupabaseTarget({
      targetUrl: `postgresql://postgres:password@db.${projectRef}.supabase.co:5432/postgres`,
      label: 'test',
      env: confirmedEnv,
    }),
    projectRef,
  );
});

test('accepts a pooler URL whose username identifies the project', () => {
  assert.equal(
    assertConfirmedSupabaseTarget({
      targetUrl: `postgresql://postgres.${projectRef}:password@aws-0-region.pooler.supabase.com:6543/postgres`,
      label: 'test',
      env: confirmedEnv,
    }),
    projectRef,
  );
});

test('rejects a mismatched typed confirmation', () => {
  assert.throws(
    () =>
      assertConfirmedSupabaseTarget({
        targetUrl: `https://${projectRef}.supabase.co`,
        label: 'test',
        env: {
          ...confirmedEnv,
          SUPABASE_PROJECT_REF_CONFIRMATION:
            'uvwxyzabcdefghijklmn',
        },
      }),
    /doit correspondre exactement/,
  );
});

test('rejects a URL for another project', () => {
  assert.throws(
    () =>
      assertConfirmedSupabaseTarget({
        targetUrl:
          'https://uvwxyzabcdefghijklmn.supabase.co',
        label: 'test',
        env: confirmedEnv,
      }),
    /ne correspond pas au projet/,
  );
});

test('rejects a hostile hostname containing the confirmed reference', () => {
  assert.throws(
    () =>
      assertConfirmedSupabaseTarget({
        targetUrl: `https://${projectRef}.supabase.co.attacker.example`,
        label: 'test',
        env: confirmedEnv,
      }),
    /ne correspond pas au projet/,
  );
});

test('rejects a pooler username that only contains the reference', () => {
  assert.throws(
    () =>
      assertConfirmedSupabaseTarget({
        targetUrl: `postgresql://attacker-${projectRef}:password@aws-0-region.pooler.supabase.com:6543/postgres`,
        label: 'test',
        env: confirmedEnv,
      }),
    /ne correspond pas au projet/,
  );
});

test('rejects HTTP even when the project hostname matches', () => {
  assert.throws(
    () =>
      assertConfirmedSupabaseTarget({
        targetUrl: `http://${projectRef}.supabase.co`,
        label: 'test',
        env: confirmedEnv,
      }),
    /ne correspond pas au projet/,
  );
});

test('rejects credentials embedded in an HTTPS API URL', () => {
  assert.throws(
    () =>
      assertConfirmedSupabaseTarget({
        targetUrl: `https://user:secret@${projectRef}.supabase.co`,
        label: 'test',
        env: confirmedEnv,
      }),
    /ne correspond pas au projet/,
  );
});

test('rejects a non-Postgres protocol for a database hostname', () => {
  assert.throws(
    () =>
      assertConfirmedSupabaseTarget({
        targetUrl: `ftp://postgres:secret@db.${projectRef}.supabase.co/postgres`,
        label: 'test',
        env: confirmedEnv,
      }),
    /ne correspond pas au projet/,
  );
});

test('rejects an unexpected direct database username', () => {
  assert.throws(
    () =>
      assertConfirmedSupabaseTarget({
        targetUrl: `postgresql://postgres.${projectRef}:secret@db.${projectRef}.supabase.co/postgres`,
        label: 'test',
        env: confirmedEnv,
      }),
    /ne correspond pas au projet/,
  );
});
