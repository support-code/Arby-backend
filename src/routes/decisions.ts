import express, { Response } from 'express';
import { body, validationResult } from 'express-validator';
import { Decision } from '../models/Decision';
import { Case } from '../models/Case';
import { DiscussionSession } from '../models/DiscussionSession';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { canAccessCase } from '../middleware/permissions';
import { checkOpenDocumentsLimit } from '../middleware/openDocumentsLimit';
import { logAction } from '../utils/audit';
import { UserRole, DecisionStatus, DecisionType } from '../types';

const router = express.Router();

router.use(authenticate);

// Get all decisions for a case
router.get('/case/:caseId', canAccessCase, async (req: AuthRequest, res: Response) => {
  try {
    const { caseId } = req.params;
    // Legal Requirement #12: Filter out soft-deleted decisions by default
    const decisions = await Decision.find({ caseId, isDeleted: { $ne: true } })
      .populate('createdBy', 'name email')
      .populate('documentId', 'originalName')
      .populate('requestId', 'title type')
      .populate('discussionSessionId', 'title')
      .populate('revokingDecisionId', 'title status')
      .populate('revokedByDecisionId', 'title status')
      .sort({ createdAt: -1 });
    
    res.json(decisions);
  } catch (error) {
    console.error('Fetch decisions error:', error);
    res.status(500).json({ error: 'Failed to fetch decisions' });
  }
});

// Get single decision
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const decision = await Decision.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('documentId', 'originalName')
      .populate('requestId', 'title type')
      .populate('discussionSessionId', 'title')
      .populate('caseId', 'title')
      .populate('revokingDecisionId', 'title status')
      .populate('revokedByDecisionId', 'title status');
    
    if (!decision) {
      return res.status(404).json({ error: 'Decision not found' });
    }
    
    // Legal Requirement #12: Don't show soft-deleted decisions
    if (decision.isDeleted) {
      return res.status(404).json({ error: 'Decision not found' });
    }

    // Check access to case
    const caseDoc = await Case.findById(decision.caseId);
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

    res.json(decision);
  } catch (error) {
    console.error('Fetch decision error:', error);
    res.status(500).json({ error: 'Failed to fetch decision' });
  }
});

// Create decision (Arbitrator/Admin only)
// Legal Requirement #18: Check open documents limit
router.post(
  '/',
  authorize(UserRole.ADMIN, UserRole.ARBITRATOR),
  checkOpenDocumentsLimit,
  canAccessCase,
  [
    body('caseId').notEmpty(),
    body('type').isIn(Object.values(DecisionType)),
    body('title').trim().notEmpty(),
    body('summary').optional().trim(),
    body('content').optional().trim(),
    body('documentId').optional(),
    body('requestId').optional(),
    body('discussionSessionId').optional(),
    body('closesDiscussion').optional().isBoolean(),
    body('status').optional().isIn(Object.values(DecisionStatus))
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { 
        caseId, 
        type, 
        title, 
        summary, 
        content, 
        documentId, 
        requestId,
        discussionSessionId,
        closesDiscussion,
        status 
      } = req.body;
      const createdBy = req.user!.userId;

      // Validate type-specific requirements
      if (type === DecisionType.NOTE_DECISION && !requestId) {
        return res.status(400).json({ error: 'requestId is required for note decisions' });
      }
      // Legal Requirement #13: Decisions are not time-bound to hearing duration
      // discussionSessionId is optional - decisions can be created after hearing ends
      // if ((type === DecisionType.DISCUSSION_DECISION || type === DecisionType.FINAL_DECISION) && !discussionSessionId) {
      //   return res.status(400).json({ error: 'discussionSessionId is required for discussion decisions' });
      // }

      // If final decision, ensure closesDiscussion is true
      const shouldCloseDiscussion = type === DecisionType.FINAL_DECISION ? true : (closesDiscussion || false);

      const decision = await Decision.create({
        caseId,
        type,
        title,
        summary,
        content,
        documentId,
        requestId: type === DecisionType.NOTE_DECISION ? requestId : undefined,
        discussionSessionId: (type === DecisionType.DISCUSSION_DECISION || type === DecisionType.FINAL_DECISION) 
          ? discussionSessionId 
          : undefined,
        closesDiscussion: shouldCloseDiscussion,
        status: status || DecisionStatus.DRAFT,
        createdBy,
        publishedAt: status === DecisionStatus.SIGNED ? new Date() : undefined
      });

      // If final decision closes discussion, update discussion session status
      if (type === DecisionType.FINAL_DECISION && discussionSessionId) {
        await DiscussionSession.findByIdAndUpdate(discussionSessionId, {
          status: 'completed'
        });
      }

      await logAction(
        createdBy,
        'decision_created',
        'decision',
        decision._id.toString(),
        { caseId, title, type },
        req
      );

      const populated = await Decision.findById(decision._id)
        .populate('createdBy', 'name email')
        .populate('documentId', 'originalName')
        .populate('requestId', 'title type')
        .populate('discussionSessionId', 'title');

      res.status(201).json(populated);
    } catch (error) {
      console.error('Create decision error:', error);
      res.status(500).json({ error: 'Failed to create decision' });
    }
  }
);

// Update decision (Arbitrator/Admin only)
router.patch(
  '/:id',
  authorize(UserRole.ADMIN, UserRole.ARBITRATOR),
  [
    body('title').optional().trim().notEmpty(),
    body('summary').optional().trim(),
    body('content').optional().trim(),
    body('status').optional().isIn(Object.values(DecisionStatus))
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const decision = await Decision.findById(req.params.id);
      if (!decision) {
        return res.status(404).json({ error: 'Decision not found' });
      }

      // Legal Requirement #14: Signed decision cannot be edited, only revoked
      if (decision.status === DecisionStatus.SIGNED) {
        return res.status(403).json({ 
          error: 'DECISION_SIGNED',
          message: 'החלטה חתומה אינה ניתנת לעריכה. לביטול יש ליצור "החלטה מבטלת" באמצעות endpoint של revoke.'
        });
      }

      const updates: any = {};
      if (req.body.title) updates.title = req.body.title;
      if (req.body.summary !== undefined) updates.summary = req.body.summary;
      if (req.body.content !== undefined) updates.content = req.body.content;
      if (req.body.documentId !== undefined) updates.documentId = req.body.documentId;
      if (req.body.requestId !== undefined) updates.requestId = req.body.requestId;
      if (req.body.discussionSessionId !== undefined) updates.discussionSessionId = req.body.discussionSessionId;
      if (req.body.closesDiscussion !== undefined) updates.closesDiscussion = req.body.closesDiscussion;
      if (req.body.status) {
        updates.status = req.body.status;
        if (req.body.status === DecisionStatus.SIGNED && !decision.publishedAt) {
          updates.publishedAt = new Date();
        }
      }

      const updated = await Decision.findByIdAndUpdate(
        req.params.id,
        updates,
        { new: true }
      ).populate('createdBy', 'name email')
       .populate('documentId', 'originalName')
       .populate('requestId', 'title type')
       .populate('discussionSessionId', 'title');

      await logAction(
        req.user!.userId,
        'decision_updated',
        'decision',
        decision._id.toString(),
        updates,
        req
      );

      res.json(updated);
    } catch (error) {
      console.error('Update decision error:', error);
      res.status(500).json({ error: 'Failed to update decision' });
    }
  }
);

// Revoke decision (Legal Requirement #14: Signed decision can only be revoked by "revoking decision")
router.post(
  '/:id/revoke',
  authorize(UserRole.ADMIN, UserRole.ARBITRATOR),
  [
    body('revokingDecisionId').notEmpty().isMongoId()
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const decision = await Decision.findById(req.params.id);
      if (!decision) {
        return res.status(404).json({ error: 'Decision not found' });
      }

      // Only signed decisions can be revoked
      if (decision.status !== DecisionStatus.SIGNED) {
        return res.status(400).json({ 
          error: 'Only signed decisions can be revoked' 
        });
      }

      const revokingDecision = await Decision.findById(req.body.revokingDecisionId);
      if (!revokingDecision) {
        return res.status(404).json({ error: 'Revoking decision not found' });
      }

      // Link the decisions
      decision.revokingDecisionId = req.body.revokingDecisionId;
      await decision.save();

      revokingDecision.revokedByDecisionId = decision._id.toString();
      await revokingDecision.save();

      await logAction(
        req.user!.userId,
        'decision_revoked',
        'decision',
        decision._id.toString(),
        { 
          revokedDecisionId: decision._id.toString(),
          revokingDecisionId: req.body.revokingDecisionId 
        },
        req
      );

      res.json({ 
        message: 'Decision revoked successfully',
        revokedDecision: decision,
        revokingDecision: revokingDecision
      });
    } catch (error) {
      console.error('Revoke decision error:', error);
      res.status(500).json({ error: 'Failed to revoke decision' });
    }
  }
);

// Delete decision (Legal Requirement #12: Soft delete - not text deletion but controlled system action)
// Legal Requirement #19: Document opened by mistake must be signed and remain documented (not deleted)
router.delete(
  '/:id',
  authorize(UserRole.ADMIN, UserRole.ARBITRATOR),
  async (req: AuthRequest, res: Response) => {
    try {
      const decision = await Decision.findById(req.params.id);
      if (!decision) {
        return res.status(404).json({ error: 'Decision not found' });
      }

      // Legal Requirement #19: If decision is signed, it cannot be deleted - must remain documented
      if (decision.status === DecisionStatus.SIGNED) {
        return res.status(403).json({ 
          error: 'SIGNED_DECISION_CANNOT_BE_DELETED',
          message: 'החלטה חתומה אינה ניתנת למחיקה. מסמך שנפתח בטעות חייב להישאר מתועד. לביטול יש ליצור "החלטה מבטלת".'
        });
      }

      // Legal Requirement #12: Soft delete - mark as deleted but keep in database
      decision.isDeleted = true;
      decision.deletedAt = new Date();
      decision.deletedBy = req.user!.userId as any;
      await decision.save();

      await logAction(
        req.user!.userId,
        'decision_deleted',
        'decision',
        decision._id.toString(),
        { 
          caseId: decision.caseId.toString(),
          softDelete: true,
          deletedAt: decision.deletedAt
        },
        req
      );

      res.json({ message: 'Decision deleted successfully (soft delete)' });
    } catch (error) {
      console.error('Delete decision error:', error);
      res.status(500).json({ error: 'Failed to delete decision' });
    }
  }
);

export default router;

