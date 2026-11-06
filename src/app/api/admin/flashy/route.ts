import { z } from 'zod';

import { actor } from '@/lib/admin/http';
import { isSafeAssetUrl } from '@/lib/admin/shared';
import { loadFlashyAdmin, saveSettings } from '@/lib/flashy/admin';
import { json, parseBody, withAdmin } from '@/lib/http';

export const runtime = 'nodejs';

const option = z.string().trim().min(1).max(20);
const body = z
  .object({
    videoUrl: z
      .string()
      .trim()
      .max(500)
      .refine(isSafeAssetUrl, 'Use an https:// address or a /path.')
      .nullable(),
    videoSeconds: z.number().int().min(5).max(600),
    bonusPoints: z.number().min(0).max(1000).multipleOf(0.01),
    correct: option,
    wrong: z.array(option).length(3),
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0)
  .refine((b) => (b.correct === undefined) === (b.wrong === undefined), {
    message: 'Send the correct option and the three others together.',
  })
  .refine(
    (b) =>
      b.correct === undefined ||
      new Set([b.correct, ...(b.wrong ?? [])].map((o) => o.trim().toLowerCase())).size === 4,
    { message: 'The four options must all be different.' },
  );

export const GET = withAdmin(async () =>
  json(await loadFlashyAdmin(), { headers: { 'cache-control': 'no-store' } }),
);

export const PATCH = withAdmin(async (req, session) => {
  const input = await parseBody(req, body);
  await saveSettings(input, actor(req, session));
  return json({ ok: true });
});
