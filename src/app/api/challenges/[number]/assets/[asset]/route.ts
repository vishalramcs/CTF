import { ApiError, withTeam } from '@/lib/http';
import { getChallengeView } from '@/lib/scoring/team-state';

export const runtime = 'nodejs';

// shortcut: serves the text files stored on the variant. M8 adds generated binaries (EXIF images).
export const GET = withTeam<{ number: string; asset: string }>(
  async (_req, session, { params }) => {
    const { number, asset } = await params;
    const view = await getChallengeView(session.teamId, number);
    const file = view?.access === 'open' && view.files.find((f) => f.name === asset);
    if (!file) throw new ApiError(404, 'not_found', 'No such file.');

    return new Response(file.content, {
      headers: {
        'content-type': file.contentType ?? 'text/plain; charset=utf-8',
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  },
);
