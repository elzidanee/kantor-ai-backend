import { Module } from '@nestjs/common';
import { LlmService } from './llm.service.js';
import { LlmController } from './llm.controller.js';

@Module({
  providers: [LlmService],
  exports: [LlmService],
  controllers: [LlmController]
})
export class LlmModule {}
