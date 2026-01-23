import mongoose, { Schema, Document } from 'mongoose';
import { IAnnotation, AnnotationType } from '../types';

export interface IAnnotationDocument extends Omit<IAnnotation, '_id' | 'requestId' | 'documentId' | 'createdBy'>, Document {
  requestId: mongoose.Types.ObjectId;
  documentId: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
}

const AnnotationSchema = new Schema<IAnnotationDocument>(
  {
    requestId: {
      type: Schema.Types.ObjectId,
      ref: 'Request',
      required: true,
      index: true
    },
    documentId: {
      type: Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
      index: true
    },
    pageNumber: {
      type: Number,
      required: true,
      min: 0
    },
    type: {
      type: String,
      enum: Object.values(AnnotationType),
      required: true
    },
    x: {
      type: Number,
      required: true,
      min: 0,
      max: 1
    },
    y: {
      type: Number,
      required: true,
      min: 0,
      max: 1
    },
    width: {
      type: Number,
      required: true,
      min: 0,
      max: 1
    },
    height: {
      type: Number,
      required: true,
      min: 0,
      max: 1
    },
    color: {
      type: String,
      required: true,
      default: '#ffff00' // Yellow default
    },
    content: {
      type: String,
      trim: true
    },
    textAlign: {
      type: String,
      enum: ['right', 'center', 'left'],
      default: 'right'
    },
    textBold: {
      type: Boolean,
      default: false
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true
    }
  },
  {
    timestamps: true
  }
);

// Indexes
AnnotationSchema.index({ requestId: 1, documentId: 1, pageNumber: 1 });
AnnotationSchema.index({ requestId: 1, isDeleted: 1 });
AnnotationSchema.index({ documentId: 1, isDeleted: 1 });
AnnotationSchema.index({ createdBy: 1 });

export const Annotation = mongoose.model<IAnnotationDocument>('Annotation', AnnotationSchema);

