import express, { Response } from 'express';
import { body, validationResult } from 'express-validator';
import { Protocol } from '../models/Protocol';
import { DiscussionSession } from '../models/DiscussionSession';
import { Hearing } from '../models/Hearing';
import { Case } from '../models/Case';
import { authenticate, AuthRequest } from '../middleware/auth';
import { logAction } from '../utils/audit';
import { UserRole } from '../types';
import {
  canWriteProtocol,
  canEditProtocol,
  validateProtocolContent,
  injectParticipantsHeader,
  extractProtocolContent,
  DiscussionSessionStatus
} from '../services/hearingStateGuard';

const router = express.Router();

router.use(authenticate);

// Get all protocols for a discussion session
router.get('/session/:sessionId', async (req: AuthRequest, res: Response) => {
  try {
    const { sessionId } = req.params;
    
    // Check access to session
    const session = await DiscussionSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Discussion session not found' });
    }

    const caseDoc = await Case.findById(session.caseId);
    if (!caseDoc) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const userId = req.user!.userId;
    const role = req.user!.role;
    
    // Admin can access everything
    if (role === UserRole.ADMIN) {
      // Allow access
    } else {
      // Check if user is arbitrator, lawyer, or party
      const isArbitrator = (caseDoc.arbitratorIds && Array.isArray(caseDoc.arbitratorIds) && caseDoc.arbitratorIds.some((arbId: any) => arbId.toString() === userId)) ||
                          ((caseDoc as any).arbitratorId && (caseDoc as any).arbitratorId.toString() === userId);
      const isLawyer = caseDoc.lawyers && caseDoc.lawyers.some((l: any) => l.toString() === userId);
      const isParty = caseDoc.parties && caseDoc.parties.some((p: any) => p.toString() === userId);
      
      if (!isArbitrator && !isLawyer && !isParty) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const protocols = await Protocol.find({ discussionSessionId: sessionId })
      .populate('createdBy', 'name email')
      .sort({ version: -1 });
    
    res.json(protocols);
  } catch (error) {
    console.error('Fetch protocols error:', error);
    res.status(500).json({ error: 'Failed to fetch protocols' });
  }
});

// Get all protocols for a case
router.get('/case/:caseId', async (req: AuthRequest, res: Response) => {
  try {
    const { caseId } = req.params;
    
    // Check access to case
    const caseDoc = await Case.findById(caseId);
    if (!caseDoc) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const userId = req.user!.userId;
    const role = req.user!.role;
    
    // Admin can access everything
    if (role === UserRole.ADMIN) {
      // Allow access
    } else {
      // Check if user is arbitrator, lawyer, or party
      const isArbitrator = (caseDoc.arbitratorIds && Array.isArray(caseDoc.arbitratorIds) && caseDoc.arbitratorIds.some((arbId: any) => arbId.toString() === userId)) ||
                          ((caseDoc as any).arbitratorId && (caseDoc as any).arbitratorId.toString() === userId);
      const isLawyer = caseDoc.lawyers && caseDoc.lawyers.some((l: any) => l.toString() === userId);
      const isParty = caseDoc.parties && caseDoc.parties.some((p: any) => p.toString() === userId);
      
      if (!isArbitrator && !isLawyer && !isParty) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const protocols = await Protocol.find({ caseId })
      .populate('createdBy', 'name email')
      .populate('discussionSessionId', 'title startedAt')
      .sort({ createdAt: -1 });
    
    res.json(protocols);
  } catch (error) {
    console.error('Fetch protocols error:', error);
    res.status(500).json({ error: 'Failed to fetch protocols' });
  }
});

// Get single protocol
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const protocol = await Protocol.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('discussionSessionId', 'title startedAt');
    
    if (!protocol) {
      return res.status(404).json({ error: 'Protocol not found' });
    }

    // Check access to case
    const caseDoc = await Case.findById(protocol.caseId);
    if (!caseDoc) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const userId = req.user!.userId;
    const role = req.user!.role;
    
    // Admin can access everything
    if (role === UserRole.ADMIN) {
      // Allow access
    } else {
      // Check if user is arbitrator, lawyer, or party
      const isArbitrator = (caseDoc.arbitratorIds && Array.isArray(caseDoc.arbitratorIds) && caseDoc.arbitratorIds.some((arbId: any) => arbId.toString() === userId)) ||
                          ((caseDoc as any).arbitratorId && (caseDoc as any).arbitratorId.toString() === userId);
      const isLawyer = caseDoc.lawyers && caseDoc.lawyers.some((l: any) => l.toString() === userId);
      const isParty = caseDoc.parties && caseDoc.parties.some((p: any) => p.toString() === userId);
      
      if (!isArbitrator && !isLawyer && !isParty) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    res.json(protocol);
  } catch (error) {
    console.error('Fetch protocol error:', error);
    res.status(500).json({ error: 'Failed to fetch protocol' });
  }
});

// Create protocol
router.post(
  '/',
  [
    body('discussionSessionId').notEmpty(),
    body('caseId').notEmpty(),
    body('content').notEmpty(),
    body('version').optional().isNumeric()
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { discussionSessionId, caseId, content, version } = req.body;
      const createdBy = req.user!.userId;

      // Verify session exists
      const session = await DiscussionSession.findById(discussionSessionId);
      if (!session) {
        return res.status(404).json({ error: 'Discussion session not found' });
      }

      // Verify case exists and user has access
      const caseDoc = await Case.findById(caseId);
      if (!caseDoc) {
        return res.status(404).json({ error: 'Case not found' });
      }

      const userId = req.user!.userId;
      const role = req.user!.role;
      
      if (role !== UserRole.ADMIN && 
          (caseDoc.arbitratorIds && Array.isArray(caseDoc.arbitratorIds) && caseDoc.arbitratorIds.some((arbId: any) => arbId.toString() === userId)) || ((caseDoc as any).arbitratorId && (caseDoc as any).arbitratorId.toString() === userId) !== userId &&
          !caseDoc.lawyers.some(l => l.toString() === userId) &&
          !caseDoc.parties.some(p => p.toString() === userId)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Only arbitrator/admin can create protocols
      if (role !== UserRole.ADMIN) {
        const isArbitrator = (caseDoc.arbitratorIds && Array.isArray(caseDoc.arbitratorIds) && caseDoc.arbitratorIds.some((arbId: any) => arbId.toString() === userId)) ||
                            ((caseDoc as any).arbitratorId && (caseDoc as any).arbitratorId.toString() === userId);
        
        if (!isArbitrator) {
          return res.status(403).json({ error: 'Only arbitrator can create protocols' });
        }
      }

      // Fetch hearing for date validation
      const hearing = await Hearing.findById(session.hearingId);

      // Legal Requirement #1: Protocol may ONLY be opened and edited on the hearing day itself
      // Legal Principle #2 & #3: Protocol may ONLY be written during ACTIVE hearing with participants
      const sessionPlain = { ...session.toObject(), _id: session._id.toString() };
      const writeGuard = await canWriteProtocol(sessionPlain as any, hearing);
      if (!writeGuard.allowed) {
        return res.status(403).json({ 
          error: writeGuard.error,
          message: writeGuard.message 
        });
      }

      // Legal Principle #3: Validate protocol content doesn't contain decision text
      const contentGuard = validateProtocolContent(content);
      if (!contentGuard.allowed) {
        return res.status(400).json({ 
          error: contentGuard.error,
          message: contentGuard.message 
        });
      }

      // Legal Principle #4: Inject locked participants header
      const contentWithHeader = injectParticipantsHeader(content, session.attendees || []);

      // Legal Requirement #10: Only one current version exists at any time
      const latestProtocol = await Protocol.findOne({ discussionSessionId })
        .sort({ version: -1 });
      const nextVersion = version || (latestProtocol ? latestProtocol.version + 1 : 1);

      // Mark previous version as not current
      if (latestProtocol && latestProtocol.isCurrentVersion) {
        await Protocol.updateMany(
          { discussionSessionId, isCurrentVersion: true },
          { $set: { isCurrentVersion: false } }
        );
      }

      const protocol = await Protocol.create({
        discussionSessionId,
        caseId,
        content: contentWithHeader,
        version: nextVersion,
        isCurrentVersion: true, // New version becomes current
        createdBy
      });

      // Update session protocol (with header)
      session.protocol = contentWithHeader;
      await session.save();

      await logAction(
        createdBy,
        'protocol_created',
        'protocol',
        protocol._id.toString(),
        { discussionSessionId, caseId, version: nextVersion },
        req
      );

      const populated = await Protocol.findById(protocol._id)
        .populate('createdBy', 'name email')
        .populate('discussionSessionId', 'title startedAt');

      res.status(201).json(populated);
    } catch (error) {
      console.error('Create protocol error:', error);
      res.status(500).json({ error: 'Failed to create protocol' });
    }
  }
);

// Save protocol (creates new version)
router.post(
  '/session/:sessionId/save',
  [
    body('content').notEmpty()
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { sessionId } = req.params;
      const { content } = req.body;
      const createdBy = req.user!.userId;

      // Verify session exists
      const session = await DiscussionSession.findById(sessionId);
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
      
      // Check if user is admin
      if (role === UserRole.ADMIN) {
        // Admin can save protocols
      } else {
        // Check if user is arbitrator for this case
        const isArbitrator = (caseDoc.arbitratorIds && Array.isArray(caseDoc.arbitratorIds) && caseDoc.arbitratorIds.some((arbId: any) => arbId.toString() === userId)) ||
                            ((caseDoc as any).arbitratorId && (caseDoc as any).arbitratorId.toString() === userId);
        
        if (!isArbitrator) {
          return res.status(403).json({ error: 'Only arbitrator can save protocols' });
        }
      }

      // Fetch hearing for date validation
      const hearing = await Hearing.findById(session.hearingId);

      // Legal Requirement #1: Protocol may ONLY be opened and edited on the hearing day itself
      // Legal Principle #2 & #3: Protocol may ONLY be written during ACTIVE hearing with participants
      const sessionPlain = { ...session.toObject(), _id: session._id.toString() };
      const writeGuard = await canWriteProtocol(sessionPlain as any, hearing);
      if (!writeGuard.allowed) {
        return res.status(403).json({ 
          error: writeGuard.error,
          message: writeGuard.message 
        });
      }

      // Legal Principle #3: Validate protocol content doesn't contain decision text
      const contentGuard = validateProtocolContent(content);
      if (!contentGuard.allowed) {
        return res.status(400).json({ 
          error: contentGuard.error,
          message: contentGuard.message 
        });
      }

      // Legal Principle #4: Inject locked participants header
      const contentWithHeader = injectParticipantsHeader(content, session.attendees || []);

      // Legal Principle #7: Versioning is append-only - always create new version
      // Legal Requirement #10: Only one current version exists at any time
      const latestProtocol = await Protocol.findOne({ discussionSessionId: sessionId })
        .sort({ version: -1 });
      const nextVersion = latestProtocol ? latestProtocol.version + 1 : 1;

      // Mark previous version as not current
      if (latestProtocol && latestProtocol.isCurrentVersion) {
        await Protocol.updateMany(
          { discussionSessionId: sessionId, isCurrentVersion: true },
          { $set: { isCurrentVersion: false } }
        );
      }

      const protocol = await Protocol.create({
        discussionSessionId: sessionId,
        caseId: session.caseId,
        content: contentWithHeader,
        version: nextVersion,
        isCurrentVersion: true, // New version becomes current
        createdBy
      });

      // Update session protocol (with header)
      session.protocol = contentWithHeader;
      await session.save();

      await logAction(
        createdBy,
        'protocol_saved',
        'protocol',
        protocol._id.toString(),
        { sessionId, version: nextVersion },
        req
      );

      const populated = await Protocol.findById(protocol._id)
        .populate('createdBy', 'name email')
        .populate('discussionSessionId', 'title startedAt');

      res.status(201).json(populated);
    } catch (error) {
      console.error('Save protocol error:', error);
      res.status(500).json({ error: 'Failed to save protocol' });
    }
  }
);

// Update protocol - DISABLED per Legal Principle #7: Protocol versions are immutable
// Any correction requires creating a NEW VERSION (append-only)
// This endpoint is kept for backward compatibility but returns error
router.patch(
  '/:id',
  [
    body('content').optional().notEmpty(),
    body('version').optional().isNumeric()
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const protocol = await Protocol.findById(req.params.id);
      if (!protocol) {
        return res.status(404).json({ error: 'Protocol not found' });
      }

      // Legal Principle #7: Protocol versions are immutable after creation
      // Any correction requires creating a NEW VERSION (append-only)
      return res.status(403).json({ 
        error: 'PROTOCOL_IMMUTABLE',
        message: 'פרוטוקול אינו ניתן לעריכה לאחר יצירה. תיקונים דורשים יצירת גרסה חדשה. השתמש ב-endpoint של יצירת גרסה חדשה.'
      });
    } catch (error) {
      console.error('Update protocol error:', error);
      res.status(500).json({ error: 'Failed to update protocol' });
    }
  }
);

export default router;

