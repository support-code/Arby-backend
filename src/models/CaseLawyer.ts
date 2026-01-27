import mongoose, { Schema, Document } from 'mongoose';
import { ICaseLawyer } from '../types';

export interface ICaseLawyerDocument extends Omit<ICaseLawyer, '_id' | 'caseId' | 'userId' | 'partyId'>, Document {
  caseId: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId;
  partyId: mongoose.Types.ObjectId;
}

const CaseLawyerSchema = new Schema<ICaseLawyerDocument>(
  {
    caseId: {
      type: Schema.Types.ObjectId,
      ref: 'Case',
      required: false, // Will be set after case creation
      index: true
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    partyId: {
      type: Schema.Types.ObjectId,
      ref: 'CaseParty',
      required: true,
      index: true
    },
    firstName: {
      type: String,
      required: true,
      trim: true
    },
    lastName: {
      type: String,
      required: true,
      trim: true
    },
    idNumber: {
      type: String,
      trim: true
    },
    address: {
      type: String,
      trim: true
    },
    phone: {
      type: String,
      trim: true
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    profession: {
      type: String,
      required: true,
      trim: true,
      default: 'עורך דין'
    },
    status: {
      type: String,
      required: true,
      trim: true
    }
  },
  {
    timestamps: true
  }
);

// Indexes
CaseLawyerSchema.index({ caseId: 1 });
CaseLawyerSchema.index({ partyId: 1 });
CaseLawyerSchema.index({ userId: 1 });

export const CaseLawyer = mongoose.model<ICaseLawyerDocument>('CaseLawyer', CaseLawyerSchema);


