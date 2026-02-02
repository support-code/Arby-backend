import express, { Response } from 'express';
import { body, validationResult } from 'express-validator';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request } from '../models/Request';
import { Case } from '../models/Case';
import { Decision } from '../models/Decision';
import { Document } from '../models/Document';
import { Annotation } from '../models/Annotation';
import { authenticate, AuthRequest } from '../middleware/auth';
import { canAccessCase } from '../middleware/permissions';
import { logAction } from '../utils/audit';
import { RequestType, RequestStatus, UserRole, DecisionType, DecisionStatus, DocumentPermission } from '../types';
import { generateAnnotatedPdfFromRequest } from '../services/pdfAnnotationService';

const router = express.Router();

router.use(authenticate);

// Configure multer for PDF uploads
const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760') // 10MB default
  },
  fileFilter: (req, file, cb) => {
    // Only allow PDFs for request attachments
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed for request attachments'));
    }
  }
});

// Get all requests for a case
router.get('/case/:caseId', canAccessCase, async (req: AuthRequest, res: Response) => {
  try {
    const { caseId } = req.params;
    const userId = req.user!.userId;
    const role = req.user!.role;
    
    // Get case to check arbitrator status
    const caseDoc = await Case.findById(caseId);
    if (!caseDoc) {
      return res.status(404).json({ error: 'Case not found' });
    }
    
    const isArbitrator = caseDoc.arbitratorIds && Array.isArray(caseDoc.arbitratorIds) && 
      caseDoc.arbitratorIds.some((arbId: any) => arbId.toString() === userId);
    const isLegacyArbitrator = (caseDoc as any).arbitratorId && (caseDoc as any).arbitratorId.toString() === userId;
    
    const allRequests = await Request.find({ caseId })
      .populate('submittedBy', 'name email')
      .populate('respondedBy', 'name email')
      .populate('visibleTo', 'name email')
      .sort({ createdAt: -1 });
    
    // Filter confidential requests based on permissions
    const requests = allRequests.filter((request: any) => {
      // Admin and arbitrator can see all requests
      if (role === UserRole.ADMIN || isArbitrator || isLegacyArbitrator) return true;
      
      // If request is not confidential, everyone with case access can see it
      if (!request.isConfidential) return true;
      
      // If confidential, check if user is in visibleTo list or is the submitter
      if (request.submittedBy && request.submittedBy._id && request.submittedBy._id.toString() === userId) return true;
      
      if (request.visibleTo && Array.isArray(request.visibleTo)) {
        return request.visibleTo.some((user: any) => {
          const userIdStr = typeof user === 'object' && user._id ? user._id.toString() : user.toString();
          return userIdStr === userId;
        });
      }
      
      return false;
    });
    
    res.json(requests);
  } catch (error) {
    console.error('Fetch requests error:', error);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// Get single request
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const request = await Request.findById(req.params.id)
      .populate('submittedBy', 'name email')
      .populate('respondedBy', 'name email')
      .populate('caseId', 'title')
      .populate('attachments', 'originalName fileName mimeType fileSize');
    
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
    
    // Check basic case access
    const hasCaseAccess = role === UserRole.ADMIN || 
      isArbitrator || isLegacyArbitrator ||
      caseDoc.lawyers.some(l => l.toString() === userId) ||
      caseDoc.parties.some(p => p.toString() === userId);
    
    if (!hasCaseAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // If request is confidential, check additional permissions
    if (request.isConfidential) {
      const canAccessConfidential = role === UserRole.ADMIN || 
        isArbitrator || isLegacyArbitrator ||
        (request.submittedBy && request.submittedBy.toString() === userId) ||
        (request.visibleTo && Array.isArray(request.visibleTo) && 
         request.visibleTo.some((uid: any) => uid.toString() === userId));
      
      if (!canAccessConfidential) {
        return res.status(403).json({ error: 'Access denied to confidential request' });
      }
    }

    res.json(request);
  } catch (error) {
    console.error('Fetch request error:', error);
    res.status(500).json({ error: 'Failed to fetch request' });
  }
});

// Get request attachments
router.get('/:id/attachments', async (req: AuthRequest, res: Response) => {
  try {
    const request = await Request.findById(req.params.id);
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
    
    // Check basic case access
    const hasCaseAccess = role === UserRole.ADMIN || 
      isArbitrator || isLegacyArbitrator ||
      caseDoc.lawyers.some(l => l.toString() === userId) ||
      caseDoc.parties.some(p => p.toString() === userId);
    
    if (!hasCaseAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // If request is confidential, check additional permissions
    if (request.isConfidential) {
      const canAccessConfidential = role === UserRole.ADMIN || 
        isArbitrator || isLegacyArbitrator ||
        (request.submittedBy && request.submittedBy.toString() === userId) ||
        (request.visibleTo && Array.isArray(request.visibleTo) && 
         request.visibleTo.some((uid: any) => uid.toString() === userId));
      
      if (!canAccessConfidential) {
        return res.status(403).json({ error: 'Access denied to confidential request' });
      }
    }

    // Check if attachments should be hidden
    if (request.hideAttachments) {
      // Only admin and arbitrator can see hidden attachments
      if (role !== UserRole.ADMIN && !isArbitrator && !isLegacyArbitrator) {
        return res.json([]); // Return empty array for non-authorized users
      }
    }
    
    if (!request.attachments || request.attachments.length === 0) {
      return res.json([]);
    }

    const attachments = await Document.find({
      _id: { $in: request.attachments }
    }).populate('uploadedBy', 'name email');

    res.json(attachments);
  } catch (error) {
    console.error('Fetch request attachments error:', error);
    res.status(500).json({ error: 'Failed to fetch request attachments' });
  }
});

// Create request (with optional PDF attachments)
router.post(
  '/',
  upload.array('pdfs', 10), // Allow up to 10 PDF files - must run before canAccessCase to parse FormData
  canAccessCase, // Run after multer so req.body is parsed
  [
    body('caseId').notEmpty(),
    body('type').isIn(Object.values(RequestType)),
    body('title').trim().notEmpty(),
    body('content').trim().notEmpty()
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        // Clean up uploaded files if validation fails
        if (req.files && Array.isArray(req.files)) {
          req.files.forEach((file: Express.Multer.File) => {
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
          });
        }
        return res.status(400).json({ errors: errors.array() });
      }

      const { caseId, type, title, content, isConfidential, visibleTo, hideAttachments } = req.body;
      const submittedBy = req.user!.userId;

      // Verify case exists and user has access
      const caseDoc = await Case.findById(caseId);
      if (!caseDoc) {
        // Clean up uploaded files
        if (req.files && Array.isArray(req.files)) {
          req.files.forEach((file: Express.Multer.File) => {
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
          });
        }
        return res.status(404).json({ error: 'Case not found' });
      }

      // Create Document entries for uploaded PDFs
      const attachmentIds: string[] = [];
      if (req.files && Array.isArray(req.files) && req.files.length > 0) {
        for (const file of req.files as Express.Multer.File[]) {
          const document = await Document.create({
            caseId,
            fileName: file.filename,
            originalName: file.originalname,
            filePath: file.path,
            fileSize: file.size,
            mimeType: file.mimetype,
            uploadedBy: submittedBy,
            permission: DocumentPermission.ARBITRATOR_ONLY, // PDFs attached to requests are arbitrator-only initially
            documentType: 'attachment'
          });
          attachmentIds.push(document._id.toString());
        }
      }

      const request = await Request.create({
        caseId,
        type,
        title,
        content,
        status: RequestStatus.PENDING,
        submittedBy,
        attachments: attachmentIds.length > 0 ? attachmentIds : undefined,
        isConfidential: isConfidential === true || isConfidential === 'true',
        visibleTo: visibleTo && Array.isArray(visibleTo) ? visibleTo : undefined,
        hideAttachments: hideAttachments === true || hideAttachments === 'true'
      });

      await logAction(
        submittedBy,
        'request_created',
        'request',
        request._id.toString(),
        { caseId, type, title, attachmentsCount: attachmentIds.length },
        req
      );

      const populated = await Request.findById(request._id)
        .populate('submittedBy', 'name email')
        .populate('attachments', 'originalName fileName mimeType fileSize');

      res.status(201).json(populated);
    } catch (error) {
      console.error('Create request error:', error);
      // Clean up uploaded files on error
      if (req.files && Array.isArray(req.files)) {
        req.files.forEach((file: Express.Multer.File) => {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        });
      }
      res.status(500).json({ error: 'Failed to create request' });
    }
  }
);

// Respond to request (Arbitrator/Admin only)
router.patch(
  '/:id/respond',
  [
    body('status').isIn([RequestStatus.APPROVED, RequestStatus.REJECTED, RequestStatus.UNDER_REVIEW]),
    body('response').optional().trim()
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const request = await Request.findById(req.params.id);
      if (!request) {
        return res.status(404).json({ error: 'Request not found' });
      }

      // Check if user is arbitrator or admin
      const caseDoc = await Case.findById(request.caseId);
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
        return res.status(403).json({ error: 'Only arbitrator can respond to requests' });
      }

      const updates: any = {
        status: req.body.status,
        respondedBy: userId,
        responseDate: new Date()
      };
      if (req.body.response) {
        updates.response = req.body.response;
      }

      const updated = await Request.findByIdAndUpdate(
        req.params.id,
        updates,
        { new: true }
      ).populate('submittedBy', 'name email')
       .populate('respondedBy', 'name email');

      await logAction(
        userId,
        'request_responded',
        'request',
        request._id.toString(),
        { status: req.body.status },
        req
      );

      res.json(updated);
    } catch (error) {
      console.error('Respond to request error:', error);
      res.status(500).json({ error: 'Failed to respond to request' });
    }
  }
);

// Create decision from request (Arbitrator/Admin only)
router.post(
  '/:id/decision',
  [
    body('title').trim().notEmpty(),
    body('content').trim().notEmpty(),
    body('isFinalDecision').optional().isBoolean(),
    body('closesCase').optional().isBoolean()
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const request = await Request.findById(req.params.id);
      if (!request) {
        return res.status(404).json({ error: 'Request not found' });
      }

      // Check if user is arbitrator or admin
      const caseDoc = await Case.findById(request.caseId);
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
        return res.status(403).json({ error: 'Only arbitrator can create decisions from requests' });
      }

      const { title, content, isFinalDecision, closesCase } = req.body;

      // Determine decision type
      const decisionType = isFinalDecision ? DecisionType.FINAL_DECISION : DecisionType.NOTE_DECISION;

      // Create decision
      const decision = await Decision.create({
        caseId: request.caseId,
        type: decisionType,
        title,
        content,
        requestId: request._id,
        closesCase: closesCase || false,
        closesDiscussion: isFinalDecision || false,
        status: DecisionStatus.DRAFT,
        createdBy: userId
      });

      // If decision closes case, update case status
      if (closesCase) {
        await Case.findByIdAndUpdate(request.caseId, {
          status: 'closed'
        });
      }

      // If request has attachments with annotations, generate annotated PDFs
      let annotatedPdfDocumentId: string | undefined;
      if (request.attachments && request.attachments.length > 0) {
        try {
          // Check if any attachments have annotations
          for (const attachmentId of request.attachments) {
            const annotationCount = await Annotation.countDocuments({
              requestId: request._id.toString(),
              documentId: attachmentId.toString(),
              isDeleted: { $ne: true }
            });

            if (annotationCount > 0) {
              // Generate annotated PDF for the first document with annotations
              const annotatedDoc = await generateAnnotatedPdfFromRequest(
                request._id.toString(),
                attachmentId.toString(),
                decision._id.toString()
              );
              annotatedPdfDocumentId = annotatedDoc._id.toString();
              break; // Use first annotated PDF
            }
          }
        } catch (error) {
          console.error('Error generating annotated PDF:', error);
          // Don't fail the decision creation if PDF generation fails
        }
      }

      // Update decision with annotated PDF document ID if generated
      if (annotatedPdfDocumentId) {
        await Decision.findByIdAndUpdate(decision._id, {
          annotatedPdfDocumentId
        });
      }

      // Update request status to approved if decision was created
      await Request.findByIdAndUpdate(request._id, {
        status: RequestStatus.APPROVED,
        respondedBy: userId,
        responseDate: new Date()
      });

      await logAction(
        userId,
        'decision_created_from_request',
        'decision',
        decision._id.toString(),
        { requestId: request._id.toString(), title, type: decisionType, closesCase },
        req
      );

      const populated = await Decision.findById(decision._id)
        .populate('createdBy', 'name email')
        .populate('requestId', 'title type');

      res.status(201).json(populated);
    } catch (error) {
      console.error('Create decision from request error:', error);
      res.status(500).json({ error: 'Failed to create decision from request' });
    }
  }
);

export default router;

