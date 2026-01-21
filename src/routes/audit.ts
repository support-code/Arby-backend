import express, { Response } from 'express';
import { AuditLog } from '../models/AuditLog';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { UserRole } from '../types';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get audit logs (Admin only)
router.get(
  '/',
  authorize(UserRole.ADMIN),
  async (req: AuthRequest, res: Response) => {
    try {
      const { resource, resourceId, userId, limit = 100 } = req.query;

      const query: any = {};

      if (resource) {
        query.resource = resource;
      }

      if (resourceId) {
        query.resourceId = resourceId;
      }

      if (userId) {
        query.userId = userId;
      }

      const logs = await AuditLog.find(query)
        .populate('userId', 'name email role')
        .sort({ createdAt: -1 })
        .limit(Number(limit));

      res.json(logs);
    } catch (error) {
      console.error('Fetch audit logs error:', error);
      res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
  }
);

// Get audit logs for a specific case (Arbitrator, Admin, or case participants)
router.get(
  '/case/:caseId',
  async (req: AuthRequest, res: Response) => {
    try {
      const { caseId } = req.params;
      const role = req.user!.role;

      // Only admin and arbitrator can see all case logs
      // Others can only see their own actions
      const query: any = {
        resource: 'case',
        resourceId: caseId
      };

      if (role !== UserRole.ADMIN && role !== UserRole.ARBITRATOR) {
        query.userId = req.user!.userId;
      }

      const logs = await AuditLog.find(query)
        .populate('userId', 'name email role')
        .sort({ createdAt: -1 })
        .limit(100);

      res.json(logs);
    } catch (error) {
      console.error('Fetch case audit logs error:', error);
      res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
  }
);

export default router;

