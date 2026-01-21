import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './config/database';

// Routes
import authRoutes from './routes/auth';
import invitationsRoutes from './routes/invitations';
import casesRoutes from './routes/cases';
import documentsRoutes from './routes/documents';
import usersRoutes from './routes/users';
import auditRoutes from './routes/audit';
import decisionsRoutes from './routes/decisions';
import requestsRoutes from './routes/requests';
import commentsRoutes from './routes/comments';
import tasksRoutes from './routes/tasks';
import hearingsRoutes from './routes/hearings';
import appealsRoutes from './routes/appeals';
import internalNotesRoutes from './routes/internal-notes';
import documentVersionsRoutes from './routes/document-versions';
import expensesRoutes from './routes/expenses';
import remindersRoutes from './routes/reminders';
import relatedCasesRoutes from './routes/related-cases';
import discussionSessionsRoutes from './routes/discussion-sessions';
import protocolsRoutes from './routes/protocols';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/invitations', invitationsRoutes);
app.use('/api/cases', casesRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/decisions', decisionsRoutes);
app.use('/api/requests', requestsRoutes);
app.use('/api/comments', commentsRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/hearings', hearingsRoutes);
app.use('/api/appeals', appealsRoutes);
app.use('/api/internal-notes', internalNotesRoutes);
app.use('/api/document-versions', documentVersionsRoutes);
app.use('/api/expenses', expensesRoutes);
app.use('/api/reminders', remindersRoutes);
app.use('/api/related-cases', relatedCasesRoutes);
app.use('/api/discussion-sessions', discussionSessionsRoutes);
app.use('/api/protocols', protocolsRoutes);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
const startServer = async () => {
  try {
    await connectDB();
    
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

