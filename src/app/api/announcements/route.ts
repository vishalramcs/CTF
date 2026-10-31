import { json, withTeam } from '@/lib/http';
import { listAnnouncements } from '@/lib/participant/announcements';

export const runtime = 'nodejs';

export const GET = withTeam(async () => json({ announcements: await listAnnouncements() }));
