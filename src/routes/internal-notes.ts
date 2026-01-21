import express, { Response } from 'express';
import { body, validationResult } from 'express-validator';
import { InternalNote } from '../models/InternalNote';
import { Case } from '../models/Case';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { canAccessCase } from '../middleware/permissions';
import { logAction } from '../utils/audit';
import { UserRole } from '../types';

const router = express.Router();

router.use(authenticate);

// Get all internal notes for a case (Arbitrator/Admin only)
router.get('/case/:caseId', authorize(UserRole.ADMIN, UserRole.ARBITRATOR), canAccessCase, async (req: AuthRequest, res: Response) => {
  try {
    const { caseId } = req.params;
    const userId = req.user!.userId;
    const role = req.user!.role;

    // Verify user is arbitrator of this case
    const caseDoc = await Case.findById(caseId);
    if (!caseDoc) {
      return res.status(404).json({ error: 'Case not found' });
    }

    if (role !== UserRole.ADMIN && caseDoc.arbitratorId.toString() !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const notes = await InternalNote.find({ caseId })
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });
    
    res.json(notes);
  } catch (error) {
    console.error('Fetch internal notes error:', error);
    res.status(500).json({ error: 'Failed to fetch internal notes' });
  }
});

// Get single internal note
router.get('/:id', authorize(UserRole.ADMIN, UserRole.ARBITRATOR), async (req: AuthRequest, res: Response) => {
  try {
    const note = await InternalNote.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('caseId', 'title');
    
    if (!note) {
      return res.status(404).json({ error: 'Internal note not found' });
    }

    // Verify user is arbitrator of this case
    const caseDoc = await Case.findById(note.caseId);
    if (!caseDoc) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const userId = req.user!.userId;
    const role = req.user!.role;
    
    if (role !== UserRole.ADMIN && caseDoc.arbitratorId.toString() !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(note);
  } catch (error) {
    console.error('Fetch internal note error:', error);
    res.status(500).json({ error: 'Failed to fetch internal note' });
  }
});

// Create internal note (Arbitrator/Admin only)
router.post(
  '/',
  authorize(UserRole.ADMIN, UserRole.ARBITRATOR),
  canAccessCase,
  [
    body('caseId').notEmpty(),
    body('content').trim().notEmpty(),
    body('tags').optional().isArray()
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { caseId, content, tags } = req.body;
      const userId = req.user!.userId;

      // Verify user is arbitrator of this case
      const caseDoc = await Case.findById(caseId);
      if (!caseDoc) {
        return res.status(404).json({ error: 'Case not found' });
      }

      const role = req.user!.role;
      if (role !== UserRole.ADMIN && caseDoc.arbitratorId.toString() !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const note = await InternalNote.create({
        caseId,
        content,
        tags: tags || [],
        createdBy: userId
      });

      await logAction(
        userId,
        'internal_note_created',
        'internal_note',
        note._id.toString(),
        { caseId },
        req
      );

      const populated = await InternalNote.findById(note._id)
        .populate('createdBy', 'name email');

      res.status(201).json(populated);
    } catch (error) {
      console.error('Create internal note error:', error);
      res.status(500).json({ error: 'Failed to create internal note' });
    }
  }
);

// Update internal note
router.patch(
  '/:id',
  authorize(UserRole.ADMIN, UserRole.ARBITRATOR),
  [
    body('content').optional().trim().notEmpty(),
    body('tags').optional().isArray()
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const note = await InternalNote.findById(req.params.id);
      if (!note) {
        return res.status(404).json({ error: 'Internal note not found' });
      }

      // Verify user is arbitrator of this case
      const caseDoc = await Case.findById(note.caseId);
      if (!caseDoc) {
        return res.status(404).json({ error: 'Case not found' });
      }

      const userId = req.user!.userId;
      const role = req.user!.role;
      
      if (role !== UserRole.ADMIN && caseDoc.arbitratorId.toString() !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const updates: any = {};
      if (req.body.content) updates.content = req.body.content;
      if (req.body.tags) updates.tags = req.body.tags;

      const updated = await InternalNote.findByIdAndUpdate(
        req.params.id,
        updates,
        { new: true }
      ).populate('createdBy', 'name email');

      await logAction(
        userId,
        'internal_note_updated',
        'internal_note',
        note._id.toString(),
        updates,
        req
      );

      res.json(updated);
    } catch (error) {
      console.error('Update internal note error:', error);
      res.status(500).json({ error: 'Failed to update internal note' });
    }
  }
);

// Delete internal note
router.delete('/:id', authorize(UserRole.ADMIN, UserRole.ARBITRATOR), async (req: AuthRequest, res: Response) => {
  try {
    const note = await InternalNote.findById(req.params.id);
    if (!note) {
      return res.status(404).json({ error: 'Internal note not found' });
    }

    // Verify user is arbitrator of this case
    const caseDoc = await Case.findById(note.caseId);
    if (!caseDoc) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const userId = req.user!.userId;
    const role = req.user!.role;
    
    if (role !== UserRole.ADMIN && caseDoc.arbitratorId.toString() !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await InternalNote.findByIdAndDelete(req.params.id);

    await logAction(
      userId,
      'internal_note_deleted',
      'internal_note',
      note._id.toString(),
      { caseId: note.caseId.toString() },
      req
    );

    res.json({ message: 'Internal note deleted successfully' });
  } catch (error) {
    console.error('Delete internal note error:', error);
    res.status(500).json({ error: 'Failed to delete internal note' });
  }
});

export default router;

