import { Case } from '../models/Case';

/**
 * Generates a unique case number for cases created by arbitrator
 * Format: XXXXX-YY-MM
 * XXXXX - 5 digit running number
 * YY - Month of case opening (2 digits)
 * MM - Year of opening (2 digits, last 2 digits of year)
 * 
 * @param creationDate - Date when the case is created
 * @param clientId - Client ID (not used in new format, kept for backward compatibility)
 * @returns Unique case number
 */
export async function generateCaseNumber(
  creationDate: Date,
  clientId?: string
): Promise<string> {
  // Get month (2 digits)
  const month = String(creationDate.getMonth() + 1).padStart(2, '0');
  
  // Get year (last 2 digits)
  const year = String(creationDate.getFullYear()).slice(-2);

  // Find the highest running number for this month/year
  const monthYearPattern = new RegExp(`^\\d{5}-${month}-${year}$`);
  const casesInMonth = await Case.find({
    caseNumber: { $regex: monthYearPattern }
  }).sort({ caseNumber: -1 }).limit(1);

  let runningNumber = 1;
  if (casesInMonth.length > 0 && casesInMonth[0].caseNumber) {
    // Extract the running number from the existing case
    const match = casesInMonth[0].caseNumber.match(/^(\d{5})-/);
    if (match) {
      const lastNumber = parseInt(match[1], 10);
      runningNumber = lastNumber + 1;
    }
  }

  // Ensure running number is 5 digits
  const runningNumberStr = String(runningNumber).padStart(5, '0');

  // Combine: XXXXX-YY-MM
  let caseNumber = `${runningNumberStr}-${month}-${year}`;

  // Ensure uniqueness by checking if it exists
  let attempts = 0;
  while (attempts < 10) {
    const existingCase = await Case.findOne({ caseNumber });
    if (!existingCase) {
      return caseNumber;
    }
    // If exists, increment running number
    runningNumber++;
    const runningNumberStr = String(runningNumber).padStart(5, '0');
    caseNumber = `${runningNumberStr}-${month}-${year}`;
    attempts++;
  }

  // Fallback: add timestamp if still not unique
  const timestamp = Date.now().toString().slice(-3);
  return `${runningNumberStr}-${month}-${year}`;
}

