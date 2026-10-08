import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { LocalFilesService } from './local-files.service.js';

@Controller('files')
export class LocalFilesController {
  constructor(private readonly filesService: LocalFilesService) {}

  @Get('workspaces')
  getWorkspaces() {
    return this.filesService.getWorkspaces();
  }

  @Get('explore')
  exploreDirectory(@Query('path') path?: string) {
    return this.filesService.explore(path);
  }

  @Get('read')
  readFile(
    @Query('path') path: string,
    @Query('maxLines') maxLines?: string,
  ) {
    const lines = maxLines ? parseInt(maxLines, 10) : 500;
    return this.filesService.readFileContent(path, isNaN(lines) ? 500 : lines);
  }

  @Post('read-multiple')
  readMultiple(
    @Body() body: { paths: string[]; maxTotalBytes?: number; maxLines?: number },
  ) {
    return this.filesService.readMultipleFiles(
      body.paths || [],
      body.maxTotalBytes,
      body.maxLines,
    );
  }

  @Get('tree')
  getTree(
    @Query('path') path: string,
    @Query('depth') depth?: string,
  ) {
    const maxDepth = depth ? parseInt(depth, 10) : 2;
    return {
      tree: this.filesService.getDirectoryTree(path, isNaN(maxDepth) ? 2 : maxDepth),
    };
  }
}
