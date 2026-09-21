import fs from 'node:fs';
import qrcode from 'qrcode-generator';
fs.mkdirSync('tests/fixtures', { recursive: true });
const qr = qrcode(0, 'M');
qr.addData('https://example.com/image-import-check');
qr.make();
fs.writeFileSync(
  'tests/fixtures/standard-qr.gif',
  Buffer.from(qr.createDataURL(8, 32).split(',')[1], 'base64'),
);
fs.writeFileSync(
  'tests/fixtures/plain-image.gif',
  Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'),
);
fs.writeFileSync('tests/fixtures/invalid-backup.json', JSON.stringify({ version: 99, cards: [] }));
console.log('Created standard QR, undecodable image and invalid backup fixtures.');
