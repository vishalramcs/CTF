import { loginRoute } from '@/lib/auth/login';

export const runtime = 'nodejs';

export const POST = loginRoute('admin');
