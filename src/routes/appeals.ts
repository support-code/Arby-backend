import express, { Response } from 'express';
import { body, validationResult } from 'express-validator';
import { Appeal } from '../models/Appeal';
import { Case } from '../models/Case';
import { authenticate, AuthRequest } from '../middleware/auth';
import { canAccessCase } from '../middleware/permissions';
import { logAction } from '../utils/audit';
import { AppealType, AppealStatus, UserRole } from '../types';

const router = express.Router();

router.use(authenticate);

// Get all appeals for a case
router.get('/case/:caseId', canAccessCase, async (req: AuthRequest, res: Response) => {
  try {
    const { caseId } = req.params;
    const appeals = await Appeal.find({ caseId })
      .populate('submittedBy', 'name email')
      .populate('decisionId', 'title')
      .sort({ createdAt: -1 });
    
    res.json(appeals);
  } catch (error) {
    console.error('Fetch appeals error:', error);
    res.status(500).json({ error: 'Failed to fetch appeals' });
  }
});

// Get single appeal
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const appeal = await Appeal.findById(req.params.id)
      .populate('submittedBy', 'name email')
      .populate('decisionId', 'title')
      .populate('caseId', 'title');
    
    if (!appeal) {
      return res.status(404).json({ error: 'Appeal not found' });
    }

    // Check access to case
    const caseDoc = await Case.findById(appeal.caseId);
    if (!caseDoc) {
      return res.status(404).json({ error: 'Case not found' });
    }

    // Verify user has access to case
    const userId = req.user!.userId;
    const role = req.user!.role;
    
    if (role !== UserRole.ADMIN && 
        caseDoc.arbitratorId.toString() !== userId &&
        !caseDoc.lawyers.some(l => l.toString() === userId) &&
        !caseDoc.parties.some(p => p.toString() === userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(appeal);
  } catch (error) {
    console.error('Fetch appeal error:', error);
    res.status(500).json({ error: 'Failed to fetch appeal' });
  }
});

// Create appeal
router.post(
  '/',
  canAccessCase,
  [
    body('caseId').notEmpty(),
    body('type').isIn(Object.values(AppealType)),
    body('content').trim().notEmpty(),
    body('decisionId').optional()
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { caseId, type, content, decisionId } = req.body;
      const submittedBy = req.user!.userId;

      const appeal = await Appeal.create({
        caseId,
        type,
        content,
        decisionId: decisionId && decisionId.trim() !== '' ? decisionId : undefined,
        status: AppealStatus.PENDING,
        submittedBy
      });

      await logAction(
        submittedBy,
        'appeal_created',
        'appeal',
        appeal._id.toString(),
        { caseId, type },
        req
      );

      const populated = await Appeal.findById(appeal._id)
        .populate('submittedBy', 'name email')
        .populate('decisionId', 'title');

      res.status(201).json(populated);
    } catch (error) {
      console.error('Create appeal error:', error);
      res.status(500).json({ error: 'Failed to create appeal' });
    }
  }
);

// Respond to appeal (Arbitrator/Admin only)
router.patch(
  '/:id/respond',
  [
    body('status').isIn([AppealStatus.APPROVED, AppealStatus.REJECTED, AppealStatus.UNDER_REVIEW]),
    body('response').optional().trim()
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const appeal = await Appeal.findById(req.params.id);
      if (!appeal) {
        return res.status(404).json({ error: 'Appeal not found' });
      }

      // Check if user is arbitrator or admin
      const caseDoc = await Case.findById(appeal.caseId);
      if (!caseDoc) {
        return res.status(404).json({ error: 'Case not found' });
      }

      const userId = req.user!.userId;
      const role = req.user!.role;
      
      if (role !== UserRole.ADMIN && caseDoc.arbitratorId.toString() !== userId) {
        return res.status(403).json({ error: 'Only arbitrator can respond to appeals' });
      }

      const updates: any = {
        status: req.body.status,
        responseDate: new Date()
      };
      if (req.body.response) {
        updates.response = req.body.response;
      }

      const updated = await Appeal.findByIdAndUpdate(
        req.params.id,
        updates,
        { new: true }
      ).populate('submittedBy', 'name email')
       .populate('decisionId', 'title');

      await logAction(
        userId,
        'appeal_responded',
        'appeal',
        appeal._id.toString(),
        { status: req.body.status },
        req
      );

      res.json(updated);
    } catch (error) {
      console.error('Respond to appeal error:', error);
      res.status(500).json({ error: 'Failed to respond to appeal' });
    }
  }
);

export default router;

