import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { challenges, teamChallengeUnlocks, workspaceDeletions } from '@/lib/db/schema';
import { canSubmit, type EventStatus } from '@/lib/scoring/points';
import { WORKSPACES, type WorkspaceFile, type WorkspaceTool } from '@/lib/workspace/definitions';

export type WorkspaceState = {
  title: string;
  intro: string;
  readOnly: boolean;
  tool: WorkspaceTool | null;
  files: { key: string; kind: WorkspaceFile['kind'] }[];
  // The question this workspace can unlock, and whether this team has.
  unlock: { number: number; unlocked: boolean } | null;
};

// Every read is scoped to the signed-in team's id: one team's deletions never touch another's.
export async function getWorkspaceState(
  teamId: string,
  workspace: string,
): Promise<WorkspaceState> {
  const { files, title, intro, tool } = WORKSPACES[workspace];
  const deleted = await db
    .select({ key: workspaceDeletions.fileKey })
    .from(workspaceDeletions)
    .where(and(eq(workspaceDeletions.teamId, teamId), eq(workspaceDeletions.workspace, workspace)));
  const gone = new Set(deleted.map((row) => row.key));

  const number = files.find((file) => file.unlocksQuestion)?.unlocksQuestion ?? null;
  let unlocked = false;
  if (number !== null) {
    const [row] = await db
      .select({ teamId: teamChallengeUnlocks.teamId })
      .from(teamChallengeUnlocks)
      .innerJoin(challenges, eq(challenges.id, teamChallengeUnlocks.challengeId))
      .where(and(eq(teamChallengeUnlocks.teamId, teamId), eq(challenges.number, number)));
    unlocked = row !== undefined;
  }

  return {
    title,
    intro,
    readOnly: !files.some((file) => file.deletable),
    tool: tool ?? null,
    files: files.filter((file) => !gone.has(file.key)).map(({ key, kind }) => ({ key, kind })),
    unlock: number === null ? null : { number, unlocked },
  };
}

export async function isFileDeleted(teamId: string, workspace: string, key: string) {
  const [row] = await db
    .select({ key: workspaceDeletions.fileKey })
    .from(workspaceDeletions)
    .where(
      and(
        eq(workspaceDeletions.teamId, teamId),
        eq(workspaceDeletions.workspace, workspace),
        eq(workspaceDeletions.fileKey, key),
      ),
    );
  return row !== undefined;
}

// Records the deletion and any unlock in one transaction. ON CONFLICT makes a repeat, or two tabs
// racing, a no-op, so a team can only ever unlock once. No file on the server is touched.
export async function deleteWorkspaceFile(
  teamId: string,
  workspace: string,
  file: WorkspaceFile,
): Promise<'ok' | 'closed'> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${teamId}:${workspace}`}))`);

    // FOR SHARE: a status change waits for this commit.
    const [state] = await tx.execute<{
      status: EventStatus;
      submissions_open: boolean;
      full: boolean;
    }>(sql`SELECT status, submissions_open,
             (SELECT full_access FROM app.teams WHERE id = ${teamId}) AS full
           FROM app.event_state WHERE id = 1 FOR SHARE`);
    if (!state.full && !canSubmit(state.status, state.submissions_open)) return 'closed';

    await tx
      .insert(workspaceDeletions)
      .values({ teamId, workspace, fileKey: file.key })
      .onConflictDoNothing();

    if (file.unlocksQuestion) {
      const [target] = await tx
        .select({ id: challenges.id })
        .from(challenges)
        .where(eq(challenges.number, file.unlocksQuestion));
      if (target) {
        await tx
          .insert(teamChallengeUnlocks)
          .values({ teamId, challengeId: target.id, source: `${workspace}/${file.key}` })
          .onConflictDoNothing();
      }
    }
    return 'ok';
  });
}
