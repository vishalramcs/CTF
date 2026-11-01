import { ApiError, json, withTeam } from '@/lib/http';
import { getChallengeView } from '@/lib/scoring/team-state';

export const runtime = 'nodejs';

export const GET = withTeam<{ number: string }>(async (_req, session, { params }) => {
  const view = await getChallengeView(session.teamId, (await params).number);
  if (!view) throw new ApiError(404, 'not_found', 'No such challenge.');
  if (view.access !== 'open') {
    throw new ApiError(
      423,
      view.access,
      view.access === 'locked'
        ? 'This trail opens with the Main CTF.'
        : view.access === 'sealed'
          ? 'This trail is sealed.'
          : 'The event has closed.',
    );
  }
  // Inspect surfaces belong to the page, and files have their own route.
  return json({ ...view, surfaces: undefined, files: view.files.map((file) => file.name) });
});
