import express, { Response } from 'express';
import { body, validationResult } from 'express-validator';
import { Task } from '../models/Task';
import { Case } from '../models/Case';
import { authenticate, AuthRequest } from '../middleware/auth';
import { canAccessCase } from '../middleware/permissions';
import { logAction } from '../utils/audit';
import { TaskStatus, TaskPriority, UserRole } from '../types';

const router = express.Router();

router.use(authenticate);

// Get all tasks for a case
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

    // Users see tasks assigned to them, arbitrator sees all
    const query: any = { caseId };
    if (!isArbitrator) {
      query.assignedTo = userId;
    }

    const tasks = await Task.find(query)
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });
    
    res.json(tasks);
  } catch (error) {
    console.error('Fetch tasks error:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// Get single task
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'name email')
      .populate('caseId', 'title');
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Check access
    const userId = req.user!.userId;
    const role = req.user!.role;
    const caseDoc = await Case.findById(task.caseId);
    
    if (!caseDoc) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const isArbitrator = role === UserRole.ADMIN || 
                         caseDoc.arbitratorId.toString() === userId;
    const isAssigned = task.assignedTo.toString() === userId;

    if (!isArbitrator && !isAssigned) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(task);
  } catch (error) {
    console.error('Fetch task error:', error);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

// Create task
router.post(
  '/',
  canAccessCase,
  [
    body('caseId').notEmpty(),
    body('title').trim().notEmpty(),
    body('description').optional().trim(),
    body('assignedTo').notEmpty(),
    body('dueDate').optional().isISO8601(),
    body('priority').optional().isIn(Object.values(TaskPriority)),
    body('status').optional().isIn(Object.values(TaskStatus))
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { caseId, title, description, assignedTo, dueDate, priority, status } = req.body;
      const createdBy = req.user!.userId;

      const task = await Task.create({
        caseId,
        title,
        description,
        assignedTo,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        priority: priority || TaskPriority.MEDIUM,
        status: status || TaskStatus.PENDING,
        createdBy
      });

      await logAction(
        createdBy,
        'task_created',
        'task',
        task._id.toString(),
        { caseId, title, assignedTo },
        req
      );

      const populated = await Task.findById(task._id)
        .populate('assignedTo', 'name email')
        .populate('createdBy', 'name email');

      res.status(201).json(populated);
    } catch (error) {
      console.error('Create task error:', error);
      res.status(500).json({ error: 'Failed to create task' });
    }
  }
);

// Update task
router.patch(
  '/:id',
  [
    body('title').optional().trim().notEmpty(),
    body('description').optional().trim(),
    body('assignedTo').optional(),
    body('dueDate').optional().isISO8601(),
    body('priority').optional().isIn(Object.values(TaskPriority)),
    body('status').optional().isIn(Object.values(TaskStatus))
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const task = await Task.findById(req.params.id);
      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }

      const userId = req.user!.userId;
      const role = req.user!.role;
      const caseDoc = await Case.findById(task.caseId);
      
      if (!caseDoc) {
        return res.status(404).json({ error: 'Case not found' });
      }

      const isArbitrator = role === UserRole.ADMIN || 
                           caseDoc.arbitratorId.toString() === userId;
      const isAssigned = task.assignedTo.toString() === userId;

      // Only assigned user or arbitrator can update
      if (!isArbitrator && !isAssigned) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const updates: any = {};
      if (req.body.title) updates.title = req.body.title;
      if (req.body.description !== undefined) updates.description = req.body.description;
      if (req.body.assignedTo) updates.assignedTo = req.body.assignedTo;
      if (req.body.dueDate) updates.dueDate = new Date(req.body.dueDate);
      if (req.body.priority) updates.priority = req.body.priority;
      if (req.body.status) {
        updates.status = req.body.status;
        if (req.body.status === TaskStatus.COMPLETED && !task.completedAt) {
          updates.completedAt = new Date();
        }
      }

      const updated = await Task.findByIdAndUpdate(
        req.params.id,
        updates,
        { new: true }
      ).populate('assignedTo', 'name email')
       .populate('createdBy', 'name email');

      await logAction(
        userId,
        'task_updated',
        'task',
        task._id.toString(),
        updates,
        req
      );

      res.json(updated);
    } catch (error) {
      console.error('Update task error:', error);
      res.status(500).json({ error: 'Failed to update task' });
    }
  }
);

export default router;

