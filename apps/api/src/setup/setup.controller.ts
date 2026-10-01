import { Body, Controller, Get, Post } from '@nestjs/common';

import { SetupDto } from './dto/setup.dto';
import { SetupService } from './setup.service';

@Controller('setup')
export class SetupController {
  constructor(private readonly setup: SetupService) {}

  @Get('status')
  getStatus() {
    return this.setup.getStatus();
  }

  @Post()
  create(@Body() dto: SetupDto) {
    return this.setup.create(dto);
  }
}
