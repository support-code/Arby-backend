import express, { Response } from 'express';
import { body, validationResult } from 'express-validator';
import { RelatedCase } from '../models/RelatedCase';
import { Case } from '../models/Case';
import { authenticate, AuthRequest } from '../middleware/auth';
import { canAccessCase } from '../middleware/permissions';
import { logAction } from '../utils/audit';
import { RelationType, UserRole } from '../types';

const router = express.Router();

router.use(authenticate);

// Get all related cases for a case
router.get('/case/:caseId', canAccessCase, async (req: AuthRequest, res: Response) => {
  try {
    const { caseId } = req.params;
    const relatedCases = await RelatedCase.find({ caseId })
      .populate('relatedCaseId', 'title caseNumber status')
      .sort({ createdAt: -1 });
    
    res.json(relatedCases);
  } catch (error) {
    console.error('Fetch related cases error:', error);
    res.status(500).json({ error: 'Failed to fetch related cases' });
  }
});

// Create related case link (Arbitrator/Admin only)
router.post(
  '/',
  canAccessCase,
  [
    body('caseId').notEmpty(),
    body('relatedCaseId').notEmpty(),
    body('relationType').isIn(Object.values(RelationType)),
    body('notes').optional().trim()
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { caseId, relatedCaseId, relationType, notes } = req.body;
      const userId = req.user!.userId;
      const role = req.user!.role;

      // Only arbitrator and admin can create links
      const caseDoc = await Case.findById(caseId);
      if (!caseDoc) {
        return res.status(404).json({ error: 'Case not found' });
      }

      if (role !== UserRole.ADMIN && (caseDoc.arbitratorIds && Array.isArray(caseDoc.arbitratorIds) && caseDoc.arbitratorIds.some((arbId: any) => arbId.toString() === userId)) || ((caseDoc as any).arbitratorId && (caseDoc as any).arbitratorId.toString() === userId) !== userId) {
        return res.status(403).json({ error: 'Only arbitrator can link cases' });
      }

      // Verify related case exists
      const relatedCaseDoc = await Case.findById(relatedCaseId);
      if (!relatedCaseDoc) {
        return res.status(404).json({ error: 'Related case not found' });
      }

      // Check if link already exists
      const existingLink = await RelatedCase.findOne({ caseId, relatedCaseId });
      if (existingLink) {
        return res.status(400).json({ error: 'Cases are already linked' });
      }

      const relatedCase = await RelatedCase.create({
        caseId,
        relatedCaseId,
        relationType,
        notes: notes || undefined
      });

      await logAction(
        userId,
        'related_case_created',
        'related_case',
        relatedCase._id.toString(),
        { caseId, relatedCaseId, relationType },
        req
      );

      const populated = await RelatedCase.findById(relatedCase._id)
        .populate('relatedCaseId', 'title caseNumber status');

      res.status(201).json(populated);
    } catch (error) {
      console.error('Create related case error:', error);
      res.status(500).json({ error: 'Failed to create related case link' });
    }
  }
);

// Delete related case link (Arbitrator/Admin only)
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const relatedCase = await RelatedCase.findById(req.params.id);
    if (!relatedCase) {
      return res.status(404).json({ error: 'Related case link not found' });
    }

    // Check if user is arbitrator or admin
    const caseDoc = await Case.findById(relatedCase.caseId);
    if (!caseDoc) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const userId = req.user!.userId;
    const role = req.user!.role;
    
    if (role !== UserRole.ADMIN && (caseDoc.arbitratorIds && Array.isArray(caseDoc.arbitratorIds) && caseDoc.arbitratorIds.some((arbId: any) => arbId.toString() === userId)) || ((caseDoc as any).arbitratorId && (caseDoc as any).arbitratorId.toString() === userId) !== userId) {
      return res.status(403).json({ error: 'Only arbitrator can delete case links' });
    }

    await RelatedCase.findByIdAndDelete(req.params.id);

    await logAction(
      userId,
      'related_case_deleted',
      'related_case',
      req.params.id,
      {},
      req
    );

    res.json({ message: 'Related case link deleted successfully' });
  } catch (error) {
    console.error('Delete related case error:', error);
    res.status(500).json({ error: 'Failed to delete related case link' });
  }
});

export default router;

