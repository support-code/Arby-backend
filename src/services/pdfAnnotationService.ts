import { PDFDocument, rgb, PDFPage } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import { Annotation } from '../models/Annotation';
import { Document } from '../models/Document';
import { IAnnotation, AnnotationType } from '../types';

/**
 * Generate an annotated PDF by burning annotations into the original PDF
 */
export async function generateAnnotatedPdf(
  requestId: string,
  documentId: string,
  annotations: IAnnotation[]
): Promise<Buffer> {
  // Get the original document
  const originalDocument = await Document.findById(documentId);
  if (!originalDocument) {
    throw new Error('Document not found');
  }

  // Check if file exists
  if (!fs.existsSync(originalDocument.filePath)) {
    throw new Error('Original PDF file not found on filesystem');
  }

  // Read the original PDF
  const pdfBytes = fs.readFileSync(originalDocument.filePath);
  const pdfDoc = await PDFDocument.load(pdfBytes);

  // Get all pages
  const pages = pdfDoc.getPages();

  // Group annotations by page
  const annotationsByPage: { [pageNumber: number]: IAnnotation[] } = {};
  annotations.forEach(annotation => {
    const pageNum = annotation.pageNumber;
    if (!annotationsByPage[pageNum]) {
      annotationsByPage[pageNum] = [];
    }
    annotationsByPage[pageNum].push(annotation);
  });

  // Draw annotations on each page
  Object.keys(annotationsByPage).forEach(pageNumStr => {
    const pageNum = parseInt(pageNumStr, 10);
    if (pageNum >= 0 && pageNum < pages.length) {
      const page = pages[pageNum];
      const pageAnnotations = annotationsByPage[pageNum];

      pageAnnotations.forEach(annotation => {
        drawAnnotation(page, annotation);
      });
    }
  });

  // Generate PDF bytes
  const pdfBuffer = await pdfDoc.save();
  return Buffer.from(pdfBuffer);
}

/**
 * Draw a single annotation on a PDF page
 */
function drawAnnotation(page: PDFPage, annotation: IAnnotation): void {
  const { width: pageWidth, height: pageHeight } = page.getSize();

  // Convert relative coordinates (0-1) to absolute coordinates
  const x = annotation.x * pageWidth;
  const y = annotation.y * pageHeight;
  const width = annotation.width * pageWidth;
  const height = annotation.height * pageHeight;

  // Parse color (hex to RGB)
  const color = hexToRgb(annotation.color || '#ffff00');

  switch (annotation.type) {
    case AnnotationType.HIGHLIGHT:
    case AnnotationType.RECTANGLE:
      // Draw filled rectangle
      page.drawRectangle({
        x,
        y: pageHeight - y - height, // PDF coordinates are bottom-left, we use top-left
        width,
        height,
        color: rgb(color.r, color.g, color.b),
        opacity: 0.3 // Semi-transparent for highlights
      });
      break;

    case AnnotationType.CIRCLE:
      // Draw circle (approximated as ellipse)
      const radius = Math.min(width, height) / 2;
      const centerX = x + width / 2;
      const centerY = pageHeight - (y + height / 2);
      page.drawCircle({
        x: centerX,
        y: centerY,
        size: radius,
        color: rgb(color.r, color.g, color.b),
        opacity: 0.3
      });
      break;

    case AnnotationType.ARROW:
      // Draw arrow (line with arrowhead)
      const startX = x;
      const startY = pageHeight - y;
      const endX = x + width;
      const endY = pageHeight - (y + height);
      
      // Draw line
      page.drawLine({
        start: { x: startX, y: startY },
        end: { x: endX, y: endY },
        thickness: 2,
        color: rgb(color.r, color.g, color.b)
      });

      // Draw arrowhead (simple triangle)
      const angle = Math.atan2(endY - startY, endX - startX);
      const arrowLength = 10;
      const arrowAngle = Math.PI / 6; // 30 degrees

      const arrowX1 = endX - arrowLength * Math.cos(angle - arrowAngle);
      const arrowY1 = endY - arrowLength * Math.sin(angle - arrowAngle);
      const arrowX2 = endX - arrowLength * Math.cos(angle + arrowAngle);
      const arrowY2 = endY - arrowLength * Math.sin(angle + arrowAngle);

      // Draw arrowhead triangle
      page.drawLine({
        start: { x: endX, y: endY },
        end: { x: arrowX1, y: arrowY1 },
        thickness: 2,
        color: rgb(color.r, color.g, color.b)
      });
      page.drawLine({
        start: { x: endX, y: endY },
        end: { x: arrowX2, y: arrowY2 },
        thickness: 2,
        color: rgb(color.r, color.g, color.b)
      });
      break;

    case AnnotationType.TEXT:
      // Draw text annotation
      if (annotation.content) {
        page.drawText(annotation.content, {
          x,
          y: pageHeight - y - height,
          size: 12,
          color: rgb(color.r, color.g, color.b)
        });
      }
      break;
  }
}

/**
 * Convert hex color to RGB
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) {
    return { r: 1, g: 1, b: 0 }; // Default yellow
  }
  return {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255
  };
}

/**
 * Save annotated PDF to filesystem and create Document entry
 */
export async function saveAnnotatedPdf(
  pdfBuffer: Buffer,
  originalDocument: any,
  decisionId: string,
  requestId: string
): Promise<any> {
  const uploadDir = process.env.UPLOAD_DIR || './uploads';
  const decisionDir = path.join(uploadDir, 'decisions', decisionId);
  
  // Create directory if it doesn't exist
  if (!fs.existsSync(decisionDir)) {
    fs.mkdirSync(decisionDir, { recursive: true });
  }

  // Generate filename
  const timestamp = Date.now();
  const filename = `annotated-${originalDocument._id}-${timestamp}.pdf`;
  const filePath = path.join(decisionDir, filename);

  // Write file to filesystem
  fs.writeFileSync(filePath, pdfBuffer);

  // Create Document entry
  const annotatedDocument = await Document.create({
    caseId: originalDocument.caseId,
    fileName: filename,
    originalName: `annotated-${originalDocument.originalName}`,
    filePath,
    fileSize: pdfBuffer.length,
    mimeType: 'application/pdf',
    uploadedBy: originalDocument.uploadedBy, // Keep original uploader
    permission: originalDocument.permission,
    documentType: 'decision',
    belongsToProcedure: `Decision ${decisionId} - Annotated PDF from Request ${requestId}`
  });

  return annotatedDocument;
}

/**
 * Get all annotations for a request and document, then generate annotated PDF
 */
export async function generateAnnotatedPdfFromRequest(
  requestId: string,
  documentId: string,
  decisionId: string
): Promise<any> {
  // Get all non-deleted annotations for this document
  const annotationDocuments = await Annotation.find({
    requestId,
    documentId,
    isDeleted: { $ne: true }
  }).sort({ pageNumber: 1, timestamp: 1 });

  if (annotationDocuments.length === 0) {
    throw new Error('No annotations found for this document');
  }

  // Convert IAnnotationDocument[] to IAnnotation[]
  const annotations: IAnnotation[] = annotationDocuments.map(doc => ({
    _id: doc._id.toString(),
    requestId: doc.requestId.toString(),
    documentId: doc.documentId.toString(),
    pageNumber: doc.pageNumber,
    type: doc.type as AnnotationType,
    x: doc.x,
    y: doc.y,
    width: doc.width,
    height: doc.height,
    color: doc.color,
    content: doc.content,
    textAlign: doc.textAlign as 'right' | 'center' | 'left' | undefined,
    textBold: doc.textBold,
    createdBy: doc.createdBy.toString(),
    timestamp: doc.timestamp,
    isDeleted: doc.isDeleted,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  }));

  // Get original document
  const originalDocument = await Document.findById(documentId);
  if (!originalDocument) {
    throw new Error('Original document not found');
  }

  // Generate annotated PDF
  const pdfBuffer = await generateAnnotatedPdf(requestId, documentId, annotations);

  // Save annotated PDF
  const annotatedDocument = await saveAnnotatedPdf(
    pdfBuffer,
    originalDocument,
    decisionId,
    requestId
  );

  return annotatedDocument;
}

