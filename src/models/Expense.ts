import mongoose, { Schema, Document } from 'mongoose';
import { IExpense, ExpenseCategory } from '../types';

export interface IExpenseDocument extends IExpense, Document {}

const ExpenseSchema = new Schema<IExpenseDocument>(
  {
    caseId: {
      type: Schema.Types.ObjectId,
      ref: 'Case',
      required: true,
      index: true
    },
    description: {
      type: String,
      required: true,
      trim: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    category: {
      type: String,
      enum: Object.values(ExpenseCategory),
      required: true,
      index: true
    },
    date: {
      type: Date,
      required: true,
      default: Date.now
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    }
  },
  {
    timestamps: true
  }
);

// Indexes
ExpenseSchema.index({ caseId: 1, createdAt: -1 });
ExpenseSchema.index({ category: 1 });
ExpenseSchema.index({ date: 1 });

export const Expense = mongoose.model<IExpenseDocument>('Expense', ExpenseSchema);

