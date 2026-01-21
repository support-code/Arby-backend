import express, { Response } from 'express';
import { body, validationResult } from 'express-validator';
import { Comment } from '../models/Comment';
import { Case } from '../models/Case';
import { authenticate, AuthRequest } from '../middleware/auth';
import { canAccessCase } from '../middleware/permissions';
import { logAction } from '../utils/audit';
import { UserRole } from '../types';

const router = express.Router();

router.use(authenticate);

// Get all comments for a case
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

    // Filter out internal comments if user is not arbitrator
    const query: any = { caseId };
    if (!isArbitrator) {
      query.isInternal = false;
    }

    const comments = await Comment.find(query)
      .populate('createdBy', 'name email')
      .populate('documentId', 'originalName')
      .populate('parentId')
      .sort({ createdAt: -1 });
    
    res.json(comments);
  } catch (error) {
    console.error('Fetch comments error:', error);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// Get comments for a specific document
router.get('/document/:documentId', async (req: AuthRequest, res: Response) => {
  try {
    const { documentId } = req.params;
    const userId = req.user!.userId;
    const role = req.user!.role;

    // Get comment to find case
    const comment = await Comment.findOne({ documentId });
    if (!comment) {
      return res.json([]);
    }

    // Check access to case
    const caseDoc = await Case.findById(comment.caseId);
    if (!caseDoc) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const isArbitrator = role === UserRole.ADMIN || 
                         caseDoc.arbitratorId.toString() === userId;

    const query: any = { documentId };
    if (!isArbitrator) {
      query.isInternal = false;
    }

    const comments = await Comment.find(query)
      .populate('createdBy', 'name email')
      .populate('parentId')
      .sort({ createdAt: -1 });
    
    res.json(comments);
  } catch (error) {
    console.error('Fetch document comments error:', error);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// Create comment
router.post(
  '/',
  [
    body('caseId').notEmpty(),
    body('content').trim().notEmpty(),
    body('documentId').optional(),
    body('parentId').optional(),
    body('isInternal').optional().isBoolean()
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { caseId, content, documentId, parentId, isInternal } = req.body;
      const userId = req.user!.userId;
      const role = req.user!.role;

      // Check access to case
      const caseDoc = await Case.findById(caseId);
      if (!caseDoc) {
        return res.status(404).json({ error: 'Case not found' });
      }

      // Only arbitrator/admin can create internal comments
      const internal = isInternal === true && 
                       (role === UserRole.ADMIN || caseDoc.arbitratorId.toString() === userId);

      const comment = await Comment.create({
        caseId,
        content,
        documentId,
        parentId,
        isInternal: internal || false,
        createdBy: userId
      });

      await logAction(
        userId,
        'comment_created',
        'comment',
        comment._id.toString(),
        { caseId, isInternal: internal },
        req
      );

      const populated = await Comment.findById(comment._id)
        .populate('createdBy', 'name email')
        .populate('documentId', 'originalName')
        .populate('parentId');

      res.status(201).json(populated);
    } catch (error) {
      console.error('Create comment error:', error);
      res.status(500).json({ error: 'Failed to create comment' });
    }
  }
);

// Delete comment
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const userId = req.user!.userId;
    const role = req.user!.role;

    // Check if user can delete (creator or arbitrator/admin)
    const caseDoc = await Case.findById(comment.caseId);
    if (!caseDoc) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const canDelete = comment.createdBy.toString() === userId ||
                      role === UserRole.ADMIN ||
                      caseDoc.arbitratorId.toString() === userId;

    if (!canDelete) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await Comment.findByIdAndDelete(req.params.id);

    await logAction(
      userId,
      'comment_deleted',
      'comment',
      comment._id.toString(),
      { caseId: comment.caseId.toString() },
      req
    );

    res.json({ message: 'Comment deleted successfully' });
  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

export default router;

