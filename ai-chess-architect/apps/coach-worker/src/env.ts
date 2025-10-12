import 'dotenv/config';

export const WENV = {
  ENGINE_DEPTH: parseInt(process.env.ENGINE_DEPTH || '20', 10),
  ENGINE_MULTIPV: parseInt(process.env.ENGINE_MULTIPV || '3', 10),
  ENGINE_THREADS: parseInt(process.env.ENGINE_THREADS || '4', 10)
};
