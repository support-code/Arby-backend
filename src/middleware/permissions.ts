import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { Case } from '../models/Case';
import { Document } from '../models/Document';
import { UserRole } from '../types';

// Check if user can access a case
export const canAccessCase = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const caseId = req.params.caseId || req.body.caseId;
    const userId = req.user?.userId;

    if (!userId || !caseId) {
      res.status(400).json({ error: 'Missing case ID or user ID' });
      return;
    }

    // Admin can access everything
    if (req.user?.role === UserRole.ADMIN) {
      return next();
    }

    const caseDoc = await Case.findById(caseId);

    if (!caseDoc) {
      res.status(404).json({ error: 'Case not found' });
      return;
    }

    // Arbitrator owns the case (check arbitratorIds array)
    if (caseDoc.arbitratorIds && Array.isArray(caseDoc.arbitratorIds) && caseDoc.arbitratorIds.some((arbId: any) => arbId.toString() === userId)) {
      return next();
    }

    // Legacy support: check arbitratorId if exists
    if ((caseDoc as any).arbitratorId && (caseDoc as any).arbitratorId.toString() === userId) {
      return next();
    }

    // Lawyer assigned to case (check both legacy lawyers and caseLawyers)
    const lawyerIds = caseDoc.lawyers || [];
    if (lawyerIds.some((lawyerId: any) => lawyerId.toString() === userId)) {
      return next();
    }

    // Check caseLawyers if exists
    if (caseDoc.caseLawyers && caseDoc.caseLawyers.length > 0) {
      const { CaseLawyer } = require('../models/CaseLawyer');
      const caseLawyers = await CaseLawyer.find({ 
        caseId: caseDoc._id,
        userId: userId 
      });
      if (caseLawyers.length > 0) {
        return next();
      }
    }

    // Party in case (check both legacy parties and caseParties)
    const partyIds = caseDoc.parties || [];
    if (partyIds.some((partyId: any) => partyId.toString() === userId)) {
      return next();
    }

    // Check caseParties if exists
    if (caseDoc.caseParties && caseDoc.caseParties.length > 0) {
      const { CaseParty } = require('../models/CaseParty');
      const caseParties = await CaseParty.find({ 
        caseId: caseDoc._id,
        userId: userId 
      });
      if (caseParties.length > 0) {
        return next();
      }
    }

    res.status(403).json({ error: 'Access denied to this case' });
  } catch (error) {
    res.status(500).json({ error: 'Permission check failed' });
  }
};

// Check if user can access a document
export const canAccessDocument = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const documentId = req.params.documentId || req.body.documentId;
    const userId = req.user?.userId;

    if (!userId || !documentId) {
      res.status(400).json({ error: 'Missing document ID or user ID' });
      return;
    }

    const document = await Document.findById(documentId).populate('caseId');

    if (!document) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    const caseDoc = await Case.findById(document.caseId);

    if (!caseDoc) {
      res.status(404).json({ error: 'Case not found' });
      return;
    }

    // Admin can access everything
    if (req.user?.role === UserRole.ADMIN) {
      return next();
    }

    // Arbitrator always has access (check arbitratorIds array)
    if (caseDoc.arbitratorIds && caseDoc.arbitratorIds.some((arbId: any) => arbId.toString() === userId)) {
      return next();
    }
    // Legacy support
    if ((caseDoc as any).arbitratorId && (caseDoc as any).arbitratorId.toString() === userId) {
      return next();
    }

    // Check document permissions
    switch (document.permission) {
      case 'arbitrator_only':
        res.status(403).json({ error: 'Document is arbitrator-only' });
        return;

      case 'all_parties':
        // Check if user is lawyer or party in case
        const isLawyer = caseDoc.lawyers.some(lawyerId => lawyerId.toString() === userId);
        const isParty = caseDoc.parties.some(partyId => partyId.toString() === userId);
        if (isLawyer || isParty) {
          return next();
        }
        break;

      case 'lawyers_only':
        if (caseDoc.lawyers.some(lawyerId => lawyerId.toString() === userId)) {
          return next();
        }
        break;

      case 'specific_party':
        if (document.visibleTo?.some(id => id.toString() === userId)) {
          return next();
        }
        break;
    }

    res.status(403).json({ error: 'Access denied to this document' });
  } catch (error) {
    res.status(500).json({ error: 'Permission check failed' });
  }
};

