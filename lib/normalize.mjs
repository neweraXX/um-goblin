export const normalizeWord = (value) => String(value ?? '').normalize('NFC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}']/gu, '');
