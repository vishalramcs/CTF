import { Field } from '@/components/admin/fields';
import { PageTitle, panelClass, tableClass, tdClass, thClass } from '@/components/admin/page-title';
import { inputClass } from '@/components/admin/ui';
import { auditFiltersFrom, listAudit } from '@/lib/admin/audit-log';
import { formatTime } from '@/lib/admin/shared';
import { requireAdmin } from '@/lib/auth/guards';
import { env } from '@/lib/env';

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAdmin();
  const query = await searchParams;
  const filters = auditFiltersFrom(query);
  const rows = filters.success ? await listAudit(filters.data, 100) : [];

  return (
    <>
      <PageTitle>Audit log</PageTitle>
      <form method="get" className={`${panelClass} grid gap-4 space-y-0 sm:grid-cols-4`}>
        <Field label="Actor">
          <input name="actor" defaultValue={query.actor} className={inputClass} />
        </Field>
        <Field label="Action starts with">
          <input name="action" defaultValue={query.action} className={inputClass} />
        </Field>
        <Field label="From">
          <input
            name="from"
            type="datetime-local"
            defaultValue={query.from}
            className={inputClass}
          />
        </Field>
        <Field label="To">
          <input name="to" type="datetime-local" defaultValue={query.to} className={inputClass} />
        </Field>
        <button
          type="submit"
          className="h-11 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground sm:h-9 sm:w-24"
        >
          Filter
        </button>
      </form>
      {!filters.success && (
        <p role="alert" className="text-sm text-destructive">
          Check the filters and try again.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>Time</th>
              <th className={thClass}>Actor</th>
              <th className={thClass}>Action</th>
              <th className={thClass}>Entity</th>
              <th className={thClass}>Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className={`${tdClass} whitespace-nowrap`}>
                  {formatTime(row.createdAt, env.EVENT_TIMEZONE)}
                </td>
                <td className={tdClass}>{row.actor ?? '—'}</td>
                <td className={`${tdClass} font-mono`}>{row.action}</td>
                <td className={`${tdClass} break-all`}>
                  {row.entityType} {row.entityId ?? ''}
                </td>
                <td className={`${tdClass} font-mono break-all`}>{JSON.stringify(row.details)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && filters.success && (
          <p className="text-sm text-muted-foreground">No entries.</p>
        )}
      </div>
      <a
        href="/api/admin/audit?format=csv"
        className="inline-flex h-11 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring sm:h-8"
      >
        Download CSV
      </a>
    </>
  );
}
