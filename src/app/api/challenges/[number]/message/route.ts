import { z } from 'zod';

import { ApiError, json, parseBody, withTeam } from '@/lib/http';
import { getChallengeView } from '@/lib/scoring/team-state';

export const runtime = 'nodejs';

const bodySchema = z.object({ to: z.string().max(40), text: z.string().max(200) });

// Lives only in this route, so the number never reaches a browser bundle.
const CONTACT = '7391528460';
const GREETING = /^good morning[\s.!]*$/i;
const REPLY = 'The signal moved WEST.';
const DEFAULT_REPLY = 'Who is this?';

// Q6's simulated messaging tool. Nothing is sent anywhere.
export const POST = withTeam<{ number: string }>(async (req, session, { params }) => {
  const { to, text } = await parseBody(req, bodySchema);
  const view = await getChallengeView(session.teamId, (await params).number);
  if (view?.access !== 'open' || view.workspace !== 'q6-contact') {
    throw new ApiError(404, 'not_found', 'No such tool.');
  }
  const answered = to.replace(/\D/g, '') === CONTACT && GREETING.test(text.trim());
  return json({ reply: answered ? REPLY : DEFAULT_REPLY });
});
