import mongoose, { Schema, Document } from 'mongoose';
import { IReminder } from '../types';

export interface IReminderDocument extends IReminder, Document {}

const ReminderSchema = new Schema<IReminderDocument>(
  {
    caseId: {
      type: Schema.Types.ObjectId,
      ref: 'Case',
      required: true,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    dueDate: {
      type: Date,
      required: true,
      index: true
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    isCompleted: {
      type: Boolean,
      default: false,
      index: true
    },
    completedAt: {
      type: Date
    }
  },
  {
    timestamps: true
  }
);

// Indexes
ReminderSchema.index({ caseId: 1, dueDate: 1 });
ReminderSchema.index({ assignedTo: 1, isCompleted: 1 });
ReminderSchema.index({ dueDate: 1, isCompleted: 1 });

export const Reminder = mongoose.model<IReminderDocument>('Reminder', ReminderSchema);

