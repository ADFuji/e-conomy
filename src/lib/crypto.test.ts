import { describe, expect, it } from 'vitest';
import { decryptString, encryptString, isEncryptedPayload } from './crypto';

describe('encryptString / decryptString', () => {
	it('round-trips a payload with the correct password', async () => {
		const secret = JSON.stringify({ hello: 'world', n: 42 });
		const enc = await encryptString(secret, 'correct horse battery staple');
		expect(isEncryptedPayload(enc)).toBe(true);
		const dec = await decryptString(enc, 'correct horse battery staple');
		expect(dec).toBe(secret);
	});

	it('rejects a wrong password', async () => {
		const enc = await encryptString('data', 'right-password');
		await expect(decryptString(enc, 'wrong-password')).rejects.toThrow(
			'Mot de passe incorrect ou fichier corrompu.'
		);
	});

	it('rejects a payload that is not in the expected format', async () => {
		await expect(decryptString('not-an-encrypted-payload', 'x')).rejects.toThrow(
			'Format de fichier chiffré non reconnu.'
		);
	});

	it('isEncryptedPayload only recognizes the app-specific prefix', () => {
		expect(isEncryptedPayload('{"accounts":[]}')).toBe(false);
		expect(isEncryptedPayload('econ1:abc:def:ghi')).toBe(true);
	});

	it('produces a different ciphertext each time (random salt/iv)', async () => {
		const a = await encryptString('same input', 'pw');
		const b = await encryptString('same input', 'pw');
		expect(a).not.toBe(b);
	});
});
