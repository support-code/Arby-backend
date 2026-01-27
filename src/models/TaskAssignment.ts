import mongoose, { Schema, Document } from 'mongoose';
import { ITaskAssignment } from '../types';

export interface ITaskAssignmentDocument extends Omit<ITaskAssignment, '_id' | 'caseId' | 'taskId' | 'assignedBy' | 'assignedTo'>, Document {
  caseId: mongoose.Types.ObjectId;
  taskId?: mongoose.Types.ObjectId;
  assignedBy: mongoose.Types.ObjectId;
  assignedTo: mongoose.Types.ObjectId;
}

const TaskAssignmentSchema = new Schema<ITaskAssignmentDocument>(
  {
    caseId: {
      type: Schema.Types.ObjectId,
      ref: 'Case',
      required: true,
      index: true
    },
    taskId: {
      type: Schema.Types.ObjectId,
      ref: 'Task',
      index: true
    },
    assignedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    taskDescription: {
      type: String,
      required: true,
      trim: true
    },
    taskType: {
      type: String,
      trim: true
    },
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed', 'cancelled'],
      default: 'pending',
      index: true
    }
  },
  {
    timestamps: true
  }
);

// Indexes
TaskAssignmentSchema.index({ caseId: 1, status: 1 });
TaskAssignmentSchema.index({ assignedBy: 1 });
TaskAssignmentSchema.index({ assignedTo: 1 });

export const TaskAssignment = mongoose.model<ITaskAssignmentDocument>('TaskAssignment', TaskAssignmentSchema);


