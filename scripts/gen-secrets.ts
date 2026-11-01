// Prints a filled .env.local block. Paste the Supabase values from the dashboard.
import { randomBytes } from 'node:crypto';

const secret = () => randomBytes(32).toString('base64');

console.log(`# --- Supabase (dashboard: Connect, and Project Settings > API Keys) ---
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
DIRECT_DATABASE_URL=

# --- App secrets ---
SESSION_PEPPER=${secret()}
FLAG_HMAC_KEY=${secret()}
VARIANT_HMAC_KEY=${secret()}
COORD_HMAC_KEY=${secret()}
REVEAL_ENC_KEY=${secret()}
CSRF_SECRET=${secret()}

# --- Event config ---
FLAG_PREFIX=EYE
EVENT_TIMEZONE=Asia/Kolkata
MAX_SESSIONS_PER_TEAM=2
REALTIME_CHANNEL_PREFIX=spidey

# --- Argon2id ---
ARGON2_MEMORY_KIB=19456
ARGON2_TIME_COST=2
ARGON2_PARALLELISM=1

# --- Seed and tests only (never used at runtime) ---
SEED_ADMIN_USERNAME=admin
SEED_ADMIN_PASSWORD=${randomBytes(18).toString('base64url')}
WIPEABLE_DB_REF=`);
