import mongoose, { Schema, Document } from 'mongoose';
import { IRequest, RequestType, RequestStatus } from '../types';

export interface IRequestDocument extends Omit<IRequest, '_id' | 'caseId' | 'submittedBy' | 'respondedBy' | 'attachments'>, Document {
  caseId: mongoose.Types.ObjectId;
  submittedBy: mongoose.Types.ObjectId;
  respondedBy?: mongoose.Types.ObjectId;
  attachments?: mongoose.Types.ObjectId[];
}

const RequestSchema = new Schema<IRequestDocument>(
  {
    caseId: {
      type: Schema.Types.ObjectId,
      ref: 'Case',
      required: true,
      index: true
    },
    type: {
      type: String,
      enum: Object.values(RequestType),
      required: true,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    content: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: Object.values(RequestStatus),
      default: RequestStatus.PENDING,
      index: true
    },
    submittedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    respondedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    responseDate: {
      type: Date
    },
    response: {
      type: String,
      trim: true
    },
    attachments: [{
      type: Schema.Types.ObjectId,
      ref: 'Document'
    }]
  },
  {
    timestamps: true
  }
);

// Indexes
RequestSchema.index({ caseId: 1, createdAt: -1 });
RequestSchema.index({ caseId: 1, status: 1 });
RequestSchema.index({ submittedBy: 1 });

export const Request = mongoose.model<IRequestDocument>('Request', RequestSchema);

