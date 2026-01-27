import express, { Response } from 'express';
import { body, validationResult } from 'express-validator';
import { Hearing } from '../models/Hearing';
import { Case } from '../models/Case';
import { authenticate, AuthRequest } from '../middleware/auth';
import { canAccessCase } from '../middleware/permissions';
import { logAction } from '../utils/audit';
import { HearingType, HearingStatus, UserRole } from '../types';

const router = express.Router();

router.use(authenticate);

// Get all hearings for a case
router.get('/case/:caseId', canAccessCase, async (req: AuthRequest, res: Response) => {
  try {
    const { caseId } = req.params;
    const hearings = await Hearing.find({ caseId })
      .populate('participants', 'name email')
      .populate('createdBy', 'name email')
      .sort({ scheduledDate: 1 });
    
    res.json(hearings);
  } catch (error) {
    console.error('Fetch hearings error:', error);
    res.status(500).json({ error: 'Failed to fetch hearings' });
  }
});

// Get single hearing
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const hearing = await Hearing.findById(req.params.id)
      .populate('participants', 'name email')
      .populate('createdBy', 'name email')
      .populate('caseId', 'title');
    
    if (!hearing) {
      return res.status(404).json({ error: 'Hearing not found' });
    }

    // Check access to case
    const caseDoc = await Case.findById(hearing.caseId);
    if (!caseDoc) {
      return res.status(404).json({ error: 'Case not found' });
    }

    // Verify user has access to case
    const userId = req.user!.userId;
    const role = req.user!.role;
    
    if (role !== UserRole.ADMIN && 
        (caseDoc.arbitratorIds && Array.isArray(caseDoc.arbitratorIds) && caseDoc.arbitratorIds.some((arbId: any) => arbId.toString() === userId)) || ((caseDoc as any).arbitratorId && (caseDoc as any).arbitratorId.toString() === userId) !== userId &&
        !caseDoc.lawyers.some(l => l.toString() === userId) &&
        !caseDoc.parties.some(p => p.toString() === userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(hearing);
  } catch (error) {
    console.error('Fetch hearing error:', error);
    res.status(500).json({ error: 'Failed to fetch hearing' });
  }
});

// Create hearing
router.post(
  '/',
  canAccessCase,
  [
    body('caseId').notEmpty(),
    body('scheduledDate').isISO8601(),
    body('type').isIn(Object.values(HearingType)),
    body('duration').optional().isNumeric(),
    body('location').optional().trim(),
    body('participants').optional().isArray(),
    body('notes').optional().trim(),
    body('status').optional().isIn(Object.values(HearingStatus))
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { caseId, scheduledDate, duration, location, type, participants, notes, status } = req.body;
      const createdBy = req.user!.userId;

      const hearing = await Hearing.create({
        caseId,
        scheduledDate: new Date(scheduledDate),
        duration,
        location,
        type,
        participants: participants || [],
        notes,
        status: status || HearingStatus.CREATED,
        createdBy
      });

      await logAction(
        createdBy,
        'hearing_created',
        'hearing',
        hearing._id.toString(),
        { caseId, scheduledDate, type },
        req
      );

      const populated = await Hearing.findById(hearing._id)
        .populate('participants', 'name email')
        .populate('createdBy', 'name email');

      res.status(201).json(populated);
    } catch (error) {
      console.error('Create hearing error:', error);
      res.status(500).json({ error: 'Failed to create hearing' });
    }
  }
);

// Update hearing
router.patch(
  '/:id',
  [
    body('scheduledDate').optional().isISO8601(),
    body('duration').optional().isNumeric(),
    body('location').optional().trim(),
    body('type').optional().isIn(Object.values(HearingType)),
    body('participants').optional().isArray(),
    body('notes').optional().trim(),
    body('status').optional().isIn(Object.values(HearingStatus))
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const hearing = await Hearing.findById(req.params.id);
      if (!hearing) {
        return res.status(404).json({ error: 'Hearing not found' });
      }

      // Check if user is arbitrator or admin
      const caseDoc = await Case.findById(hearing.caseId);
      if (!caseDoc) {
        return res.status(404).json({ error: 'Case not found' });
      }

      const userId = req.user!.userId;
      const role = req.user!.role;
      
      if (role !== UserRole.ADMIN && (caseDoc.arbitratorIds && Array.isArray(caseDoc.arbitratorIds) && caseDoc.arbitratorIds.some((arbId: any) => arbId.toString() === userId)) || ((caseDoc as any).arbitratorId && (caseDoc as any).arbitratorId.toString() === userId) !== userId) {
        return res.status(403).json({ error: 'Only arbitrator can update hearings' });
      }

      const updates: any = {};
      if (req.body.scheduledDate) updates.scheduledDate = new Date(req.body.scheduledDate);
      if (req.body.duration !== undefined) updates.duration = req.body.duration;
      if (req.body.location !== undefined) updates.location = req.body.location;
      if (req.body.type) updates.type = req.body.type;
      if (req.body.participants) updates.participants = req.body.participants;
      if (req.body.notes !== undefined) updates.notes = req.body.notes;
      if (req.body.status) updates.status = req.body.status;

      const updated = await Hearing.findByIdAndUpdate(
        req.params.id,
        updates,
        { new: true }
      ).populate('participants', 'name email')
       .populate('createdBy', 'name email');

      await logAction(
        userId,
        'hearing_updated',
        'hearing',
        hearing._id.toString(),
        updates,
        req
      );

      res.json(updated);
    } catch (error) {
      console.error('Update hearing error:', error);
      res.status(500).json({ error: 'Failed to update hearing' });
    }
  }
);

export default router;

