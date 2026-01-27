import express, { Response } from 'express';
import { body, validationResult } from 'express-validator';
import { Case } from '../models/Case';
import { User } from '../models/User';
import { Company } from '../models/Company';
import { CaseParty } from '../models/CaseParty';
import { CaseLawyer } from '../models/CaseLawyer';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { canAccessCase } from '../middleware/permissions';
import { logAction } from '../utils/audit';
import { hashPassword } from '../utils/password';
import { generateRandomPassword } from '../utils/passwordGenerator';
import { sendBulkPasswordEmails } from '../utils/email';
import { UserRole, CaseStatus, PartyStatus } from '../types';
import { generateCaseTitle } from '../utils/caseTitleGenerator';
import { generateCaseNumber } from '../utils/caseNumberGenerator';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Create case (Arbitrator or Admin only)
// New API supports: arbitratorIds, parties (with full details), lawyers (with full details)
router.post(
  '/',
  authorize(UserRole.ADMIN, UserRole.ARBITRATOR),
  [
    body('title').optional().trim(), // Optional - can be auto-generated
    body('description').optional().trim(),
    body('arbitratorIds').optional().isArray(), // Optional - if not provided, uses current user
    body('arbitratorIds.*').optional().isMongoId(),
    // New structure: parties array with full details
    body('parties').isArray().notEmpty(),
    body('parties.*.isCompany').isBoolean(),
    body('parties.*.status').isIn(Object.values(PartyStatus)),
    // For person parties
    body('parties.*.firstName').optional().trim(),
    body('parties.*.lastName').optional().trim(),
    body('parties.*.idNumber').optional().trim(),
    body('parties.*.address').optional().trim(),
    body('parties.*.phone').optional().trim(),
    body('parties.*.email').optional().isEmail(),
    // For company parties
    body('parties.*.companyName').optional().trim(),
    body('parties.*.companyNumber').optional().trim(),
    body('parties.*.authorizedSignatories').optional().isArray(),
    body('parties.*.signatureDocumentReceived').optional().isBoolean(),
    // Lawyers for each party
    body('parties.*.lawyers').optional().isArray(),
    body('parties.*.lawyers.*.firstName').optional().trim(),
    body('parties.*.lawyers.*.lastName').optional().trim(),
    body('parties.*.lawyers.*.email').optional().isEmail(),
    body('parties.*.lawyers.*.profession').optional().trim(),
    // Legacy support (deprecated)
    body('lawyers').optional().isArray(),
    body('lawyerEmails').optional().isArray(),
    body('partyEmails').optional().isArray()
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        console.error('Validation errors:', errors.array());
        return res.status(400).json({ errors: errors.array() });
      }

      const { 
        title, 
        description, 
        arbitratorIds: reqArbitratorIds,
        parties: reqParties,
        // Legacy support
        lawyers, 
        parties: legacyParties, 
        lawyerEmails, 
        partyEmails 
      } = req.body;

      console.log('Received case creation request:', {
        hasArbitratorIds: !!reqArbitratorIds,
        arbitratorIdsLength: reqArbitratorIds?.length || 0,
        hasParties: !!reqParties,
        partiesLength: reqParties?.length || 0
      });

      // Determine arbitrator IDs
      let arbitratorIds: string[] = [];
      if (reqArbitratorIds && reqArbitratorIds.length > 0) {
        arbitratorIds = reqArbitratorIds;
      } else {
        // Fallback to current user if admin/arbitrator
        arbitratorIds = [req.user!.userId];
      }

      // Validate arbitrators exist and are arbitrators
      const arbitrators = await User.find({
        _id: { $in: arbitratorIds },
        role: UserRole.ARBITRATOR
      });
      if (arbitrators.length !== arbitratorIds.length) {
        return res.status(400).json({ error: 'One or more arbitrators not found or invalid role' });
      }

      // Validate odd number of arbitrators
      if (arbitratorIds.length % 2 === 0) {
        return res.status(400).json({ error: 'Number of arbitrators must be odd' });
      }

      // Validate parties exist
      if (!reqParties || reqParties.length === 0) {
        return res.status(400).json({ error: 'At least one party is required' });
      }

      const createdPasswords: Array<{ email: string; name: string; password: string; role: string }> = [];
      const casePartyIds: string[] = [];
      const caseLawyerIds: string[] = [];
      // Initialize legacy arrays for backward compatibility
      const lawyerIds: string[] = [];
      const partyIds: string[] = [];

      // Process parties (new structure)
      if (reqParties && reqParties.length > 0) {
        for (let partyIndex = 0; partyIndex < reqParties.length; partyIndex++) {
          const partyData = reqParties[partyIndex];
          let caseParty;
          
          if (partyData.isCompany) {
            // Validate company data
            if (!partyData.companyName || !partyData.companyNumber) {
              throw new Error(`Company party ${partyIndex + 1} must have companyName and companyNumber`);
            }

            // Create or find company
            let company = await Company.findOne({ companyNumber: partyData.companyNumber });
            
            if (!company) {
              company = await Company.create({
                companyName: partyData.companyName,
                companyNumber: partyData.companyNumber,
                address: partyData.address || '',
                phone: partyData.phone,
                email: partyData.email,
                status: partyData.status,
                authorizedSignatories: partyData.authorizedSignatories || [],
                signatureDocumentReceived: partyData.signatureDocumentReceived || false
              });
            }

            // Create CaseParty for company
            caseParty = await CaseParty.create({
              caseId: null as any, // Will update after case creation
              companyId: company._id,
              isCompany: true,
              status: partyData.status
            });
          } else {
            // Validate person data
            if (!partyData.firstName || !partyData.lastName) {
              throw new Error(`Person party ${partyIndex + 1} must have firstName and lastName`);
            }

            // Create or find user for person party
            let user;
            if (partyData.email) {
              user = await User.findOne({ email: partyData.email.toLowerCase() });
              
              if (!user) {
                const password = generateRandomPassword(12);
                const hashedPassword = await hashPassword(password);
                const fullName = `${partyData.firstName || ''} ${partyData.lastName || ''}`.trim() || partyData.email.split('@')[0];

                user = await User.create({
                  email: partyData.email.toLowerCase(),
                  password: hashedPassword,
                  name: fullName,
                  firstName: partyData.firstName,
                  lastName: partyData.lastName,
                  idNumber: partyData.idNumber,
                  address: partyData.address,
                  phone: partyData.phone,
                  role: UserRole.PARTY,
                  status: 'active'
                });

                createdPasswords.push({ 
                  email: user.email, 
                  name: user.name, 
                  password, 
                  role: 'party' 
                });
              }
            }

            // Create CaseParty for person
            caseParty = await CaseParty.create({
              caseId: null as any, // Will update after case creation
              userId: user?._id,
              isCompany: false,
              status: partyData.status,
              firstName: partyData.firstName,
              lastName: partyData.lastName,
              idNumber: partyData.idNumber,
              address: partyData.address,
              phone: partyData.phone,
              email: partyData.email
            });
          }

          casePartyIds.push(caseParty._id.toString());

          // Process lawyers for this party
          if (partyData.lawyers && partyData.lawyers.length > 0) {
            for (const lawyerData of partyData.lawyers) {
              // Validate lawyer data
              if (!lawyerData.firstName || !lawyerData.lastName || !lawyerData.email) {
                console.warn('Skipping invalid lawyer data:', lawyerData);
                continue;
              }

              // Create or find lawyer user
              let lawyerUser = await User.findOne({ email: lawyerData.email.toLowerCase() });
              
              if (!lawyerUser) {
                const password = generateRandomPassword(12);
                const hashedPassword = await hashPassword(password);
                const fullName = `${lawyerData.firstName} ${lawyerData.lastName}`.trim();

                lawyerUser = await User.create({
                  email: lawyerData.email.toLowerCase(),
                  password: hashedPassword,
                  name: fullName,
                  firstName: lawyerData.firstName,
                  lastName: lawyerData.lastName,
                  idNumber: lawyerData.idNumber,
                  address: lawyerData.address,
                  phone: lawyerData.phone,
                  profession: lawyerData.profession || 'עורך דין',
                  role: UserRole.LAWYER,
                  status: 'active'
                });

                createdPasswords.push({ 
                  email: lawyerUser.email, 
                  name: lawyerUser.name, 
                  password, 
                  role: 'lawyer' 
                });
              }

              // Create CaseLawyer
              const caseLawyer = await CaseLawyer.create({
                caseId: null as any, // Will update after case creation
                userId: lawyerUser._id,
                partyId: caseParty._id,
                firstName: lawyerData.firstName,
                lastName: lawyerData.lastName,
                idNumber: lawyerData.idNumber,
                address: lawyerData.address,
                phone: lawyerData.phone,
                email: lawyerData.email,
                profession: lawyerData.profession || 'עורך דין',
                status: `ב"כ ${partyData.status}`
              });

              caseLawyerIds.push(caseLawyer._id.toString());
            }
          }
        }
      }

      // Legacy support: Create users from emails if provided
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

      // Generate title if not provided
      let caseTitle = title;
      if (!caseTitle && reqParties && reqParties.length > 0) {
        const partiesForTitle = reqParties.map((p: any) => ({
          isCompany: p.isCompany,
          status: p.status,
          name: p.isCompany ? p.companyName : `${p.firstName || ''} ${p.lastName || ''}`.trim(),
          companyName: p.companyName
        }));
        caseTitle = generateCaseTitle(partiesForTitle);
      } else if (!caseTitle) {
        caseTitle = 'תיק בוררות';
      }

      // Generate unique case number
      const creationDate = new Date();
      let clientId: string | undefined;
      
      // Get client ID from first party
      if (reqParties && reqParties.length > 0) {
        const firstParty = reqParties[0];
        if (firstParty.isCompany && firstParty.companyNumber) {
          clientId = firstParty.companyNumber;
        } else if (firstParty.idNumber) {
          clientId = firstParty.idNumber;
        }
      }
      
      const caseNumber = await generateCaseNumber(creationDate, clientId);

      console.log('Creating case with:', {
        title: caseTitle,
        arbitratorIds,
        casePartyIds: casePartyIds.length,
        caseLawyerIds: caseLawyerIds.length,
        caseNumber
      });

      // Create case
      const caseDoc = await Case.create({
        title: caseTitle,
        description,
        arbitratorIds,
        caseParties: casePartyIds.length > 0 ? casePartyIds : undefined,
        caseLawyers: caseLawyerIds.length > 0 ? caseLawyerIds : undefined,
        caseNumber, // Add the generated case number
        // Legacy support
        lawyers: lawyerIds.length > 0 ? lawyerIds : undefined,
        parties: partyIds.length > 0 ? partyIds : undefined,
        status: CaseStatus.DRAFT
      });

      console.log('Case created successfully:', caseDoc._id);

      // Update CaseParty and CaseLawyer with caseId
      if (casePartyIds.length > 0) {
        await CaseParty.updateMany(
          { _id: { $in: casePartyIds } },
          { $set: { caseId: caseDoc._id } }
        );
      }
      if (caseLawyerIds.length > 0) {
        await CaseLawyer.updateMany(
          { _id: { $in: caseLawyerIds } },
          { $set: { caseId: caseDoc._id } }
        );
      }

      // Log created passwords
      if (createdPasswords.length > 0) {
        console.log('\n========================================');
        console.log(`🔐 PASSWORDS FOR CASE: ${caseTitle}`);
        console.log('========================================');
        createdPasswords.forEach(({ email, password, role }) => {
          console.log(`📧 ${email} (${role}) | 🔑 ${password}`);
        });
        console.log('========================================\n');

        // Send emails with passwords
        await sendBulkPasswordEmails(createdPasswords, caseTitle);
      }

      await logAction(
        req.user!.userId,
        'case_created',
        'case',
        caseDoc._id.toString(),
        { title: caseTitle, arbitratorIds, createdUsers: createdPasswords.length },
        req
      );

      const populatedCase = await Case.findById(caseDoc._id)
        .populate('arbitratorIds', 'name email firstName lastName')
        .populate('caseParties')
        .populate('caseLawyers')
        .populate('lawyers', 'name email')
        .populate('parties', 'name email');

      res.status(201).json({
        case: populatedCase,
        createdPasswords // Return passwords (in production, send emails)
      });
    } catch (error: any) {
      console.error('Case creation error:', error);
      console.error('Error stack:', error.stack);
      console.error('Error message:', error.message);
      res.status(500).json({ 
        error: 'Failed to create case',
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
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
      query.arbitratorIds = userId;
    } else if (role === UserRole.LAWYER) {
      query.lawyers = userId;
    } else if (role === UserRole.PARTY) {
      query.parties = userId;
    }

    const cases = await Case.find(query)
      .populate('arbitratorIds', 'name email firstName lastName')
      .populate('caseParties')
      .populate('caseLawyers')
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
      .populate('arbitratorIds', 'name email firstName lastName')
      .populate({
        path: 'caseParties',
        populate: {
          path: 'companyId',
          select: 'companyName companyNumber address phone email'
        }
      })
      .populate({
        path: 'caseLawyers',
        select: 'firstName lastName idNumber address phone email profession status partyId'
      })
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
      delete updates.arbitratorIds;
      delete updates._id;
      delete updates.createdAt;

      const caseDoc = await Case.findByIdAndUpdate(
        caseId,
        { $set: updates },
        { new: true, runValidators: true }
      )
        .populate('arbitratorIds', 'name email firstName lastName')
        .populate('caseParties')
        .populate('caseLawyers')
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
        .populate('arbitratorIds', 'name email firstName lastName')
        .populate('caseParties')
        .populate('caseLawyers')
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
        .populate('arbitratorIds', 'name email firstName lastName')
        .populate('caseParties')
        .populate('caseLawyers')
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

