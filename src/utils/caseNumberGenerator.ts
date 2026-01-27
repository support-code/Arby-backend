import { Case } from '../models/Case';

/**
 * Generates a unique case number for cases created by arbitrator
 * Format: YYYYMMDD-{CLIENT_ID}-{4_RANDOM_DIGITS}
 * 
 * @param creationDate - Date when the case is created
 * @param clientId - Client ID (idNumber for person or companyNumber for company)
 * @returns Unique case number
 */
export async function generateCaseNumber(
  creationDate: Date,
  clientId?: string
): Promise<string> {
  // Format date as YYYYMMDD
  const year = creationDate.getFullYear();
  const month = String(creationDate.getMonth() + 1).padStart(2, '0');
  const day = String(creationDate.getDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;

  // Clean client ID - remove non-digits and limit length
  let cleanClientId = '';
  if (clientId) {
    cleanClientId = clientId.replace(/\D/g, ''); // Remove non-digits
    // Limit to last 9 digits if longer
    if (cleanClientId.length > 9) {
      cleanClientId = cleanClientId.slice(-9);
    }
  }

  // If no client ID found, use a default
  if (!cleanClientId) {
    cleanClientId = '000000000'; // Default if no ID available
  }

  // Generate 4 random digits
  const randomDigits = Math.floor(1000 + Math.random() * 9000).toString();

  // Combine: YYYYMMDD-CLIENTID-RANDOM
  let caseNumber = `${dateStr}-${cleanClientId}-${randomDigits}`;

  // Ensure uniqueness by checking if it exists
  let attempts = 0;
  while (attempts < 10) {
    const existingCase = await Case.findOne({ caseNumber });
    if (!existingCase) {
      return caseNumber;
    }
    // If exists, generate new random digits
    const newRandomDigits = Math.floor(1000 + Math.random() * 9000).toString();
    caseNumber = `${dateStr}-${cleanClientId}-${newRandomDigits}`;
    attempts++;
  }

  // Fallback: add timestamp if still not unique
  const timestamp = Date.now().toString().slice(-4);
  return `${dateStr}-${cleanClientId}-${timestamp}`;
}

