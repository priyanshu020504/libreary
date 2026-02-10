/**
 * Payload Sanitizer - Removes empty/null/undefined values before sending to backend
 * This prevents corrupting student records with null values
 */

export function sanitizePayload(obj: any): any {
  return Object.fromEntries(
    Object.entries(obj).filter(
      ([_, value]) => 
        value !== undefined && 
        value !== null && 
        value !== ''
    )
  );
}

export default sanitizePayload;
