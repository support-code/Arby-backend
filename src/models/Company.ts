import mongoose, { Schema, Document } from 'mongoose';
import { ICompany, PartyStatus, IAuthorizedSignatory } from '../types';

export interface ICompanyDocument extends Omit<ICompany, '_id' | 'authorizedSignatories'>, Document {
  authorizedSignatories: IAuthorizedSignatory[];
}

const AuthorizedSignatorySchema = new Schema<IAuthorizedSignatory>({
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  idNumber: { type: String, required: true, trim: true },
  address: { type: String, trim: true },
  phone: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true }
}, { _id: false });

const CompanySchema = new Schema<ICompanyDocument>(
  {
    companyName: {
      type: String,
      required: true,
      trim: true
    },
    companyNumber: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    address: {
      type: String,
      required: true,
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
    },
    status: {
      type: String,
      enum: Object.values(PartyStatus),
      required: true
    },
    authorizedSignatories: {
      type: [AuthorizedSignatorySchema],
      default: []
    },
    signatureDocumentReceived: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

// Indexes
CompanySchema.index({ companyNumber: 1 });

export const Company = mongoose.model<ICompanyDocument>('Company', CompanySchema);


