import mongoose, { Schema, Document } from 'mongoose';
import { IAppeal, AppealType, AppealStatus } from '../types';

export interface IAppealDocument extends Omit<IAppeal, '_id'>, Document {}

const AppealSchema = new Schema<IAppealDocument>(
  {
    caseId: {
      type: Schema.Types.ObjectId,
      ref: 'Case',
      required: true,
      index: true
    } as any,
    decisionId: {
      type: Schema.Types.ObjectId,
      ref: 'Decision',
      index: true
    } as any,
    type: {
      type: String,
      enum: Object.values(AppealType),
      required: true,
      index: true
    },
    content: {
      type: String,
      required: true
    },
    submittedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    } as any,
    status: {
      type: String,
      enum: Object.values(AppealStatus),
      default: AppealStatus.PENDING,
      index: true
    },
    responseDate: {
      type: Date
    },
    response: {
      type: String,
      trim: true
    }
  },
  {
    timestamps: true
  }
);

// Indexes
AppealSchema.index({ caseId: 1, createdAt: -1 });
AppealSchema.index({ decisionId: 1 });
AppealSchema.index({ submittedBy: 1 });

export const Appeal = mongoose.model<IAppealDocument>('Appeal', AppealSchema);

