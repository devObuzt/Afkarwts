/**
 * Pure helpers, with no imports, so the journey editor can count segments in a
 * client component without pulling the sending code into the browser bundle.
 */

const GSM_SINGLE = 160;
const GSM_MULTI = 153;
const UNICODE_SINGLE = 70;
const UNICODE_MULTI = 67;

export function digitsOnly(phone: string) {
  return phone.replace(/[^\d]/g, "");
}

/** Israeli mobiles are 05X followed by seven digits: +9725XXXXXXXX. */
export function isIsraeliMobile(phone: string) {
  return /^9725\d{8}$/.test(digitsOnly(phone));
}

/** Inforu addresses Israeli numbers in local form. */
export function toLocalIsraeli(phone: string) {
  const digits = digitsOnly(phone);
  return digits.startsWith("972") ? `0${digits.slice(3)}` : digits;
}

/**
 * One Arabic or Hebrew character turns the whole message into UCS-2, which
 * fits 70 characters instead of 160 - and 67 per part once it is split.
 */
export function smsSegments(body: string) {
  const characters = [...body].length;
  const unicode = /[^ -~\r\n]/.test(body);
  const single = unicode ? UNICODE_SINGLE : GSM_SINGLE;
  const multi = unicode ? UNICODE_MULTI : GSM_MULTI;

  return { characters, segments: characters <= single ? 1 : Math.ceil(characters / multi) };
}
