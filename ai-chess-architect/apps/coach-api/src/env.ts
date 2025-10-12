import 'dotenv/config';

export const ENV = {
  PORT: parseInt(process.env.PORT || '8787', 10),
  SUPABASE_URL: process.env.SUPABASE_URL!,
  SRK: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  ENGINE_DEPTH: parseInt(process.env.ENGINE_DEPTH || '20', 10),
  ENGINE_MULTIPV: parseInt(process.env.ENGINE_MULTIPV || '3', 10),
  ENGINE_THREADS: parseInt(process.env.ENGINE_THREADS || '4', 10)
};
