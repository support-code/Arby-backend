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

// Get PORT from environment variable (required for production)
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;

// Validate PORT
if (isNaN(PORT) || PORT < 1 || PORT > 65535) {
  console.error('❌ Invalid PORT value. Must be a number between 1 and 65535');
  process.exit(1);
}

// Warn if using default PORT in production
if (process.env.NODE_ENV === 'production' && !process.env.PORT) {
  console.warn('⚠️  WARNING: Using default PORT (5000) in production. Set PORT environment variable.');
}

// Middleware
// CORS configuration - allow multiple origins for production
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'https://starfish-app-37wqp.ondigitalocean.app',
  'https://starfish-app-37wqp.ondigitalocean.app/'
].filter(Boolean); // Remove undefined values

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // In production, be more strict
      if (process.env.NODE_ENV === 'production') {
        console.warn(`⚠️  Blocked CORS request from: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      } else {
        // In development, allow all
        callback(null, true);
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
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
      console.log(`🚀 Server running on port ${PORT} (from ${process.env.PORT ? 'environment variable' : 'default'})`);
      console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

