import { sql } from 'drizzle-orm';
import { z } from 'zod';

import { toCsv } from '@/lib/admin/csv';
import { actor, NO_STORE, pgError, slugify } from '@/lib/admin/http';
import { listTeams, parseTeamNames, uniqueHandle } from '@/lib/admin/teams';
import { audit } from '@/lib/audit';
import { hashPassword } from '@/lib/auth/password';
import { teamPassword } from '@/lib/auth/team-credentials';
import { db } from '@/lib/db/client';
import { teams, users } from '@/lib/db/schema';
import { ApiError, json, parseBody, withAdmin } from '@/lib/http';
import { regenerateVariants } from '@/lib/variants/regenerate';
import { TemplateError } from '@/lib/variants/render';

export const runtime = 'nodejs';

const MAX_TEAMS = 100;
const body = z.object({ text: z.string().max(20_000) });

export const GET = withAdmin(async () => json({ teams: await listTeams() }));

export const POST = withAdmin(async (req, session) => {
  const { text } = await parseBody(req, body);
  const { names, errors } = parseTeamNames(text);
  if (errors.length > 0) throw new ApiError(400, 'bad_request', errors.join(' '));
  if (names.length === 0) throw new ApiError(400, 'bad_request', 'List at least one team.');
  if (names.length > MAX_TEAMS) {
    throw new ApiError(400, 'bad_request', `Create at most ${MAX_TEAMS} teams at a time.`);
  }

  // Hashed before the transaction (it holds the instance's only connection), one at a time to
  // keep Argon2's memory use flat.
  const passwords = names.map(teamPassword);
  const hashes: string[] = [];
  for (const password of passwords) hashes.push(await hashPassword(password));

  const created = await db
    .transaction(async (tx) => {
      const existing = await tx
        .select({ name: sql<string>`lower(${teams.name})`, slug: teams.slug })
        .from(teams);
      const existingUsers = await tx
        .select({ username: sql<string>`lower(${users.username})` })
        .from(users);
      const taken = new Set(existing.map((t) => t.name));
      const slugs = new Set(existing.map((t) => t.slug));
      const usernames = new Set(existingUsers.map((u) => u.username));

      for (const name of names) {
        if (taken.has(name.toLowerCase())) {
          throw new ApiError(409, 'conflict', `A team named "${name}" already exists.`);
        }
      }

      const rows = names.map((name, i) => {
        // The login username is the team name, so it must not collide with any other login.
        if (usernames.has(name.toLowerCase())) {
          throw new ApiError(409, 'conflict', `"${name}" is already a login name.`);
        }
        return {
          name,
          slug: uniqueHandle(slugify(name), slugs),
          username: name,
          password: passwords[i],
          passwordHash: hashes[i],
        };
      });

      const inserted = await tx
        .insert(teams)
        .values(rows.map(({ name, slug }) => ({ name, slug })))
        .returning({ id: teams.id, slug: teams.slug });
      const idBySlug = new Map(inserted.map((t) => [t.slug, t.id]));
      await tx.insert(users).values(
        rows.map(({ username, passwordHash, slug }) => ({
          username,
          passwordHash,
          role: 'team' as const,
          teamId: idBySlug.get(slug),
        })),
      );
      for (const { id } of inserted) await regenerateVariants(tx, { teamId: id });
      await audit(tx, {
        ...actor(req, session),
        action: 'team.create',
        entityType: 'team',
        details: {
          count: rows.length,
          teams: rows.map(({ name }) => ({ name })),
        },
      });
      return rows;
    })
    .catch((e) => {
      // Lost a race with another admin creating the same team.
      if (pgError(e).code === '23505') {
        throw new ApiError(409, 'conflict', 'A team in the list already exists.');
      }
      if (e instanceof TemplateError) throw new ApiError(422, 'bad_template', e.message);
      throw e;
    });

  const credentials = created.map(({ name, password }) => ({ team: name, password }));
  const csv = toCsv([['team', 'password'], ...credentials.map((c) => [c.team, c.password])]);
  // Shown once: the plaintext exists only in this response.
  return json({ credentials, csv }, { status: 201, headers: NO_STORE });
});
