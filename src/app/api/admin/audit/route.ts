import { auditFiltersFrom, listAudit } from '@/lib/admin/audit-log';
import { toCsv } from '@/lib/admin/csv';
import { ApiError, json, withAdmin } from '@/lib/http';

export const runtime = 'nodejs';

const PAGE_SIZE = 100;
// shortcut: exports the newest 10000 rows, far more than a 75-minute event writes.
const CSV_LIMIT = 10_000;

export const GET = withAdmin(async (req) => {
  const { format, ...query } = Object.fromEntries(req.nextUrl.searchParams);
  const filters = auditFiltersFrom(query);
  if (!filters.success) throw new ApiError(400, 'bad_request', 'Check the filters and try again.');

  if (format !== 'csv') return json({ entries: await listAudit(filters.data, PAGE_SIZE) });

  const rows = await listAudit(filters.data, CSV_LIMIT);
  const csv = toCsv([
    ['time', 'actor', 'action', 'entity_type', 'entity_id', 'details', 'ip'],
    ...rows.map((r) => [
      r.createdAt.toISOString(),
      r.actor ?? '',
      r.action,
      r.entityType,
      r.entityId ?? '',
      JSON.stringify(r.details),
      r.ip ?? '',
    ]),
  ]);
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="audit-log.csv"',
      'cache-control': 'no-store',
    },
  });
});
