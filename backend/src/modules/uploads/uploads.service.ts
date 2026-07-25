import { Injectable } from '@nestjs/common';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';

@Injectable()
export class UploadsService {
  readonly uploadDir = join(process.cwd(), 'uploads');

  ensureDir() {
    if (!existsSync(this.uploadDir)) {
      mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  buildFilename(originalName: string): string {
    const ext = originalName.includes('.') ? originalName.split('.').pop() : 'bin';
    return `${Date.now()}-${randomBytes(6).toString('hex')}.${ext}`;
  }

  publicUrl(filename: string): string {
    return `/api/uploads/${filename}`;
  }
}
