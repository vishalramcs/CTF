'use client';

import { useState } from 'react';

import { Notice } from '@/components/admin/fields';
import {
  panelClass,
  SectionTitle,
  tableClass,
  tdClass,
  thClass,
} from '@/components/admin/page-title';
import { actionClass, ConfirmModal, ErrorText } from '@/components/admin/ui';
import { useAction } from '@/components/admin/use-action';
import { Button } from '@/components/ui/button';
import { DIFFICULTIES, formatTime, type Difficulty } from '@/lib/admin/shared';
import type { SolveOrder } from '@/lib/admin/coordinates';

// Solve order and points per team for each question, and the audited per-question reset.
export function SolvesPanel({ questions, timeZone }: { questions: SolveOrder; timeZone: string }) {
  const { run, error } = useAction();
  const [target, setTarget] = useState<SolveOrder[number]>();

  return (
    <>
      <ErrorText>{error}</ErrorText>
      {questions.map((q) => (
        <section key={q.id} className={panelClass}>
          <SectionTitle>
            #{q.number} {q.title}
          </SectionTitle>
          <p className="text-sm text-muted-foreground">
            {DIFFICULTIES[q.difficulty as Difficulty].label} · base {q.basePoints} ·{' '}
            {q.isPublished ? 'published' : 'hidden'} · {q.solves.length} solves
          </p>
          {q.solves.length > 0 && (
            <div className="overflow-x-auto">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={thClass}>Position</th>
                    <th className={thClass}>Team</th>
                    <th className={thClass}>Points</th>
                    <th className={thClass}>Solved</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {q.solves.map((s) => (
                    <tr key={s.position}>
                      <td className={tdClass}>{s.position}</td>
                      <td className={tdClass}>{s.team}</td>
                      <td className={tdClass}>{s.points}</td>
                      <td className={tdClass}>{formatTime(s.at, timeZone)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Button
            variant="destructive"
            className={actionClass}
            disabled={q.solves.length === 0}
            onClick={() => setTarget(q)}
          >
            Reset solves
          </Button>
        </section>
      ))}
      {target && (
        <ConfirmModal
          title={`Reset #${target.number}`}
          word="RESET"
          label="Reset solves"
          onClose={() => setTarget(undefined)}
          onConfirm={async () => {
            const result = await run('POST', `/api/admin/challenges/${target.id}/reset-solves`, {
              confirm: 'RESET',
            });
            if (result.ok) setTarget(undefined);
            return result.ok ? undefined : result.message;
          }}
        >
          <Notice tone="warn">
            Deletes every team&apos;s solve of this question and the points they earned from it.
            Attempt history stays. The action is written to the audit log.
          </Notice>
        </ConfirmModal>
      )}
    </>
  );
}
