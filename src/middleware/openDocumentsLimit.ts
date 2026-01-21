/**
 * Legal Requirement #18: No user can work on more than 4 open documents simultaneously
 * 
 * This middleware checks how many documents are currently "open" (in draft status)
 * for the current user and blocks access if limit is exceeded.
 */

import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { Decision } from '../models/Decision';
import { DecisionStatus } from '../types';

const MAX_OPEN_DOCUMENTS = 4;

export const checkOpenDocumentsLimit = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Count open documents (draft status) for this user
    const openDocumentsCount = await Decision.countDocuments({
      createdBy: userId,
      status: DecisionStatus.DRAFT,
      isDeleted: { $ne: true }
    });

    if (openDocumentsCount >= MAX_OPEN_DOCUMENTS) {
      res.status(403).json({
        error: 'OPEN_DOCUMENTS_LIMIT_EXCEEDED',
        message: `אין לאפשר עבודה במקביל על יותר מ-${MAX_OPEN_DOCUMENTS} מסמכים פתוחים. יש לסגור או לחתום על מסמכים קיימים לפני יצירת מסמך חדש.`,
        currentOpenCount: openDocumentsCount,
        maxAllowed: MAX_OPEN_DOCUMENTS
      });
      return;
    }

    next();
  } catch (error) {
    console.error('Open documents limit check error:', error);
    res.status(500).json({ error: 'Failed to check open documents limit' });
  }
};

