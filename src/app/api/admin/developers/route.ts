import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { actor, pgError } from '@/lib/admin/http';
import { audit } from '@/lib/audit';
import { hashPassword } from '@/lib/auth/password';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { ApiError, json, parseBody, withSuperAdmin } from '@/lib/http';

export const runtime = 'nodejs';

const body = z.object({
  username: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{1,63}$/),
  password: z.string().min(12).max(256),
});

export const GET = withSuperAdmin(async () =>
  json({
    developers: await db
      .select({ id: users.id, username: users.username, createdAt: users.createdAt })
      .from(users)
      .where(
        and(eq(users.role, 'admin'), eq(users.adminLevel, 'developer'), eq(users.isActive, true)),
      )
      .orderBy(users.username),
  }),
);

export const POST = withSuperAdmin(async (req, session) => {
  const { username, password } = await parseBody(req, body);
  const passwordHash = await hashPassword(password);

  const id = await db
    .transaction(async (tx) => {
      const [row] = await tx
        .insert(users)
        .values({ username, passwordHash, role: 'admin', adminLevel: 'developer' })
        .returning({ id: users.id });
      await audit(tx, {
        ...actor(req, session),
        action: 'developer.add',
        entityType: 'user',
        entityId: row.id,
        details: { username },
      });
      return row.id;
    })
    .catch((e) => {
      if (pgError(e).code === '23505')
        throw new ApiError(409, 'conflict', 'That username is taken.');
      throw e;
    });

  return json({ id }, { status: 201 });
});
