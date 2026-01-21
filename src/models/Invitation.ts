import mongoose, { Schema, Document } from 'mongoose';
import { IInvitation, UserRole } from '../types';

export interface IInvitationDocument extends Omit<IInvitation, '_id' | 'caseId' | 'invitedBy'>, Document {
  caseId?: mongoose.Types.ObjectId;
  invitedBy: mongoose.Types.ObjectId;
}

const InvitationSchema = new Schema<IInvitationDocument>(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true
    },
    role: {
      type: String,
      enum: Object.values(UserRole),
      required: true
    },
    caseId: {
      type: Schema.Types.ObjectId,
      ref: 'Case',
      index: true
    },
    invitedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    token: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'expired'],
      default: 'pending',
      index: true
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true
    }
  },
  {
    timestamps: true
  }
);

// Index for finding active invitations
InvitationSchema.index({ email: 1, status: 1, expiresAt: 1 });

export const Invitation = mongoose.model<IInvitationDocument>('Invitation', InvitationSchema);

