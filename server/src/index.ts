import express from 'express';
import cors from 'cors';
import { config } from './config';
import { authRouter } from './routes/auth';
import { teamsRouter } from './routes/teams';
import { playersRouter } from './routes/players';
import { syncRouter } from './routes/sync';
import { rulesRouter } from './routes/rules';
import { challengeRouter } from './routes/challenge';
import { substitutionsRouter } from './routes/substitutions';
import { activitiesRouter } from './routes/activities';
import { scoresRouter } from './routes/scores';
import { exportRouter } from './routes/export';

const app = express();

// Middleware
app.use(cors({
  origin: [
    'https://madras-walkathon.web.app',
    'https://madras-walkathon.firebaseapp.com',
    'http://localhost:5173',
    'http://localhost:8080',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// Test POST endpoint
app.post('/api/test-post', (_req, res) => {
  res.json({ ok: true, body: _req.body });
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    app: 'Madras Walkathon API',
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use('/api/auth', authRouter);
app.use('/api/teams', teamsRouter);
app.use('/api/players', playersRouter);
app.use('/api/sync', syncRouter);
app.use('/api/rules', rulesRouter);
app.use('/api/challenge', challengeRouter);
app.use('/api/substitutions', substitutionsRouter);
app.use('/api/activities', activitiesRouter);
app.use('/api/scores', scoresRouter);
app.use('/api/export', exportRouter);

// Start server
app.listen(config.port, () => {
  console.log(`🏃 Madras Walkathon API running on port ${config.port}`);
  console.log(`   Environment: ${config.nodeEnv}`);
});

// Global error handler — prevents server crash
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error('❌ Unhandled error:', err.message || err);
  res.status(500).json({ error: 'Internal server error' });
});

// Catch unhandled promise rejections — log but don't crash
process.on('unhandledRejection', (reason: any) => {
  console.error('⚠️ Unhandled Promise Rejection:', reason?.message || reason);
});

// Catch uncaught exceptions — log but don't crash
process.on('uncaughtException', (err: any) => {
  console.error('⚠️ Uncaught Exception:', err.message || err);
});

export default app;
