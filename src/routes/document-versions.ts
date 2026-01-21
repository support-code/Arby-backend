import express, { Response } from 'express';
import { body, validationResult } from 'express-validator';
import { DocumentVersion } from '../models/DocumentVersion';
import { Document } from '../models/Document';
import { Case } from '../models/Case';
import { authenticate, AuthRequest } from '../middleware/auth';
import { canAccessDocument } from '../middleware/permissions';
import { logAction } from '../utils/audit';
import { UserRole } from '../types';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = express.Router();

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
  }
});

// Get all versions for a document
router.get('/document/:documentId', canAccessDocument, async (req: AuthRequest, res: Response) => {
  try {
    const { documentId } = req.params;
    const versions = await DocumentVersion.find({ documentId })
      .populate('createdBy', 'name email')
      .sort({ version: -1 });
    
    res.json(versions);
  } catch (error) {
    console.error('Fetch document versions error:', error);
    res.status(500).json({ error: 'Failed to fetch document versions' });
  }
});

// Create new version
router.post(
  '/',
  canAccessDocument,
  upload.single('file'),
  [
    body('documentId').notEmpty(),
    body('changes').optional().trim()
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const { documentId, changes } = req.body;
      const userId = req.user!.userId;

      // Get document to check access and get current version
      const document = await Document.findById(documentId);
      if (!document) {
        fs.unlinkSync(req.file.path);
        return res.status(404).json({ error: 'Document not found' });
      }

      // Check if user can create version (arbitrator/admin or document owner)
      const caseDoc = await Case.findById(document.caseId);
      if (!caseDoc) {
        fs.unlinkSync(req.file.path);
        return res.status(404).json({ error: 'Case not found' });
      }

      const role = req.user!.role;
      const isArbitrator = role === UserRole.ADMIN || 
                           caseDoc.arbitratorId.toString() === userId;
      const isOwner = document.uploadedBy.toString() === userId;

      if (!isArbitrator && !isOwner) {
        fs.unlinkSync(req.file.path);
        return res.status(403).json({ error: 'Access denied' });
      }

      // Get next version number
      const latestVersion = await DocumentVersion.findOne({ documentId })
        .sort({ version: -1 });
      const nextVersion = latestVersion ? latestVersion.version + 1 : document.version + 1;

      // Create version record
      const version = await DocumentVersion.create({
        documentId,
        version: nextVersion,
        filePath: req.file.path,
        changes,
        createdBy: userId
      });

      // Update document version
      await Document.findByIdAndUpdate(documentId, { version: nextVersion });

      await logAction(
        userId,
        'document_version_created',
        'document_version',
        version._id.toString(),
        { documentId, version: nextVersion },
        req
      );

      const populated = await DocumentVersion.findById(version._id)
        .populate('createdBy', 'name email');

      res.status(201).json(populated);
    } catch (error) {
      console.error('Create document version error:', error);
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ error: 'Failed to create document version' });
    }
  }
);

// Download version
router.get('/:id/download', async (req: AuthRequest, res: Response) => {
  try {
    const version = await DocumentVersion.findById(req.params.id)
      .populate('documentId');
    
    if (!version) {
      return res.status(404).json({ error: 'Version not found' });
    }

    const document = version.documentId as any;
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Check access to document
    const caseDoc = await Case.findById(document.caseId);
    if (!caseDoc) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const userId = req.user!.userId;
    const role = req.user!.role;
    
    if (role !== UserRole.ADMIN && 
        caseDoc.arbitratorId.toString() !== userId &&
        !caseDoc.lawyers.some(l => l.toString() === userId) &&
        !caseDoc.parties.some(p => p.toString() === userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!fs.existsSync(version.filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.download(version.filePath, document.originalName);
  } catch (error) {
    console.error('Download version error:', error);
    res.status(500).json({ error: 'Failed to download version' });
  }
});

export default router;

