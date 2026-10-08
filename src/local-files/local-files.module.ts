import { Module } from '@nestjs/common';
import { LocalFilesService } from './local-files.service.js';
import { LocalFilesController } from './local-files.controller.js';

@Module({
  controllers: [LocalFilesController],
  providers: [LocalFilesService],
  exports: [LocalFilesService],
})
export class LocalFilesModule {}
