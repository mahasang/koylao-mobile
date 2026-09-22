// Normalizes a locally-typed Lao phone number into E.164 format (e.g. "020 5551234" -> "+8562055551234").
// If the user already typed a country code (leading + or 00), it's respected as-is.
export function toE164Phone(raw: string, defaultCountryCode = '856'): string {
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('00')) return '+' + digits.slice(2);
  if (digits.startsWith('0')) return '+' + defaultCountryCode + digits.slice(1);
  return '+' + defaultCountryCode + digits;
}
