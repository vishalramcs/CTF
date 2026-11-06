// The key vault and the full-access tester, through real route handlers. Wipes the app tables.
import type postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as message } from '@/app/api/challenges/[number]/message/route';
import { GET as getChallenge } from '@/app/api/challenges/[number]/route';
import { POST as submit } from '@/app/api/challenges/[number]/submit/route';
import { encrypt } from '@/lib/crypto/aead';
import { db } from '@/lib/db/client';
import { wipeAppTables } from '@/lib/db/wipe';
import { env } from '@/lib/env';
import { listChallengeCards } from '@/lib/scoring/team-state';
import { getVault } from '@/lib/vault/state';
import { regenerateVariants } from '@/lib/variants/regenerate';
import {
  createChallenge,
  createTeam,
  flagOf,
  openSql,
  params,
  request,
  sessionFor,
  setStatus,
  type Auth,
  type TestChallenge,
} from './challenge-helpers';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));

let sql: postgres.Sql;
let team: string;
let auth: Auth;
let easy: TestChallenge[];
let hidden: TestChallenge;

const send = (number: number, flag: string, as: Auth = auth) =>
  submit(
    request(`/api/challenges/${number}/submit`, { method: 'POST', auth: as, body: { flag } }),
    params({ number: String(number) }),
  );

beforeAll(() => {
  sql = openSql();
});

beforeEach(async () => {
  await wipeAppTables(sql);
  team = await createTeam(sql, 'player');
  auth = await sessionFor(sql, 'player');
  easy = [await createChallenge(sql, 1), await createChallenge(sql, 2)];
  hidden = await createChallenge(sql, 3, { isPublished: false });
  await sql`INSERT INTO app.vault_keys (slot, value_enc)
    VALUES (1, ${encrypt(env.REVEAL_ENC_KEY, 'EASY-KEY')}), (2, ${encrypt(env.REVEAL_ENC_KEY, 'MEDIUM-KEY')})`;
});

afterAll(async () => {
  await sql.end();
});

describe('the key vault', () => {
  it('gives a tier key only after 2 flags, and never a key from another tier', async () => {
    await regenerateVariants(db, {});
    await setStatus(sql, 'running');

    await send(1, flagOf(team, easy[0]));
    let vault = await getVault(team);
    expect(vault.keys[0]).toMatchObject({ solved: 1, value: null });

    await send(2, flagOf(team, easy[1]));
    vault = await getVault(team);
    expect(vault.keys[0].value).toBe('EASY-KEY');
    expect(vault.keys[1].value).toBeNull();
  });

  it('shows the decoder only after release', async () => {
    expect((await getVault(team)).sealed).toBeNull();
    await sql`UPDATE app.event_state SET decoder_released = true`;
    expect((await getVault(team)).sealed).not.toBeNull();
  });
});

describe('a full-access team', () => {
  let testerId: string;
  let tester: Auth;

  beforeEach(async () => {
    testerId = await createTeam(sql, 'tester');
    await sql`UPDATE app.teams SET full_access = true, is_hidden = true WHERE id = ${testerId}`;
    tester = await sessionFor(sql, 'tester');
    await regenerateVariants(db, {});
  });

  it('sees and solves an unpublished question before the event starts', async () => {
    const cards = await listChallengeCards(testerId, 'not_started');
    expect(cards.map((c) => [c.number, c.state])).toEqual([
      [1, 'open'],
      [2, 'open'],
      [3, 'open'],
    ]);
    const res = await send(3, flagOf(testerId, hidden), tester);
    expect((await res.json()).result).toBe('correct');
  });

  it('changes nothing for an ordinary team', async () => {
    const cards = await listChallengeCards(team, 'not_started');
    expect(cards.map((c) => [c.number, c.state])).toEqual([
      [1, 'locked'],
      [2, 'locked'],
    ]);
    const res = await send(3, flagOf(team, hidden));
    expect(res.status).toBe(404);
    const view = await getChallenge(
      request('/api/challenges/3', { auth }),
      params({ number: '3' }),
    );
    expect(view.status).toBe(404);
  });
});

describe('the simulated contact', () => {
  beforeEach(async () => {
    await createChallenge(sql, 6, { generatorConfig: { workspace: 'q6-contact' } });
    await regenerateVariants(db, {});
    await setStatus(sql, 'running');
  });

  const say = async (to: string, text: string) => {
    const res = await message(
      request('/api/challenges/6/message', { method: 'POST', auth, body: { to, text } }),
      params({ number: '6' }),
    );
    return (await res.json()).reply;
  };

  it('answers only the right number with the right greeting', async () => {
    expect(await say('8462097315', 'good morning!')).toBe('The signal moved WEST.');
    expect(await say('2846073915', 'Good morning')).toBe('Who is this?');
    expect(await say('8462097315', 'hello')).toBe('Who is this?');
  });

  it('is not a tool on any other question', async () => {
    const res = await message(
      request('/api/challenges/1/message', { method: 'POST', auth, body: { to: '1', text: 'x' } }),
      params({ number: '1' }),
    );
    expect(res.status).toBe(404);
  });
});
