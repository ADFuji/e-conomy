// Génère des icônes PNG simples (carré coloré + glyphe "€") pour le PWA manifest.
// Écrit à la main pour éviter toute dépendance d'image (zlib est natif à Node).
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function crc32(buf) {
	let c;
	const table = crc32.table || (crc32.table = (() => {
		const t = new Uint32Array(256);
		for (let n = 0; n < 256; n++) {
			c = n;
			for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
			t[n] = c >>> 0;
		}
		return t;
	})());
	let crc = 0xffffffff;
	for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length, 0);
	const typeBuf = Buffer.from(type, 'ascii');
	const crcBuf = Buffer.alloc(4);
	crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
	return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function hex(c) {
	return [c.slice(1, 3), c.slice(3, 5), c.slice(5, 7)].map((h) => parseInt(h, 16));
}

function drawIcon(size) {
	const bg = hex('#6366f1'); // brand
	const bg2 = hex('#8b5cf6'); // brand gradient end
	const fg = [255, 255, 255];
	const px = new Uint8Array(size * size * 3);

	// Fond : dégradé diagonal simple entre bg et bg2.
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const t = (x + y) / (2 * size);
			const r = Math.round(bg[0] + (bg2[0] - bg[0]) * t);
			const g = Math.round(bg[1] + (bg2[1] - bg[1]) * t);
			const b = Math.round(bg[2] + (bg2[2] - bg[2]) * t);
			const i = (y * size + x) * 3;
			px[i] = r;
			px[i + 1] = g;
			px[i + 2] = b;
		}
	}

	// Glyphe "€" grossier dessiné en blocs (lisible en petite taille).
	const s = size / 32;
	function rect(cx, cy, w, h) {
		const x0 = Math.round(cx - w / 2);
		const y0 = Math.round(cy - h / 2);
		for (let y = y0; y < y0 + h; y++) {
			for (let x = x0; x < x0 + w; x++) {
				if (x < 0 || y < 0 || x >= size || y >= size) continue;
				const i = (y * size + x) * 3;
				px[i] = fg[0];
				px[i + 1] = fg[1];
				px[i + 2] = fg[2];
			}
		}
	}
	// Barres horizontales + arc gauche simplifié en trois segments verticaux.
	rect(16 * s, 10 * s, 14 * s, 2.6 * s);
	rect(16 * s, 16 * s, 12 * s, 2.6 * s);
	rect(16 * s, 22 * s, 14 * s, 2.6 * s);
	rect(9.5 * s, 16 * s, 3 * s, 18 * s);

	const raw = Buffer.alloc(size * (1 + size * 3));
	for (let y = 0; y < size; y++) {
		raw[y * (1 + size * 3)] = 0;
		px.copy = px.copy; // noop keep linter quiet
		Buffer.from(px.buffer, y * size * 3, size * 3).copy(raw, y * (1 + size * 3) + 1);
	}
	const idat = zlib.deflateSync(raw);

	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(size, 0);
	ihdr.writeUInt32BE(size, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 2; // color type RGB
	ihdr[10] = 0;
	ihdr[11] = 0;
	ihdr[12] = 0;

	const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
	return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const outDir = path.join(__dirname, '..', 'static', 'icons');
fs.mkdirSync(outDir, { recursive: true });
for (const size of [192, 512]) {
	fs.writeFileSync(path.join(outDir, `icon-${size}.png`), drawIcon(size));
	console.log(`wrote icon-${size}.png`);
}
