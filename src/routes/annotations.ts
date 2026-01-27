import express, { Response } from 'express';
import { body, validationResult } from 'express-validator';
import { Annotation } from '../models/Annotation';
import { Request } from '../models/Request';
import { Case } from '../models/Case';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { canAccessCase } from '../middleware/permissions';
import { logAction } from '../utils/audit';
import { UserRole, AnnotationType } from '../types';

const router = express.Router();

router.use(authenticate);
router.use(authorize(UserRole.ADMIN, UserRole.ARBITRATOR)); // Only arbitrators and admins can annotate

// Get all annotations for a request
router.get('/request/:requestId', async (req: AuthRequest, res: Response) => {
  try {
    const { requestId } = req.params;

    const request = await Request.findById(requestId);
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
    
    // Check if user is arbitrator (check arbitratorIds array)
    const isArbitrator = caseDoc.arbitratorIds && Array.isArray(caseDoc.arbitratorIds) && 
      caseDoc.arbitratorIds.some((arbId: any) => arbId.toString() === userId);
    // Legacy support
    const isLegacyArbitrator = (caseDoc as any).arbitratorId && (caseDoc as any).arbitratorId.toString() === userId;
    
    if (role !== UserRole.ADMIN && 
        !isArbitrator && !isLegacyArbitrator &&
        !caseDoc.lawyers.some(l => l.toString() === userId) &&
        !caseDoc.parties.some(p => p.toString() === userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const annotations = await Annotation.find({
      requestId,
      isDeleted: { $ne: true }
    })
      .populate('createdBy', 'name email')
      .sort({ timestamp: 1 });

    res.json(annotations);
  } catch (error) {
    console.error('Fetch annotations error:', error);
    res.status(500).json({ error: 'Failed to fetch annotations' });
  }
});

// Get annotations for a specific document in a request
router.get('/request/:requestId/document/:documentId', async (req: AuthRequest, res: Response) => {
  try {
    const { requestId, documentId } = req.params;

    const request = await Request.findById(requestId);
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
    
    // Check if user is arbitrator (check arbitratorIds array)
    const isArbitrator = caseDoc.arbitratorIds && Array.isArray(caseDoc.arbitratorIds) && 
      caseDoc.arbitratorIds.some((arbId: any) => arbId.toString() === userId);
    // Legacy support
    const isLegacyArbitrator = (caseDoc as any).arbitratorId && (caseDoc as any).arbitratorId.toString() === userId;
    
    if (role !== UserRole.ADMIN && 
        !isArbitrator && !isLegacyArbitrator &&
        !caseDoc.lawyers.some(l => l.toString() === userId) &&
        !caseDoc.parties.some(p => p.toString() === userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const annotations = await Annotation.find({
      requestId,
      documentId,
      isDeleted: { $ne: true }
    })
      .populate('createdBy', 'name email')
      .sort({ pageNumber: 1, timestamp: 1 });

    res.json(annotations);
  } catch (error) {
    console.error('Fetch document annotations error:', error);
    res.status(500).json({ error: 'Failed to fetch document annotations' });
  }
});

// Create annotation
router.post(
  '/',
  [
    body('requestId').notEmpty(),
    body('documentId').notEmpty(),
    body('pageNumber').isInt({ min: 1 }),
    body('type').isIn(Object.values(AnnotationType)),
    body('x').isFloat({ min: 0, max: 1 }),
    body('y').isFloat({ min: 0, max: 1 }),
    body('width').isFloat({ min: 0, max: 1 }),
    body('height').isFloat({ min: 0, max: 1 }),
    body('color').optional().isString(),
    body('content').optional().trim()
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { requestId, documentId, pageNumber, type, x, y, width, height, color, content } = req.body;
      const createdBy = req.user!.userId;

      // Verify request exists and user has access
      const request = await Request.findById(requestId);
      if (!request) {
        return res.status(404).json({ error: 'Request not found' });
      }

      // Check access to case
      const caseDoc = await Case.findById(request.caseId);
      if (!caseDoc) {
        return res.status(404).json({ error: 'Case not found' });
      }

      const annotation = await Annotation.create({
        requestId,
        documentId,
        pageNumber,
        type,
        x,
        y,
        width,
        height,
        color: color || '#ffff00',
        content,
        createdBy,
        timestamp: new Date()
      });

      await logAction(
        createdBy,
        'annotation_created',
        'annotation',
        annotation._id.toString(),
        { requestId, documentId, type, pageNumber },
        req
      );

      const populated = await Annotation.findById(annotation._id)
        .populate('createdBy', 'name email');

      res.status(201).json(populated);
    } catch (error) {
      console.error('Create annotation error:', error);
      res.status(500).json({ error: 'Failed to create annotation' });
    }
  }
);

// Update annotation (owner only)
router.put(
  '/:id',
  [
    body('x').optional().isFloat({ min: 0, max: 1 }),
    body('y').optional().isFloat({ min: 0, max: 1 }),
    body('width').optional().isFloat({ min: 0, max: 1 }),
    body('height').optional().isFloat({ min: 0, max: 1 }),
    body('color').optional().isString(),
    body('content').optional().trim(),
    body('textAlign').optional().isIn(['right', 'center', 'left']),
    body('textBold').optional().isBoolean()
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const annotation = await Annotation.findById(req.params.id);
      if (!annotation) {
        return res.status(404).json({ error: 'Annotation not found' });
      }

      // Check if user is the owner
      const userId = req.user!.userId;
      if (annotation.createdBy.toString() !== userId && req.user!.role !== UserRole.ADMIN) {
        return res.status(403).json({ error: 'Only the annotation owner can update it' });
      }

      const updates: any = {};
      if (req.body.x !== undefined) updates.x = req.body.x;
      if (req.body.y !== undefined) updates.y = req.body.y;
      if (req.body.width !== undefined) updates.width = req.body.width;
      if (req.body.height !== undefined) updates.height = req.body.height;
      if (req.body.color !== undefined) updates.color = req.body.color;
      if (req.body.content !== undefined) updates.content = req.body.content;
      if (req.body.textAlign !== undefined) updates.textAlign = req.body.textAlign;
      if (req.body.textBold !== undefined) updates.textBold = req.body.textBold;

      const updated = await Annotation.findByIdAndUpdate(
        req.params.id,
        updates,
        { new: true }
      ).populate('createdBy', 'name email');

      await logAction(
        userId,
        'annotation_updated',
        'annotation',
        annotation._id.toString(),
        { updates: Object.keys(updates) },
        req
      );

      res.json(updated);
    } catch (error) {
      console.error('Update annotation error:', error);
      res.status(500).json({ error: 'Failed to update annotation' });
    }
  }
);

// Soft delete annotation (owner only)
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const annotation = await Annotation.findById(req.params.id);
    if (!annotation) {
      return res.status(404).json({ error: 'Annotation not found' });
    }

    // Check if user is the owner
    const userId = req.user!.userId;
    if (annotation.createdBy.toString() !== userId && req.user!.role !== UserRole.ADMIN) {
      return res.status(403).json({ error: 'Only the annotation owner can delete it' });
    }

    annotation.isDeleted = true;
    await annotation.save();

    await logAction(
      userId,
      'annotation_deleted',
      'annotation',
      annotation._id.toString(),
      { requestId: annotation.requestId.toString() },
      req
    );

    res.json({ message: 'Annotation deleted successfully' });
  } catch (error) {
    console.error('Delete annotation error:', error);
    res.status(500).json({ error: 'Failed to delete annotation' });
  }
});

export default router;

