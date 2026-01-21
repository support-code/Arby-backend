import express, { Response } from 'express';
import { body, validationResult } from 'express-validator';
import { Reminder } from '../models/Reminder';
import { Case } from '../models/Case';
import { authenticate, AuthRequest } from '../middleware/auth';
import { canAccessCase } from '../middleware/permissions';
import { logAction } from '../utils/audit';
import { UserRole } from '../types';

const router = express.Router();

router.use(authenticate);

// Get all reminders for a case
router.get('/case/:caseId', canAccessCase, async (req: AuthRequest, res: Response) => {
  try {
    const { caseId } = req.params;
    const userId = req.user!.userId;
    const role = req.user!.role;

    // Get case to check if user is arbitrator
    const caseDoc = await Case.findById(caseId);
    if (!caseDoc) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const isArbitrator = role === UserRole.ADMIN || 
                         caseDoc.arbitratorId.toString() === userId;

    // Users see reminders assigned to them, arbitrator sees all
    const query: any = { caseId };
    if (!isArbitrator) {
      query.assignedTo = userId;
    }

    const reminders = await Reminder.find(query)
      .populate('assignedTo', 'name email')
      .sort({ dueDate: 1 });
    
    res.json(reminders);
  } catch (error) {
    console.error('Fetch reminders error:', error);
    res.status(500).json({ error: 'Failed to fetch reminders' });
  }
});

// Get single reminder
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const reminder = await Reminder.findById(req.params.id)
      .populate('assignedTo', 'name email')
      .populate('caseId', 'title');
    
    if (!reminder) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    // Check access to case
    const caseDoc = await Case.findById(reminder.caseId);
    if (!caseDoc) {
      return res.status(404).json({ error: 'Case not found' });
    }

    // Verify user has access to case
    const userId = req.user!.userId;
    const role = req.user!.role;
    
    if (role !== UserRole.ADMIN && 
        caseDoc.arbitratorId.toString() !== userId &&
        reminder.assignedTo.toString() !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(reminder);
  } catch (error) {
    console.error('Fetch reminder error:', error);
    res.status(500).json({ error: 'Failed to fetch reminder' });
  }
});

// Create reminder (Arbitrator/Admin only)
router.post(
  '/',
  canAccessCase,
  [
    body('caseId').notEmpty(),
    body('title').trim().notEmpty(),
    body('dueDate').isISO8601(),
    body('assignedTo').notEmpty()
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { caseId, title, dueDate, assignedTo } = req.body;
      const createdBy = req.user!.userId;
      const role = req.user!.role;

      // Only arbitrator and admin can create reminders
      const caseDoc = await Case.findById(caseId);
      if (!caseDoc) {
        return res.status(404).json({ error: 'Case not found' });
      }

      if (role !== UserRole.ADMIN && caseDoc.arbitratorId.toString() !== createdBy) {
        return res.status(403).json({ error: 'Only arbitrator can create reminders' });
      }

      const reminder = await Reminder.create({
        caseId,
        title,
        dueDate: new Date(dueDate),
        assignedTo,
        isCompleted: false
      });

      await logAction(
        createdBy,
        'reminder_created',
        'reminder',
        reminder._id.toString(),
        { caseId, title, dueDate },
        req
      );

      const populated = await Reminder.findById(reminder._id)
        .populate('assignedTo', 'name email');

      res.status(201).json(populated);
    } catch (error) {
      console.error('Create reminder error:', error);
      res.status(500).json({ error: 'Failed to create reminder' });
    }
  }
);

// Update reminder
router.patch(
  '/:id',
  [
    body('title').optional().trim().notEmpty(),
    body('dueDate').optional().isISO8601(),
    body('isCompleted').optional().isBoolean()
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const reminder = await Reminder.findById(req.params.id);
      if (!reminder) {
        return res.status(404).json({ error: 'Reminder not found' });
      }

      // Check access
      const caseDoc = await Case.findById(reminder.caseId);
      if (!caseDoc) {
        return res.status(404).json({ error: 'Case not found' });
      }

      const userId = req.user!.userId;
      const role = req.user!.role;
      
      const isArbitrator = role === UserRole.ADMIN || 
                           caseDoc.arbitratorId.toString() === userId;
      const isAssigned = reminder.assignedTo.toString() === userId;

      if (!isArbitrator && !isAssigned) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const updates = req.body;
      delete updates._id;
      delete updates.caseId;
      delete updates.createdAt;

      if (updates.dueDate) {
        updates.dueDate = new Date(updates.dueDate);
      }

      if (updates.isCompleted === true && !reminder.isCompleted) {
        updates.completedAt = new Date();
      } else if (updates.isCompleted === false) {
        updates.completedAt = undefined;
      }

      const updated = await Reminder.findByIdAndUpdate(
        req.params.id,
        { $set: updates },
        { new: true }
      )
        .populate('assignedTo', 'name email');

      await logAction(
        userId,
        'reminder_updated',
        'reminder',
        req.params.id,
        updates,
        req
      );

      res.json(updated);
    } catch (error) {
      console.error('Update reminder error:', error);
      res.status(500).json({ error: 'Failed to update reminder' });
    }
  }
);

// Delete reminder (Arbitrator/Admin only)
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const reminder = await Reminder.findById(req.params.id);
    if (!reminder) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    // Check if user is arbitrator or admin
    const caseDoc = await Case.findById(reminder.caseId);
    if (!caseDoc) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const userId = req.user!.userId;
    const role = req.user!.role;
    
    if (role !== UserRole.ADMIN && caseDoc.arbitratorId.toString() !== userId) {
      return res.status(403).json({ error: 'Only arbitrator can delete reminders' });
    }

    await Reminder.findByIdAndDelete(req.params.id);

    await logAction(
      userId,
      'reminder_deleted',
      'reminder',
      req.params.id,
      {},
      req
    );

    res.json({ message: 'Reminder deleted successfully' });
  } catch (error) {
    console.error('Delete reminder error:', error);
    res.status(500).json({ error: 'Failed to delete reminder' });
  }
});

export default router;

