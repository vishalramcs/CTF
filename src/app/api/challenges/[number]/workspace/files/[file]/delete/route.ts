import { ApiError, json, withTeam } from '@/lib/http';
import { getChallengeView } from '@/lib/scoring/team-state';
import { findWorkspaceFile } from '@/lib/workspace/definitions';
import { deleteWorkspaceFile, getWorkspaceState } from '@/lib/workspace/state';

export const runtime = 'nodejs';

// Simulated: this records that the signed-in team deleted a listed file. Nothing on disk changes.
export const POST = withTeam<{ number: string; file: string }>(
  async (_req, session, { params }) => {
    const { number, file: key } = await params;
    const view = await getChallengeView(session.teamId, number);
    const workspace = view?.access === 'open' ? view.workspace : null;
    const file = workspace ? findWorkspaceFile(workspace, key) : undefined;
    if (!workspace || !file) throw new ApiError(404, 'not_found', 'No such file.');
    if (!file.deletable) throw new ApiError(403, 'read_only', 'This evidence file is protected.');

    const outcome = await deleteWorkspaceFile(session.teamId, workspace, file);
    if (outcome === 'closed') throw new ApiError(423, 'closed', 'Submissions are closed.');
    return json(await getWorkspaceState(session.teamId, workspace));
  },
);
