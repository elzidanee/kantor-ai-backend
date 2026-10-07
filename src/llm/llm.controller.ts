import { Controller, Get } from '@nestjs/common';
import { LlmService } from './llm.service.js';

@Controller('llm')
export class LlmController {
  constructor(private llm: LlmService) {}

  @Get('test')
  test() {
    return this.llm.chat('Jawab singkat dalam bahasa Indonesia.', 'Sebutkan 3 peran di kantor AI.');
  }
}