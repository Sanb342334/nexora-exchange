import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { UploadsService } from './uploads.service';

const ALLOWED = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.gif']);

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Файл не передан');
    const ext = extname(file.originalname).toLowerCase();
    if (!ALLOWED.has(ext)) {
      throw new BadRequestException('Допустимы JPG, PNG, WEBP, PDF, GIF');
    }
    this.uploads.ensureDir();
    const filename = this.uploads.buildFilename(file.originalname);
    writeFileSync(join(this.uploads.uploadDir, filename), file.buffer);
    return { url: this.uploads.publicUrl(filename) };
  }
}
