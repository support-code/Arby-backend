import express, { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { User } from '../models/User';
import { Invitation } from '../models/Invitation';
import { hashPassword, comparePassword } from '../utils/password';
import { generateToken } from '../utils/jwt';
import { authenticate, AuthRequest } from '../middleware/auth';
import { logAction } from '../utils/audit';
import { UserRole } from '../types';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Register via invitation token
router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
    body('name').trim().notEmpty(),
    body('token').notEmpty()
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password, name, token } = req.body;

      // Find invitation
      const invitation = await Invitation.findOne({
        token,
        status: 'pending',
        expiresAt: { $gt: new Date() }
      });

      if (!invitation) {
        return res.status(400).json({ error: 'Invalid or expired invitation token' });
      }

      if (invitation.email.toLowerCase() !== email.toLowerCase()) {
        return res.status(400).json({ error: 'Email does not match invitation' });
      }

      // Check if user already exists
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        return res.status(400).json({ error: 'User already exists' });
      }

      // Create user
      const hashedPassword = await hashPassword(password);
      const user = await User.create({
        email: email.toLowerCase(),
        password: hashedPassword,
        name,
        role: invitation.role,
        status: 'active'
      });

      // Mark invitation as accepted
      invitation.status = 'accepted';
      await invitation.save();

      // Generate token
      const jwtToken = generateToken({
        userId: user._id.toString(),
        email: user.email,
        role: user.role
      });

      await logAction(user._id.toString(), 'user_registered', 'user', user._id.toString(), {}, req);

      res.status(201).json({
        token: jwtToken,
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role
        }
      });
    } catch (error: any) {
      console.error('Registration error:', error);
      res.status(500).json({ error: 'Registration failed' });
    }
  }
);

// Login
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty()
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;

      const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      if (user.status !== 'active') {
        return res.status(401).json({ error: 'Account is inactive' });
      }

      const isPasswordValid = await comparePassword(password, user.password);

      if (!isPasswordValid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const jwtToken = generateToken({
        userId: user._id.toString(),
        email: user.email,
        role: user.role
      });

      await logAction(user._id.toString(), 'user_login', 'user', user._id.toString(), {}, req);

      res.json({
        token: jwtToken,
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  }
);

// Get current user
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.user?.userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

export default router;

