import { Module } from '@nestjs/common';
import { PreviewService, storageProvider } from './preview.service';
import { PreviewAdminController, PreviewPublicController } from './preview.controller';

@Module({
  providers: [storageProvider, PreviewService],
  controllers: [PreviewPublicController, PreviewAdminController],
  exports: [PreviewService, storageProvider],
})
export class PreviewModule {}
