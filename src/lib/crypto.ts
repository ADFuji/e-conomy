// Chiffrement local de l'export JSON avec un mot de passe (Web Crypto API).
// AES-GCM 256 bits, clé dérivée par PBKDF2 (100 000 itérations, SHA-256).
// Tout se passe dans le navigateur : le mot de passe ne quitte jamais la machine.

const MAGIC = 'econ1'; // préfixe du format, pour distinguer un export chiffré d'un JSON brut.
const ITERATIONS = 100_000;

function toBase64(bytes: Uint8Array): string {
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
	const bin = atob(b64);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return bytes;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
	const keyMaterial = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(password),
		'PBKDF2',
		false,
		['deriveKey']
	);
	return crypto.subtle.deriveKey(
		{ name: 'PBKDF2', salt: salt as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' },
		keyMaterial,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
}

/** Chiffre un texte avec un mot de passe. Renvoie une chaîne autoportante (base64). */
export async function encryptString(plaintext: string, password: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const key = await deriveKey(password, salt);
	const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
	const payload = `${MAGIC}:${toBase64(salt)}:${toBase64(iv)}:${toBase64(new Uint8Array(cipherBuf))}`;
	return payload;
}

/** Déchiffre une chaîne produite par `encryptString`. Lève une erreur si le mot de passe est incorrect. */
export async function decryptString(payload: string, password: string): Promise<string> {
	const parts = payload.trim().split(':');
	if (parts.length !== 4 || parts[0] !== MAGIC) {
		throw new Error("Format de fichier chiffré non reconnu.");
	}
	const [, saltB64, ivB64, dataB64] = parts;
	const salt = fromBase64(saltB64);
	const iv = fromBase64(ivB64);
	const data = fromBase64(dataB64);
	const key = await deriveKey(password, salt);
	try {
		const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, data as BufferSource);
		return new TextDecoder().decode(plainBuf);
	} catch {
		throw new Error('Mot de passe incorrect ou fichier corrompu.');
	}
}

/** Détecte si un contenu est un export chiffré par e-conomy. */
export function isEncryptedPayload(content: string): boolean {
	return content.trim().startsWith(`${MAGIC}:`);
}
