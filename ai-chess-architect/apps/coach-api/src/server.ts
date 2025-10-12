import express from 'express';
import cors from 'cors';
import { buildRoutes } from './routes.js';
import { ENV } from './env.js';
import { Pool } from 'pg';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const db = new Pool({ connectionString: process.env.DATABASE_URL });
app.use(buildRoutes(db));

app.get('/health', (_, res) => res.send('ok'));

app.listen(ENV.PORT, () => console.log(`coach-api listening :${ENV.PORT}`));
