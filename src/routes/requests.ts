import express, { Response } from 'express';
import { body, validationResult } from 'express-validator';
import { Request } from '../models/Request';
import { Case } from '../models/Case';
import { authenticate, AuthRequest } from '../middleware/auth';
import { canAccessCase } from '../middleware/permissions';
import { logAction } from '../utils/audit';
import { RequestType, RequestStatus, UserRole } from '../types';

const router = express.Router();

router.use(authenticate);

// Get all requests for a case
router.get('/case/:caseId', canAccessCase, async (req: AuthRequest, res: Response) => {
  try {
    const { caseId } = req.params;
    const requests = await Request.find({ caseId })
      .populate('submittedBy', 'name email')
      .populate('respondedBy', 'name email')
      .sort({ createdAt: -1 });
    
    res.json(requests);
  } catch (error) {
    console.error('Fetch requests error:', error);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// Get single request
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const request = await Request.findById(req.params.id)
      .populate('submittedBy', 'name email')
      .populate('respondedBy', 'name email')
      .populate('caseId', 'title');
    
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    // Check access to case
    const caseDoc = await Case.findById(request.caseId);
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

    res.json(request);
  } catch (error) {
    console.error('Fetch request error:', error);
    res.status(500).json({ error: 'Failed to fetch request' });
  }
});

// Create request
router.post(
  '/',
  canAccessCase,
  [
    body('caseId').notEmpty(),
    body('type').isIn(Object.values(RequestType)),
    body('title').trim().notEmpty(),
    body('content').trim().notEmpty()
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { caseId, type, title, content } = req.body;
      const submittedBy = req.user!.userId;

      const request = await Request.create({
        caseId,
        type,
        title,
        content,
        status: RequestStatus.PENDING,
        submittedBy
      });

      await logAction(
        submittedBy,
        'request_created',
        'request',
        request._id.toString(),
        { caseId, type, title },
        req
      );

      const populated = await Request.findById(request._id)
        .populate('submittedBy', 'name email');

      res.status(201).json(populated);
    } catch (error) {
      console.error('Create request error:', error);
      res.status(500).json({ error: 'Failed to create request' });
    }
  }
);

// Respond to request (Arbitrator/Admin only)
router.patch(
  '/:id/respond',
  [
    body('status').isIn([RequestStatus.APPROVED, RequestStatus.REJECTED, RequestStatus.UNDER_REVIEW]),
    body('response').optional().trim()
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const request = await Request.findById(req.params.id);
      if (!request) {
        return res.status(404).json({ error: 'Request not found' });
      }

      // Check if user is arbitrator or admin
      const caseDoc = await Case.findById(request.caseId);
      if (!caseDoc) {
        return res.status(404).json({ error: 'Case not found' });
      }

      const userId = req.user!.userId;
      const role = req.user!.role;
      
      if (role !== UserRole.ADMIN && caseDoc.arbitratorId.toString() !== userId) {
        return res.status(403).json({ error: 'Only arbitrator can respond to requests' });
      }

      const updates: any = {
        status: req.body.status,
        respondedBy: userId,
        responseDate: new Date()
      };
      if (req.body.response) {
        updates.response = req.body.response;
      }

      const updated = await Request.findByIdAndUpdate(
        req.params.id,
        updates,
        { new: true }
      ).populate('submittedBy', 'name email')
       .populate('respondedBy', 'name email');

      await logAction(
        userId,
        'request_responded',
        'request',
        request._id.toString(),
        { status: req.body.status },
        req
      );

      res.json(updated);
    } catch (error) {
      console.error('Respond to request error:', error);
      res.status(500).json({ error: 'Failed to respond to request' });
    }
  }
);

export default router;

