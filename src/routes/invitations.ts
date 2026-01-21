import express, { Response } from 'express';
import { body, validationResult } from 'express-validator';
import { Invitation } from '../models/Invitation';
import { User } from '../models/User';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { logAction } from '../utils/audit';
import { UserRole } from '../types';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Create invitation (Admin or Arbitrator only)
router.post(
  '/',
  authorize(UserRole.ADMIN, UserRole.ARBITRATOR),
  [
    body('email').isEmail().normalizeEmail(),
    body('role').isIn(Object.values(UserRole)),
    body('caseId').optional().isMongoId()
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, role, caseId } = req.body;
      const invitedBy = req.user!.userId;

      // Check if user already exists
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        return res.status(400).json({ error: 'User with this email already exists' });
      }

      // Check for pending invitation
      const existingInvitation = await Invitation.findOne({
        email: email.toLowerCase(),
        status: 'pending',
        expiresAt: { $gt: new Date() }
      });

      if (existingInvitation) {
        return res.status(400).json({ error: 'Pending invitation already exists for this email' });
      }

      // Create invitation
      const token = uuidv4();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days validity

      const invitation = await Invitation.create({
        email: email.toLowerCase(),
        role,
        caseId,
        invitedBy,
        token,
        expiresAt
      });

      await logAction(
        invitedBy,
        'invitation_created',
        'invitation',
        invitation._id.toString(),
        { email, role, caseId },
        req
      );

      res.status(201).json({
        id: invitation._id,
        email: invitation.email,
        role: invitation.role,
        token: invitation.token, // In production, send via email
        expiresAt: invitation.expiresAt
      });
    } catch (error) {
      console.error('Invitation creation error:', error);
      res.status(500).json({ error: 'Failed to create invitation' });
    }
  }
);

// Get all invitations (Admin only)
router.get(
  '/',
  authorize(UserRole.ADMIN),
  async (req: AuthRequest, res: Response) => {
    try {
      const invitations = await Invitation.find()
        .populate('invitedBy', 'name email')
        .populate('caseId', 'title')
        .sort({ createdAt: -1 });

      res.json(invitations);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch invitations' });
    }
  }
);

// Get invitation by token (public, for registration)
router.get('/token/:token', async (req, res: Response) => {
  try {
    const { token } = req.params;

    const invitation = await Invitation.findOne({ token })
      .populate('invitedBy', 'name email')
      .populate('caseId', 'title');

    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    if (invitation.status !== 'pending') {
      return res.status(400).json({ error: 'Invitation already used or expired' });
    }

    if (invitation.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Invitation expired' });
    }

    res.json({
      id: invitation._id,
      email: invitation.email,
      role: invitation.role,
      caseId: invitation.caseId,
      invitedBy: invitation.invitedBy
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch invitation' });
  }
});

export default router;

