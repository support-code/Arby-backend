import mongoose, { Schema, Document } from 'mongoose';
import { IUser, UserRole } from '../types';

export interface IUserDocument extends Omit<IUser, '_id'>, Document {}

const UserSchema = new Schema<IUserDocument>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    password: {
      type: String,
      required: true,
      select: false // Don't return password by default
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    role: {
      type: String,
      enum: Object.values(UserRole),
      required: true
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'pending'],
      default: 'active'
    }
  },
  {
    timestamps: true
  }
);

// Indexes for performance
UserSchema.index({ email: 1 });
UserSchema.index({ role: 1, status: 1 });

export const User = mongoose.model<IUserDocument>('User', UserSchema);

