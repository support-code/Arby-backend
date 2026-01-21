import express, { Response } from 'express';
import { body, validationResult } from 'express-validator';
import { Expense } from '../models/Expense';
import { Case } from '../models/Case';
import { authenticate, AuthRequest } from '../middleware/auth';
import { canAccessCase } from '../middleware/permissions';
import { logAction } from '../utils/audit';
import { ExpenseCategory, UserRole } from '../types';

const router = express.Router();

router.use(authenticate);

// Get all expenses for a case
router.get('/case/:caseId', canAccessCase, async (req: AuthRequest, res: Response) => {
  try {
    const { caseId } = req.params;
    const expenses = await Expense.find({ caseId })
      .populate('createdBy', 'name email')
      .sort({ date: -1 });
    
    res.json(expenses);
  } catch (error) {
    console.error('Fetch expenses error:', error);
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

// Get single expense
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const expense = await Expense.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('caseId', 'title');
    
    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    // Check access to case
    const caseDoc = await Case.findById(expense.caseId);
    if (!caseDoc) {
      return res.status(404).json({ error: 'Case not found' });
    }

    // Verify user has access to case
    const userId = req.user!.userId;
    const role = req.user!.role;
    
    if (role !== UserRole.ADMIN && 
        caseDoc.arbitratorId.toString() !== userId &&
        !caseDoc.lawyers.some(l => l.toString() === userId) &&
        !caseDoc.parties.some(p => p.toString() === userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(expense);
  } catch (error) {
    console.error('Fetch expense error:', error);
    res.status(500).json({ error: 'Failed to fetch expense' });
  }
});

// Create expense (Arbitrator/Admin only)
router.post(
  '/',
  canAccessCase,
  [
    body('caseId').notEmpty(),
    body('description').trim().notEmpty(),
    body('amount').isFloat({ min: 0 }),
    body('category').isIn(Object.values(ExpenseCategory)),
    body('date').optional().isISO8601()
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { caseId, description, amount, category, date } = req.body;
      const createdBy = req.user!.userId;
      const role = req.user!.role;

      // Only arbitrator and admin can create expenses
      const caseDoc = await Case.findById(caseId);
      if (!caseDoc) {
        return res.status(404).json({ error: 'Case not found' });
      }

      if (role !== UserRole.ADMIN && caseDoc.arbitratorId.toString() !== createdBy) {
        return res.status(403).json({ error: 'Only arbitrator can create expenses' });
      }

      const expense = await Expense.create({
        caseId,
        description,
        amount: parseFloat(amount),
        category,
        date: date ? new Date(date) : new Date(),
        createdBy
      });

      await logAction(
        createdBy,
        'expense_created',
        'expense',
        expense._id.toString(),
        { caseId, amount, category },
        req
      );

      const populated = await Expense.findById(expense._id)
        .populate('createdBy', 'name email');

      res.status(201).json(populated);
    } catch (error) {
      console.error('Create expense error:', error);
      res.status(500).json({ error: 'Failed to create expense' });
    }
  }
);

// Update expense (Arbitrator/Admin only)
router.patch(
  '/:id',
  [
    body('description').optional().trim().notEmpty(),
    body('amount').optional().isFloat({ min: 0 }),
    body('category').optional().isIn(Object.values(ExpenseCategory)),
    body('date').optional().isISO8601()
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const expense = await Expense.findById(req.params.id);
      if (!expense) {
        return res.status(404).json({ error: 'Expense not found' });
      }

      // Check if user is arbitrator or admin
      const caseDoc = await Case.findById(expense.caseId);
      if (!caseDoc) {
        return res.status(404).json({ error: 'Case not found' });
      }

      const userId = req.user!.userId;
      const role = req.user!.role;
      
      if (role !== UserRole.ADMIN && caseDoc.arbitratorId.toString() !== userId) {
        return res.status(403).json({ error: 'Only arbitrator can update expenses' });
      }

      const updates = req.body;
      delete updates._id;
      delete updates.caseId;
      delete updates.createdBy;
      delete updates.createdAt;

      if (updates.amount) {
        updates.amount = parseFloat(updates.amount);
      }
      if (updates.date) {
        updates.date = new Date(updates.date);
      }

      const updated = await Expense.findByIdAndUpdate(
        req.params.id,
        { $set: updates },
        { new: true }
      )
        .populate('createdBy', 'name email');

      await logAction(
        userId,
        'expense_updated',
        'expense',
        req.params.id,
        updates,
        req
      );

      res.json(updated);
    } catch (error) {
      console.error('Update expense error:', error);
      res.status(500).json({ error: 'Failed to update expense' });
    }
  }
);

// Delete expense (Arbitrator/Admin only)
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    // Check if user is arbitrator or admin
    const caseDoc = await Case.findById(expense.caseId);
    if (!caseDoc) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const userId = req.user!.userId;
    const role = req.user!.role;
    
    if (role !== UserRole.ADMIN && caseDoc.arbitratorId.toString() !== userId) {
      return res.status(403).json({ error: 'Only arbitrator can delete expenses' });
    }

    await Expense.findByIdAndDelete(req.params.id);

    await logAction(
      userId,
      'expense_deleted',
      'expense',
      req.params.id,
      {},
      req
    );

    res.json({ message: 'Expense deleted successfully' });
  } catch (error) {
    console.error('Delete expense error:', error);
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

export default router;

