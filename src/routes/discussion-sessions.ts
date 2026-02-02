import express, { Response } from 'express';
import { body, validationResult } from 'express-validator';
import { DiscussionSession } from '../models/DiscussionSession';
import { Hearing } from '../models/Hearing';
import { Case } from '../models/Case';
import { authenticate, AuthRequest } from '../middleware/auth';
import { canAccessCase } from '../middleware/permissions';
import { logAction } from '../utils/audit';
import { UserRole, AttendeeType } from '../types';
import {
  canWriteProtocol,
  canTransitionState,
  canEditProtocol,
  injectParticipantsHeader,
  DiscussionSessionStatus
} from '../services/hearingStateGuard';

const router = express.Router();

router.use(authenticate);

// Get all discussion sessions for a case
router.get('/case/:caseId', canAccessCase, async (req: AuthRequest, res: Response) => {
  try {
    const { caseId } = req.params;
    const sessions = await DiscussionSession.find({ caseId })
      .populate('createdBy', 'name email')
      .populate('hearingId', 'scheduledDate type')
      .sort({ startedAt: -1 });
    
    res.json(sessions);
  } catch (error) {
    console.error('Fetch discussion sessions error:', error);
    res.status(500).json({ error: 'Failed to fetch discussion sessions' });
  }
});

// Get all discussion sessions for a hearing
router.get('/hearing/:hearingId', async (req: AuthRequest, res: Response) => {
  try {
    const { hearingId } = req.params;
    
    // Check access to hearing
    const hearing = await Hearing.findById(hearingId);
    if (!hearing) {
      return res.status(404).json({ error: 'Hearing not found' });
    }

    const caseDoc = await Case.findById(hearing.caseId);
    if (!caseDoc) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const userId = req.user!.userId;
    const role = req.user!.role;
    
    // Check if user is arbitrator (check arbitratorIds array)
    const isArbitrator = caseDoc.arbitratorIds && Array.isArray(caseDoc.arbitratorIds) && 
      caseDoc.arbitratorIds.some((arbId: any) => arbId.toString() === userId);
    // Legacy support
    const isLegacyArbitrator = (caseDoc as any).arbitratorId && (caseDoc as any).arbitratorId.toString() === userId;
    
    if (role !== UserRole.ADMIN && 
        !isArbitrator && !isLegacyArbitrator &&
        !caseDoc.lawyers.some((l: any) => l.toString() === userId) &&
        !caseDoc.parties.some((p: any) => p.toString() === userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const sessions = await DiscussionSession.find({ hearingId })
      .populate('createdBy', 'name email')
      .populate('hearingId', 'scheduledDate type')
      .sort({ startedAt: -1 });
    
    res.json(sessions);
  } catch (error) {
    console.error('Fetch discussion sessions error:', error);
    res.status(500).json({ error: 'Failed to fetch discussion sessions' });
  }
});

// Get single discussion session
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const session = await DiscussionSession.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('hearingId', 'scheduledDate type')
      .populate('decisions', 'title content status');
    
    if (!session) {
      return res.status(404).json({ error: 'Discussion session not found' });
    }

    // Check access to case
    const caseDoc = await Case.findById(session.caseId);
    if (!caseDoc) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const userId = req.user!.userId;
    const role = req.user!.role;
    
    // Check if user is arbitrator (check arbitratorIds array)
    const isArbitrator = caseDoc.arbitratorIds && Array.isArray(caseDoc.arbitratorIds) && 
      caseDoc.arbitratorIds.some((arbId: any) => arbId.toString() === userId);
    // Legacy support
    const isLegacyArbitrator = (caseDoc as any).arbitratorId && (caseDoc as any).arbitratorId.toString() === userId;
    
    if (role !== UserRole.ADMIN && 
        !isArbitrator && !isLegacyArbitrator &&
        !caseDoc.lawyers.some((l: any) => l.toString() === userId) &&
        !caseDoc.parties.some((p: any) => p.toString() === userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(session);
  } catch (error) {
    console.error('Fetch discussion session error:', error);
    res.status(500).json({ error: 'Failed to fetch discussion session' });
  }
});

// Create discussion session
router.post(
  '/',
  [
    body('hearingId').notEmpty(),
    body('caseId').notEmpty(),
    body('title').trim().notEmpty(),
    body('startedAt').isISO8601(),
    body('attendees').optional().isArray(),
    body('status').optional().isIn(['active', 'completed', 'cancelled'])
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { hearingId, caseId, title, startedAt, attendees, status } = req.body;
      const createdBy = req.user!.userId;

      // Verify hearing exists
      const hearing = await Hearing.findById(hearingId);
      if (!hearing) {
        return res.status(404).json({ error: 'Hearing not found' });
      }

      // Verify case exists and user has access
      const caseDoc = await Case.findById(caseId);
      if (!caseDoc) {
        return res.status(404).json({ error: 'Case not found' });
      }

      const userId = req.user!.userId;
      const role = req.user!.role;
      
      // Check if user is arbitrator (check arbitratorIds array)
      const isArbitrator = caseDoc.arbitratorIds && Array.isArray(caseDoc.arbitratorIds) && 
        caseDoc.arbitratorIds.some((arbId: any) => arbId.toString() === userId);
      // Legacy support
      const isLegacyArbitrator = (caseDoc as any).arbitratorId && (caseDoc as any).arbitratorId.toString() === userId;
      
      if (role !== UserRole.ADMIN && 
          !isArbitrator && !isLegacyArbitrator &&
          !caseDoc.lawyers.some((l: any) => l.toString() === userId) &&
          !caseDoc.parties.some((p: any) => p.toString() === userId)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Only arbitrator/admin can create sessions
      if (role !== UserRole.ADMIN && !isArbitrator && !isLegacyArbitrator) {
        return res.status(403).json({ error: 'Only arbitrator can create discussion sessions' });
      }

      // Convert attendees array - if it's old format (user IDs), convert to new format
      let formattedAttendees: any[] = [];
      if (attendees && Array.isArray(attendees)) {
        formattedAttendees = attendees.map((a: any) => {
          // If it's already in new format (has type and name), use it
          if (a.type && a.name) {
            return a;
          }
          // Otherwise, it's a user ID - convert to "other" type
          return { type: 'other', name: 'משתמש', userId: a };
        });
      } else if (hearing.participants && hearing.participants.length > 0) {
        // Convert hearing participants to attendees
        formattedAttendees = hearing.participants.map((p: any) => ({
          type: 'other',
          name: 'משתמש',
          userId: p.toString ? p.toString() : p
        }));
      }

      const session = await DiscussionSession.create({
        hearingId,
        caseId,
        title,
        startedAt: new Date(startedAt),
        attendees: formattedAttendees,
        status: status || 'active',
        createdBy
      });

      await logAction(
        createdBy,
        'discussion_session_created',
        'discussion_session',
        session._id.toString(),
        { hearingId, caseId, title },
        req
      );

      const populated = await DiscussionSession.findById(session._id)
        .populate('createdBy', 'name email')
        .populate('hearingId', 'scheduledDate type');

      res.status(201).json(populated);
    } catch (error) {
      console.error('Create discussion session error:', error);
      res.status(500).json({ error: 'Failed to create discussion session' });
    }
  }
);

// Update discussion session
router.patch(
  '/:id',
  [
    body('title').optional().trim(),
    body('endedAt').optional().isISO8601(),
    body('protocol').optional(),
    body('status').optional().isIn(['active', 'completed', 'cancelled'])
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const session = await DiscussionSession.findById(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Discussion session not found' });
      }

      // Check access
      const caseDoc = await Case.findById(session.caseId);
      if (!caseDoc) {
        return res.status(404).json({ error: 'Case not found' });
      }

      const userId = req.user!.userId;
      const role = req.user!.role;
      
      // Check if user is arbitrator (check arbitratorIds array)
      const isArbitrator = caseDoc.arbitratorIds && Array.isArray(caseDoc.arbitratorIds) && 
        caseDoc.arbitratorIds.some((arbId: any) => arbId.toString() === userId);
      // Legacy support
      const isLegacyArbitrator = (caseDoc as any).arbitratorId && (caseDoc as any).arbitratorId.toString() === userId;
      
      if (role !== UserRole.ADMIN && !isArbitrator && !isLegacyArbitrator) {
        return res.status(403).json({ error: 'Only arbitrator can update discussion sessions' });
      }

      const updates: any = {};
      if (req.body.title) updates.title = req.body.title;
      
      // Legal Principle #5: State machine transitions must be validated
      if (req.body.status) {
        const transitionGuard = canTransitionState(session.status, req.body.status);
        if (!transitionGuard.allowed) {
          return res.status(403).json({
            error: transitionGuard.error,
            message: transitionGuard.message
          });
        }
        updates.status = req.body.status;
        
        // Legal Principle #6: When ending, set endedAt timestamp
        if (req.body.status === DiscussionSessionStatus.ENDED && !session.endedAt) {
          updates.endedAt = new Date();
        }
        
        // Legal Principle #7: When signing, set signedAt timestamp
        if (req.body.status === DiscussionSessionStatus.SIGNED && !session.signedAt) {
          updates.signedAt = new Date();
          updates.signedBy = userId;
        }
      }
      
      if (req.body.endedAt) updates.endedAt = new Date(req.body.endedAt);
      
      // Legal Requirement #1: Protocol may ONLY be opened and edited on the hearing day itself
      // Legal Principle #2 & #3: Protocol may ONLY be written during ACTIVE hearing with participants
      if (req.body.protocol !== undefined) {
        const hearing = await Hearing.findById(session.hearingId);
        const sessionPlain = { ...session.toObject(), _id: session._id.toString() };
        const protocolGuard = await canEditProtocol(sessionPlain as any, hearing);
        if (!protocolGuard.allowed) {
          return res.status(403).json({
            error: protocolGuard.error,
            message: protocolGuard.message
          });
        }
        // Legal Principle #4: Inject participants header
        updates.protocol = injectParticipantsHeader(req.body.protocol, session.attendees || []);
      }

      const updated = await DiscussionSession.findByIdAndUpdate(
        req.params.id,
        updates,
        { new: true }
      )
        .populate('createdBy', 'name email')
        .populate('hearingId', 'scheduledDate type')
        .populate('decisions', 'title content status');

      await logAction(
        userId,
        'discussion_session_updated',
        'discussion_session',
        session._id.toString(),
        updates,
        req
      );

      res.json(updated);
    } catch (error) {
      console.error('Update discussion session error:', error);
      res.status(500).json({ error: 'Failed to update discussion session' });
    }
  }
);

// Add attendee to session
router.post('/:id/attendees', [
  body('type').isIn(Object.values(AttendeeType)),
  body('name').trim().notEmpty(),
  body('userId').optional().isMongoId()
], async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { type, name, userId } = req.body;

    const session = await DiscussionSession.findById(id);
    if (!session) {
      return res.status(404).json({ error: 'Discussion session not found' });
    }

    // Check access
    const caseDoc = await Case.findById(session.caseId);
    if (!caseDoc) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const currentUserId = req.user!.userId;
    const role = req.user!.role;
    
    // Check if user is arbitrator (check arbitratorIds array)
    const isArbitrator = caseDoc.arbitratorIds && Array.isArray(caseDoc.arbitratorIds) && 
      caseDoc.arbitratorIds.some((arbId: any) => arbId.toString() === currentUserId);
    // Legacy support
    const isLegacyArbitrator = (caseDoc as any).arbitratorId && (caseDoc as any).arbitratorId.toString() === currentUserId;
    
    if (role !== UserRole.ADMIN && !isArbitrator && !isLegacyArbitrator) {
      return res.status(403).json({ error: 'Only arbitrator can add attendees' });
    }

    // Allow adding attendees when session is created or active (before ending)
    // Legal requirement: Need participants before starting active hearing
    if (session.status !== 'active' && session.status !== 'created') {
      return res.status(400).json({ error: 'Cannot add attendees to inactive session. Session must be created or active.' });
    }

    // Check if attendee with same name and type already exists
    const existingAttendee = session.attendees.find(
      (a: any) => a.type === type && a.name === name
    );
    if (existingAttendee) {
      return res.status(400).json({ error: 'Attendee with this name and type already exists' });
    }

    session.attendees.push({ type, name, userId: userId || undefined });
    await session.save();

    const populated = await DiscussionSession.findById(session._id)
      .populate('createdBy', 'name email')
      .populate('hearingId', 'scheduledDate type');

    res.json(populated);
  } catch (error) {
    console.error('Add attendee error:', error);
    res.status(500).json({ error: 'Failed to add attendee' });
  }
});

// Remove attendee from session
router.delete('/:id/attendees/:index', async (req: AuthRequest, res: Response) => {
  try {
    const { id, index } = req.params;
    const attendeeIndex = parseInt(index);

    const session = await DiscussionSession.findById(id);
    if (!session) {
      return res.status(404).json({ error: 'Discussion session not found' });
    }

    // Check access
    const caseDoc = await Case.findById(session.caseId);
    if (!caseDoc) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const currentUserId = req.user!.userId;
    const role = req.user!.role;
    
    // Check if user is arbitrator (check arbitratorIds array)
    const isArbitrator = caseDoc.arbitratorIds && Array.isArray(caseDoc.arbitratorIds) && 
      caseDoc.arbitratorIds.some((arbId: any) => arbId.toString() === currentUserId);
    // Legacy support
    const isLegacyArbitrator = (caseDoc as any).arbitratorId && (caseDoc as any).arbitratorId.toString() === currentUserId;
    
    if (role !== UserRole.ADMIN && !isArbitrator && !isLegacyArbitrator) {
      return res.status(403).json({ error: 'Only arbitrator can remove attendees' });
    }

    // Allow removing attendees when session is created or active (before ending)
    if (session.status !== 'active' && session.status !== 'created') {
      return res.status(400).json({ error: 'Cannot remove attendees from inactive session. Session must be created or active.' });
    }

    if (attendeeIndex < 0 || attendeeIndex >= session.attendees.length) {
      return res.status(400).json({ error: 'Invalid attendee index' });
    }

    session.attendees.splice(attendeeIndex, 1);
    await session.save();

    const populated = await DiscussionSession.findById(session._id)
      .populate('createdBy', 'name email')
      .populate('hearingId', 'scheduledDate type');

    res.json(populated);
  } catch (error) {
    console.error('Remove attendee error:', error);
    res.status(500).json({ error: 'Failed to remove attendee' });
  }
});

// Start discussion session (Legal Principle #5: State machine CREATED → ACTIVE)
router.post('/:id/start', async (req: AuthRequest, res: Response) => {
  try {
    const session = await DiscussionSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Discussion session not found' });
    }

    // Check access
    const caseDoc = await Case.findById(session.caseId);
    if (!caseDoc) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const userId = req.user!.userId;
    const role = req.user!.role;
    
    // Check if user is arbitrator (check arbitratorIds array)
    const isArbitrator = caseDoc.arbitratorIds && Array.isArray(caseDoc.arbitratorIds) && 
      caseDoc.arbitratorIds.some((arbId: any) => arbId.toString() === userId);
    // Legacy support
    const isLegacyArbitrator = (caseDoc as any).arbitratorId && (caseDoc as any).arbitratorId.toString() === userId;
    
    if (role !== UserRole.ADMIN && !isArbitrator && !isLegacyArbitrator) {
      return res.status(403).json({ error: 'Only arbitrator can start discussion sessions' });
    }

    // Legal Principle #5: Validate state transition
    const transitionGuard = canTransitionState(session.status, DiscussionSessionStatus.ACTIVE);
    if (!transitionGuard.allowed) {
      return res.status(403).json({
        error: transitionGuard.error,
        message: transitionGuard.message
      });
    }

    session.status = DiscussionSessionStatus.ACTIVE;
    await session.save();

    // Legal Principle #10: Log state change with timestamp + userId
    await logAction(
      userId,
      'discussion_session_started',
      'discussion_session',
      session._id.toString(),
      { status: DiscussionSessionStatus.ACTIVE, startedAt: session.startedAt },
      req
    );

    const populated = await DiscussionSession.findById(session._id)
      .populate('createdBy', 'name email')
      .populate('hearingId', 'scheduledDate type')
      .populate('decisions', 'title content status');

    res.json(populated);
  } catch (error) {
    console.error('Start discussion session error:', error);
    res.status(500).json({ error: 'Failed to start discussion session' });
  }
});

// End discussion session (Legal Principle #6: Stop timer, lock protocol, persist snapshot)
router.post('/:id/end', async (req: AuthRequest, res: Response) => {
  try {
    const session = await DiscussionSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Discussion session not found' });
    }

    // Check access
    const caseDoc = await Case.findById(session.caseId);
    if (!caseDoc) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const userId = req.user!.userId;
    const role = req.user!.role;
    
    // Check if user is arbitrator (check arbitratorIds array)
    const isArbitrator = caseDoc.arbitratorIds && Array.isArray(caseDoc.arbitratorIds) && 
      caseDoc.arbitratorIds.some((arbId: any) => arbId.toString() === userId);
    // Legacy support
    const isLegacyArbitrator = (caseDoc as any).arbitratorId && (caseDoc as any).arbitratorId.toString() === userId;
    
    if (role !== UserRole.ADMIN && !isArbitrator && !isLegacyArbitrator) {
      return res.status(403).json({ error: 'Only arbitrator can end discussion sessions' });
    }

    // Legal Principle #5: Validate state transition
    const transitionGuard = canTransitionState(session.status, DiscussionSessionStatus.ENDED);
    if (!transitionGuard.allowed) {
      return res.status(403).json({
        error: transitionGuard.error,
        message: transitionGuard.message
      });
    }

    // Legal Principle #6: Stop timer, lock protocol, persist final snapshot
    session.status = 'ended' as any;
    session.endedAt = new Date();
    if (session.protocol) {
      session.protocolSnapshot = session.protocol; // Immutable snapshot
    }
    await session.save();

    // Legal Principle #10: Log state change with timestamp + userId
    await logAction(
      userId,
      'discussion_session_ended',
      'discussion_session',
      session._id.toString(),
      { 
        status: DiscussionSessionStatus.ENDED,
        endedAt: session.endedAt,
        protocolSnapshotCreated: !!session.protocolSnapshot
      },
      req
    );

    const populated = await DiscussionSession.findById(session._id)
      .populate('createdBy', 'name email')
      .populate('hearingId', 'scheduledDate type')
      .populate('decisions', 'title content status');

    res.json(populated);
  } catch (error) {
    console.error('End discussion session error:', error);
    res.status(500).json({ error: 'Failed to end discussion session' });
  }
});

// Sign protocol (Legal Principle #7: Protocol becomes immutable after signing)
router.post('/:id/sign', async (req: AuthRequest, res: Response) => {
  try {
    const session = await DiscussionSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Discussion session not found' });
    }

    // Check access
    const caseDoc = await Case.findById(session.caseId);
    if (!caseDoc) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const userId = req.user!.userId;
    const role = req.user!.role;
    
    // Check if user is arbitrator (check arbitratorIds array)
    const isArbitrator = caseDoc.arbitratorIds && Array.isArray(caseDoc.arbitratorIds) && 
      caseDoc.arbitratorIds.some((arbId: any) => arbId.toString() === userId);
    // Legacy support
    const isLegacyArbitrator = (caseDoc as any).arbitratorId && (caseDoc as any).arbitratorId.toString() === userId;
    
    if (role !== UserRole.ADMIN && !isArbitrator && !isLegacyArbitrator) {
      return res.status(403).json({ error: 'Only arbitrator can sign protocols' });
    }

    // Legal Principle #5: Validate state transition (must be ENDED before SIGNED)
    const transitionGuard = canTransitionState(session.status, DiscussionSessionStatus.SIGNED);
    if (!transitionGuard.allowed) {
      return res.status(403).json({
        error: transitionGuard.error,
        message: transitionGuard.message
      });
    }

    // Legal Principle #7: Protocol becomes immutable after signing
    session.status = 'signed' as any;
    session.signedAt = new Date();
    session.signedBy = userId as any;
    if (session.protocol && !session.protocolSnapshot) {
      session.protocolSnapshot = session.protocol; // Final immutable snapshot
    }
    await session.save();

    // Legal Principle #10: Log state change with timestamp + userId
    await logAction(
      userId,
      'protocol_signed',
      'discussion_session',
      session._id.toString(),
      { 
        status: DiscussionSessionStatus.SIGNED,
        signedAt: session.signedAt,
        protocolSnapshotCreated: !!session.protocolSnapshot
      },
      req
    );

    const populated = await DiscussionSession.findById(session._id)
      .populate('createdBy', 'name email')
      .populate('hearingId', 'scheduledDate type')
      .populate('decisions', 'title content status');

    res.json(populated);
  } catch (error) {
    console.error('Sign protocol error:', error);
    res.status(500).json({ error: 'Failed to sign protocol' });
  }
});

export default router;

