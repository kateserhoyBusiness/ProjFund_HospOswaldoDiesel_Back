import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { databaseConfigured, query } from './config/database.js';
import { errorResponse } from './shared/errors.js';
import { openApiDocument } from './openapi.js';

import experienceRoutes from './modules/experience/experience.js';
import feedbackRoutes from './modules/feedback/feedback.js';
import dashboardRoutes from './modules/dashboard/dashboard.routes.js';
import tvwallRoutes from './modules/tvwall/tvwall.routes.js';
import reportRoutes from './modules/report/report.js';
import adminRoutes from './modules/admin/admin.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
import jobsRoutes from './modules/jobs/jobs.routes.js';

export const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(',').map((item) => item.trim()),
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(
  rateLimit({
    windowMs: env.rateLimitWindowMs,
    max: env.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

app.get('/health', async (_req, res, next) => {
  try {
    if (databaseConfigured) {
      await query('SELECT 1');
    }
    res.json({ ok: true, service: 'sgep-backend', database: databaseConfigured ? 'connected' : 'not_configured' });
  } catch (error) {
    next(error);
  }
});

app.get('/docs', (_req, res) => {
  res.json(openApiDocument);
});

app.use('/api', authRoutes);
app.use('/api', experienceRoutes);
app.use('/api', feedbackRoutes);
app.use('/api', dashboardRoutes);
app.use('/api', tvwallRoutes);
app.use('/api', reportRoutes);
app.use('/api', adminRoutes);
app.use('/api', jobsRoutes);

app.use((error, _req, res, _next) => {
  const payload = errorResponse(error);
  const statusCode = error?.statusCode ?? error?.status ?? 500;
  res.status(statusCode).json(payload);
});

export default app;
