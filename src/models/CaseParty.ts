import mongoose, { Schema, Document } from 'mongoose';
import { ICaseParty, PartyStatus } from '../types';

export interface ICasePartyDocument extends Omit<ICaseParty, '_id' | 'caseId' | 'userId' | 'companyId'>, Document {
  caseId: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId;
  companyId?: mongoose.Types.ObjectId;
}

const CasePartySchema = new Schema<ICasePartyDocument>(
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
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      index: true
    },
    isCompany: {
      type: Boolean,
      required: true,
      default: false
    },
    status: {
      type: String,
      enum: Object.values(PartyStatus),
      required: true
    },
    firstName: {
      type: String,
      trim: true
    },
    lastName: {
      type: String,
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
      trim: true,
      lowercase: true
    }
  },
  {
    timestamps: true
  }
);

// Indexes
CasePartySchema.index({ caseId: 1, status: 1 });
CasePartySchema.index({ userId: 1 });
CasePartySchema.index({ companyId: 1 });

export const CaseParty = mongoose.model<ICasePartyDocument>('CaseParty', CasePartySchema);


