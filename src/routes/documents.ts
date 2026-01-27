import express, { Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Document } from '../models/Document';
import { Case } from '../models/Case';
import { authenticate, AuthRequest } from '../middleware/auth';
import { canAccessCase, canAccessDocument } from '../middleware/permissions';
import { logAction } from '../utils/audit';
import { UserRole, DocumentPermission } from '../types';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Configure multer for file uploads
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
    // Allow common document types
    const allowedMimes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'text/plain'
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// Upload document
router.post(
  '/',
  upload.single('file'),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const { caseId, permission, visibleTo, documentType, isSecret, belongsToProcedure } = req.body;
      const uploadedBy = req.user!.userId;

      if (!caseId) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'Missing case ID' });
      }

      // Verify case exists and user has access (after multer processes the body)
      const caseDoc = await Case.findById(caseId);
      if (!caseDoc) {
        // Delete uploaded file
        fs.unlinkSync(req.file.path);
        return res.status(404).json({ error: 'Case not found' });
      }

      // Check permissions
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
        fs.unlinkSync(req.file.path);
        return res.status(403).json({ error: 'Access denied to this case' });
      }

      // Parse visibleTo if provided
      let parsedVisibleTo: string[] | undefined;
      if (visibleTo) {
        try {
          const parsed = JSON.parse(visibleTo);
          if (Array.isArray(parsed) && parsed.length > 0) {
            parsedVisibleTo = parsed;
          }
        } catch (e) {
          // Invalid JSON, ignore
        }
      }

      const document = await Document.create({
        caseId,
        fileName: req.file.filename,
        originalName: req.file.originalname,
        filePath: req.file.path,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        uploadedBy,
        permission: permission || DocumentPermission.ARBITRATOR_ONLY,
        visibleTo: parsedVisibleTo,
        documentType: documentType || undefined,
        isSecret: isSecret === 'true' || isSecret === true,
        belongsToProcedure: belongsToProcedure || undefined
      });

      await logAction(
        uploadedBy,
        'document_uploaded',
        'document',
        document._id.toString(),
        { caseId, fileName: req.file.originalname },
        req
      );

      const populatedDoc = await Document.findById(document._id)
        .populate('uploadedBy', 'name email')
        .populate('visibleTo', 'name email');

      res.status(201).json(populatedDoc);
    } catch (error: any) {
      console.error('Document upload error:', error);
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ error: 'Failed to upload document' });
    }
  }
);

// Get documents for a case
router.get('/case/:caseId', canAccessCase, async (req: AuthRequest, res: Response) => {
  try {
    const { caseId } = req.params;
    const userId = req.user!.userId;
    const role = req.user!.role;

    const caseDoc = await Case.findById(caseId);
    if (!caseDoc) {
      return res.status(404).json({ error: 'Case not found' });
    }

    // Get all documents for case
    let documents = await Document.find({ caseId })
      .populate('uploadedBy', 'name email')
      .populate('visibleTo', 'name email')
      .sort({ createdAt: -1 });

    // Filter based on permissions and role
    // Check if user is arbitrator (check arbitratorIds array)
    const isArbitrator = caseDoc.arbitratorIds && Array.isArray(caseDoc.arbitratorIds) && 
      caseDoc.arbitratorIds.some((arbId: any) => arbId.toString() === userId);
    // Legacy support
    const isLegacyArbitrator = (caseDoc as any).arbitratorId && (caseDoc as any).arbitratorId.toString() === userId;
    
    if (role !== UserRole.ADMIN && !isArbitrator && !isLegacyArbitrator) {
      documents = documents.filter(doc => {
        switch (doc.permission) {
          case DocumentPermission.ARBITRATOR_ONLY:
            return false;
          case DocumentPermission.ALL_PARTIES:
            return true; // User is already verified to be in case
          case DocumentPermission.LAWYERS_ONLY:
            return role === UserRole.LAWYER;
          case DocumentPermission.SPECIFIC_PARTY:
            return doc.visibleTo?.some(id => id.toString() === userId);
          default:
            return false;
        }
      });
    }

    res.json(documents);
  } catch (error) {
    console.error('Fetch documents error:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// Get single document
router.get('/:documentId', canAccessDocument, async (req: AuthRequest, res: Response) => {
  try {
    const document = await Document.findById(req.params.documentId)
      .populate('uploadedBy', 'name email')
      .populate('visibleTo', 'name email');

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json(document);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

// Download document file
router.get('/:documentId/download', canAccessDocument, async (req: AuthRequest, res: Response) => {
  try {
    const document = await Document.findById(req.params.documentId);

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (!fs.existsSync(document.filePath)) {
      return res.status(404).json({ error: 'File not found on server' });
    }

    await logAction(
      req.user!.userId,
      'document_downloaded',
      'document',
      document._id.toString(),
      { fileName: document.originalName },
      req
    );

    // Set CORS headers for PDF.js worker
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Content-Type', document.mimeType || 'application/pdf');

    res.download(document.filePath, document.originalName);
  } catch (error) {
    console.error('Document download error:', error);
    res.status(500).json({ error: 'Failed to download document' });
  }
});

// Update document (permissions, etc.) - Arbitrator or Admin only
router.patch(
  '/:documentId',
  canAccessDocument,
  async (req: AuthRequest, res: Response) => {
    try {
      const { documentId } = req.params;
      const role = req.user!.role;

      // Only arbitrator and admin can update documents
      if (role !== UserRole.ADMIN && role !== UserRole.ARBITRATOR) {
        return res.status(403).json({ error: 'Only arbitrator can update documents' });
      }

      const updates = req.body;
      delete updates._id;
      delete updates.caseId;
      delete updates.fileName;
      delete updates.filePath;
      delete updates.uploadedBy;
      delete updates.createdAt;

      const document = await Document.findByIdAndUpdate(
        documentId,
        { $set: updates },
        { new: true }
      )
        .populate('uploadedBy', 'name email')
        .populate('visibleTo', 'name email');

      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      await logAction(
        req.user!.userId,
        'document_updated',
        'document',
        documentId,
        updates,
        req
      );

      res.json(document);
    } catch (error) {
      console.error('Document update error:', error);
      res.status(500).json({ error: 'Failed to update document' });
    }
  }
);

// Delete document (Arbitrator/Admin only)
router.delete('/:documentId', canAccessDocument, async (req: AuthRequest, res: Response) => {
  try {
    const { documentId } = req.params;
    const role = req.user!.role;

    const document = await Document.findById(documentId);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Only arbitrator and admin can delete documents
    const caseDoc = await Case.findById(document.caseId);
    if (!caseDoc) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const userId = req.user!.userId;
    
    // Check if user is arbitrator (check arbitratorIds array)
    const isArbitrator = caseDoc.arbitratorIds && Array.isArray(caseDoc.arbitratorIds) && 
      caseDoc.arbitratorIds.some((arbId: any) => arbId.toString() === userId);
    // Legacy support
    const isLegacyArbitrator = (caseDoc as any).arbitratorId && (caseDoc as any).arbitratorId.toString() === userId;
    
    if (role !== UserRole.ADMIN && !isArbitrator && !isLegacyArbitrator) {
      return res.status(403).json({ error: 'Only arbitrator can delete documents' });
    }

    // Delete file from filesystem
    if (fs.existsSync(document.filePath)) {
      fs.unlinkSync(document.filePath);
    }

    await Document.findByIdAndDelete(documentId);

    await logAction(
      userId,
      'document_deleted',
      'document',
      documentId,
      { fileName: document.originalName },
      req
    );

    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

export default router;

