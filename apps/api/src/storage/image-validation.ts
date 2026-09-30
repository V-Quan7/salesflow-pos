import { BadRequestException } from '@nestjs/common';

export interface UploadedImageFile {
  buffer: Buffer;
  mimetype: string;
}

export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

const imageTypes = new Map<string, { extension: string; signature: (buffer: Buffer) => boolean }>([
  ['image/png', { extension: '.png', signature: (buffer) => buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) }],
  ['image/jpeg', { extension: '.jpg', signature: (buffer) => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer.at(-2) === 0xff && buffer.at(-1) === 0xd9 }],
  ['image/webp', { extension: '.webp', signature: (buffer) => buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP' }],
  ['image/x-icon', { extension: '.ico', signature: (buffer) => buffer.length >= 6 && buffer.readUInt16LE(0) === 0 && buffer.readUInt16LE(2) === 1 }],
]);

export function imageUploadOptions() {
  return {
    limits: { fileSize: MAX_IMAGE_SIZE, files: 1 },
    fileFilter: (_request: unknown, file: { mimetype: string }, callback: (error: Error | null, acceptFile: boolean) => void) => {
      if (!imageTypes.has(file.mimetype)) return callback(new BadRequestException('Only PNG, JPEG, WebP, or ICO images are supported'), false);
      callback(null, true);
    },
  };
}

export function validateImageSignature(file: UploadedImageFile): string | undefined {
  const imageType = imageTypes.get(file.mimetype);
  return imageType?.signature(file.buffer) ? imageType.extension : undefined;
}
