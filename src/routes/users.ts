import express, { Response } from 'express';
import { body, validationResult } from 'express-validator';
import { User } from '../models/User';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { logAction } from '../utils/audit';
import { hashPassword } from '../utils/password';
import { generateRandomPassword } from '../utils/passwordGenerator';
import { sendPasswordEmail } from '../utils/email';
import { UserRole } from '../types';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get all users (Admin only)
router.get(
  '/',
  authorize(UserRole.ADMIN),
  async (req: AuthRequest, res: Response) => {
    try {
      const users = await User.find()
        .select('-password')
        .sort({ createdAt: -1 });

      // Transform _id to id for frontend compatibility
      const transformedUsers = users.map(user => ({
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }));

      res.json(transformedUsers);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  }
);

// Get user by ID
router.get('/:userId', async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user!.userId;
    const role = req.user!.role;

    // Users can only see their own profile unless admin
    if (role !== UserRole.ADMIN && userId !== currentUserId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const user = await User.findById(userId).select('-password');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Create user with auto-generated password (Admin only)
router.post(
  '/',
  authorize(UserRole.ADMIN),
  [
    body('email').isEmail().normalizeEmail(),
    body('name').trim().notEmpty(),
    body('role').isIn(Object.values(UserRole))
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, name, role } = req.body;

      // Check if user already exists
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        return res.status(400).json({ error: 'User with this email already exists' });
      }

      // Generate random password
      const password = generateRandomPassword(12);
      const hashedPassword = await hashPassword(password);

      // Create user
      const user = await User.create({
        email: email.toLowerCase(),
        password: hashedPassword,
        name,
        role,
        status: 'active'
      });

      // Log password creation (in production, send email instead)
      console.log('\n========================================');
      console.log('🔐 NEW USER CREATED');
      console.log('========================================');
      console.log(`📧 Email: ${user.email}`);
      console.log(`👤 Name: ${user.name}`);
      console.log(`🎭 Role: ${user.role}`);
      console.log(`🔑 Password: ${password}`);
      console.log('========================================\n');

      await logAction(
        req.user!.userId,
        'user_created',
        'user',
        user._id.toString(),
        { email: user.email, name: user.name, role: user.role },
        req
      );

      res.status(201).json({
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          status: user.status
        },
        password // Return password so admin can see it (in production, send email)
      });
    } catch (error: any) {
      console.error('User creation error:', error);
      res.status(500).json({ error: 'Failed to create user' });
    }
  }
);

// Create multiple users from emails (for case creation)
router.post(
  '/bulk',
  authorize(UserRole.ADMIN, UserRole.ARBITRATOR),
  [
    body('users').isArray().notEmpty(),
    body('users.*.email').isEmail().normalizeEmail(),
    body('users.*.name').trim().notEmpty(),
    body('users.*.role').isIn([UserRole.LAWYER, UserRole.PARTY])
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { users } = req.body;
      const createdUsers = [];
      const passwords: Array<{ email: string; password: string }> = [];

      for (const userData of users) {
        const { email, name, role } = userData;

        // Check if user already exists
        let user = await User.findOne({ email: email.toLowerCase() });
        
        if (!user) {
          // Generate random password
          const password = generateRandomPassword(12);
          const hashedPassword = await hashPassword(password);

          // Create user
          user = await User.create({
            email: email.toLowerCase(),
            password: hashedPassword,
            name,
            role,
            status: 'active'
          });

          passwords.push({ email: user.email, password });

          await logAction(
            req.user!.userId,
            'user_created_bulk',
            'user',
            user._id.toString(),
            { email: user.email, name: user.name, role: user.role },
            req
          );
        }

        createdUsers.push({
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role
        });
      }

      // Log passwords
      console.log('\n========================================');
      console.log('🔐 BULK USERS CREATED');
      console.log('========================================');
      passwords.forEach(({ email, password }) => {
        console.log(`📧 ${email} | 🔑 ${password}`);
      });
      console.log('========================================\n');

      // Send emails
      const { sendBulkPasswordEmails } = await import('../utils/email');
      await sendBulkPasswordEmails(
        passwords.map(p => ({
          email: p.email,
          name: createdUsers.find(u => u.email === p.email)?.name || p.email.split('@')[0],
          password: p.password,
          role: createdUsers.find(u => u.email === p.email)?.role || 'user'
        }))
      );

      res.status(201).json({
        users: createdUsers,
        passwords // Return passwords (in production, send emails)
      });
    } catch (error: any) {
      console.error('Bulk user creation error:', error);
      res.status(500).json({ error: 'Failed to create users' });
    }
  }
);

// Update user status (Admin only)
router.patch(
  '/:userId/status',
  authorize(UserRole.ADMIN),
  async (req: AuthRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const { status } = req.body;

      if (!['active', 'inactive', 'pending'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      const user = await User.findByIdAndUpdate(
        userId,
        { status },
        { new: true }
      ).select('-password');

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      await logAction(
        req.user!.userId,
        'user_status_updated',
        'user',
        userId,
        { status },
        req
      );

      res.json(user);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update user status' });
    }
  }
);

// Delete user (Admin only)
router.delete(
  '/:userId',
  authorize(UserRole.ADMIN),
  async (req: AuthRequest, res: Response) => {
    try {
      const { userId } = req.params;

      // Validate userId
      if (!userId || userId === 'undefined' || userId === 'null') {
        return res.status(400).json({ error: 'Invalid user ID' });
      }

      // Prevent deleting yourself
      if (userId === req.user!.userId) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
      }

      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Prevent deleting the last admin
      if (user.role === UserRole.ADMIN) {
        const adminCount = await User.countDocuments({ role: UserRole.ADMIN });
        if (adminCount <= 1) {
          return res.status(400).json({ error: 'Cannot delete the last admin user' });
        }
      }

      // Delete user
      await User.findByIdAndDelete(userId);

      await logAction(
        req.user!.userId,
        'user_deleted',
        'user',
        userId,
        { email: user.email, name: user.name, role: user.role },
        req
      );

      res.json({ message: 'User deleted successfully' });
    } catch (error) {
      console.error('User deletion error:', error);
      res.status(500).json({ error: 'Failed to delete user' });
    }
  }
);

export default router;

