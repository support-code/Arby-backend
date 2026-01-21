import express, { Response } from 'express';
import { body, validationResult } from 'express-validator';
import { Case } from '../models/Case';
import { User } from '../models/User';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { canAccessCase } from '../middleware/permissions';
import { logAction } from '../utils/audit';
import { hashPassword } from '../utils/password';
import { generateRandomPassword } from '../utils/passwordGenerator';
import { sendBulkPasswordEmails } from '../utils/email';
import { UserRole, CaseStatus } from '../types';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Create case (Arbitrator or Admin only)
router.post(
  '/',
  authorize(UserRole.ADMIN, UserRole.ARBITRATOR),
  [
    body('title').trim().notEmpty(),
    body('description').optional().trim(),
    body('lawyers').optional().isArray(),
    body('parties').optional().isArray(),
    body('lawyerEmails').optional().isArray(),
    body('lawyerEmails.*').optional().isEmail(),
    body('partyEmails').optional().isArray(),
    body('partyEmails.*').optional().isEmail()
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { title, description, lawyers, parties, lawyerEmails, partyEmails } = req.body;
      const arbitratorId = req.user!.role === UserRole.ADMIN 
        ? (req.body.arbitratorId || req.user!.userId)
        : req.user!.userId;

      let lawyerIds: string[] = lawyers || [];
      let partyIds: string[] = parties || [];
      const createdPasswords: Array<{ email: string; name: string; password: string; role: string }> = [];

      // Create users from emails if provided
      if (lawyerEmails && lawyerEmails.length > 0) {
        for (const email of lawyerEmails) {
          let user = await User.findOne({ email: email.toLowerCase() });
          
          if (!user) {
            // Generate random password
            const password = generateRandomPassword(12);
            const hashedPassword = await hashPassword(password);
            
            // Extract name from email (or use email as name)
            const name = email.split('@')[0] || email;

            user = await User.create({
              email: email.toLowerCase(),
              password: hashedPassword,
              name,
              role: UserRole.LAWYER,
              status: 'active'
            });

            createdPasswords.push({ email: user.email, name: user.name, password, role: 'lawyer' });

            await logAction(
              req.user!.userId,
              'user_created_from_case',
              'user',
              user._id.toString(),
              { email: user.email, name: user.name, role: user.role, caseTitle: title },
              req
            );
          }
          
          if (!lawyerIds.includes(user._id.toString())) {
            lawyerIds.push(user._id.toString());
          }
        }
      }

      if (partyEmails && partyEmails.length > 0) {
        for (const email of partyEmails) {
          let user = await User.findOne({ email: email.toLowerCase() });
          
          if (!user) {
            // Generate random password
            const password = generateRandomPassword(12);
            const hashedPassword = await hashPassword(password);
            
            // Extract name from email (or use email as name)
            const name = email.split('@')[0] || email;

            user = await User.create({
              email: email.toLowerCase(),
              password: hashedPassword,
              name,
              role: UserRole.PARTY,
              status: 'active'
            });

            createdPasswords.push({ email: user.email, name: user.name, password, role: 'party' });

            await logAction(
              req.user!.userId,
              'user_created_from_case',
              'user',
              user._id.toString(),
              { email: user.email, name: user.name, role: user.role, caseTitle: title },
              req
            );
          }
          
          if (!partyIds.includes(user._id.toString())) {
            partyIds.push(user._id.toString());
          }
        }
      }

      // Validate existing users
      if (lawyerIds.length > 0) {
        const lawyersExist = await User.find({
          _id: { $in: lawyerIds },
          role: UserRole.LAWYER
        });
        if (lawyersExist.length !== lawyerIds.length) {
          return res.status(400).json({ error: 'One or more lawyers not found' });
        }
      }

      if (partyIds.length > 0) {
        const partiesExist = await User.find({
          _id: { $in: partyIds },
          role: UserRole.PARTY
        });
        if (partiesExist.length !== partyIds.length) {
          return res.status(400).json({ error: 'One or more parties not found' });
        }
      }

      const caseDoc = await Case.create({
        title,
        description,
        arbitratorId,
        lawyers: lawyerIds,
        parties: partyIds,
        status: CaseStatus.DRAFT
      });

      // Log created passwords
      if (createdPasswords.length > 0) {
        console.log('\n========================================');
        console.log(`🔐 PASSWORDS FOR CASE: ${title}`);
        console.log('========================================');
        createdPasswords.forEach(({ email, password, role }) => {
          console.log(`📧 ${email} (${role}) | 🔑 ${password}`);
        });
        console.log('========================================\n');

        // Send emails with passwords
        await sendBulkPasswordEmails(createdPasswords, title);
      }

      await logAction(
        req.user!.userId,
        'case_created',
        'case',
        caseDoc._id.toString(),
        { title, arbitratorId, createdUsers: createdPasswords.length },
        req
      );

      const populatedCase = await Case.findById(caseDoc._id)
        .populate('arbitratorId', 'name email')
        .populate('lawyers', 'name email')
        .populate('parties', 'name email');

      res.status(201).json({
        case: populatedCase,
        createdPasswords // Return passwords (in production, send emails)
      });
    } catch (error) {
      console.error('Case creation error:', error);
      res.status(500).json({ error: 'Failed to create case' });
    }
  }
);

// Get all cases (filtered by role)
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const role = req.user!.role;

    let query: any = {};

    // Filter based on role
    if (role === UserRole.ADMIN) {
      // Admin sees all
    } else if (role === UserRole.ARBITRATOR) {
      query.arbitratorId = userId;
    } else if (role === UserRole.LAWYER) {
      query.lawyers = userId;
    } else if (role === UserRole.PARTY) {
      query.parties = userId;
    }

    const cases = await Case.find(query)
      .populate('arbitratorId', 'name email')
      .populate('lawyers', 'name email')
      .populate('parties', 'name email')
      .sort({ createdAt: -1 });

    res.json(cases);
  } catch (error) {
    console.error('Fetch cases error:', error);
    res.status(500).json({ error: 'Failed to fetch cases' });
  }
});

// Get single case
router.get('/:caseId', canAccessCase, async (req: AuthRequest, res: Response) => {
  try {
    const caseDoc = await Case.findById(req.params.caseId)
      .populate('arbitratorId', 'name email')
      .populate('lawyers', 'name email')
      .populate('parties', 'name email');

    if (!caseDoc) {
      return res.status(404).json({ error: 'Case not found' });
    }

    res.json(caseDoc);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch case' });
  }
});

// Update case (Arbitrator or Admin only)
router.patch(
  '/:caseId',
  authorize(UserRole.ADMIN, UserRole.ARBITRATOR),
  canAccessCase,
  async (req: AuthRequest, res: Response) => {
    try {
      const { caseId } = req.params;
      const updates = req.body;

      // Remove fields that shouldn't be updated directly
      delete updates.arbitratorId;
      delete updates._id;
      delete updates.createdAt;

      const caseDoc = await Case.findByIdAndUpdate(
        caseId,
        { $set: updates },
        { new: true, runValidators: true }
      )
        .populate('arbitratorId', 'name email')
        .populate('lawyers', 'name email')
        .populate('parties', 'name email');

      if (!caseDoc) {
        return res.status(404).json({ error: 'Case not found' });
      }

      await logAction(
        req.user!.userId,
        'case_updated',
        'case',
        caseId,
        updates,
        req
      );

      res.json(caseDoc);
    } catch (error) {
      console.error('Case update error:', error);
      res.status(500).json({ error: 'Failed to update case' });
    }
  }
);

// Add lawyer to case
router.post(
  '/:caseId/lawyers',
  authorize(UserRole.ADMIN, UserRole.ARBITRATOR),
  canAccessCase,
  [body('lawyerId').isMongoId()],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { caseId } = req.params;
      const { lawyerId } = req.body;

      const lawyer = await User.findById(lawyerId);
      if (!lawyer || lawyer.role !== UserRole.LAWYER) {
        return res.status(400).json({ error: 'Invalid lawyer ID' });
      }

      const caseDoc = await Case.findByIdAndUpdate(
        caseId,
        { $addToSet: { lawyers: lawyerId } },
        { new: true }
      )
        .populate('arbitratorId', 'name email')
        .populate('lawyers', 'name email')
        .populate('parties', 'name email');

      if (!caseDoc) {
        return res.status(404).json({ error: 'Case not found' });
      }

      await logAction(
        req.user!.userId,
        'lawyer_added_to_case',
        'case',
        caseId,
        { lawyerId },
        req
      );

      res.json(caseDoc);
    } catch (error) {
      res.status(500).json({ error: 'Failed to add lawyer' });
    }
  }
);

// Add party to case
router.post(
  '/:caseId/parties',
  authorize(UserRole.ADMIN, UserRole.ARBITRATOR),
  canAccessCase,
  [body('partyId').isMongoId()],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { caseId } = req.params;
      const { partyId } = req.body;

      const party = await User.findById(partyId);
      if (!party || party.role !== UserRole.PARTY) {
        return res.status(400).json({ error: 'Invalid party ID' });
      }

      const caseDoc = await Case.findByIdAndUpdate(
        caseId,
        { $addToSet: { parties: partyId } },
        { new: true }
      )
        .populate('arbitratorId', 'name email')
        .populate('lawyers', 'name email')
        .populate('parties', 'name email');

      if (!caseDoc) {
        return res.status(404).json({ error: 'Case not found' });
      }

      await logAction(
        req.user!.userId,
        'party_added_to_case',
        'case',
        caseId,
        { partyId },
        req
      );

      res.json(caseDoc);
    } catch (error) {
      res.status(500).json({ error: 'Failed to add party' });
    }
  }
);

export default router;

