import express from 'express';
import cors from 'cors';
import path from 'path';
import { prisma } from './prisma';

import customers from './routes/customers';
import employees from './routes/employees';
import orders from './routes/orders';
import sites from './routes/sites';
import assignments from './routes/assignments';
import workEntries from './routes/workEntries';
import invoices from './routes/invoices';
import reports from './routes/reports';
import settings from './routes/settings';
import timesheets from './routes/timesheets';

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3001;
const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';

app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '2mb' }));

// Serve static assets (logo) for the timesheet header in the frontend:
app.use('/assets', express.static(path.join(process.cwd(), 'assets')));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.use('/api/customers', customers);
app.use('/api/employees', employees);
app.use('/api/orders', orders);
app.use('/api/sites', sites);
app.use('/api/assignments', assignments);
app.use('/api/work-entries', workEntries);
app.use('/api/invoices', invoices);
app.use('/api/reports', reports);
app.use('/api/settings', settings);

// NEW
app.use('/api/timesheets', timesheets);

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error('Unhandled error', err);
  res.status(500).json({ message: 'Interner Serverfehler.' });
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

app.listen(port, () => {
  console.log(`Backend listening on :${port}`);
});
