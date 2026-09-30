import { Body, Controller, Delete, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { AuthenticatedUser } from '../auth/auth.types';
import { AuthGuard } from '../auth/guards/auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(AuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions('users:read')
  list(@CurrentUser() actor: AuthenticatedUser, @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 20, @Query('search') search?: string,
    @Query('status') status?: string) {
    return this.users.list(actor, Math.max(1, page), Math.min(100, Math.max(1, limit)), search, status);
  }

  @Post()
  @RequirePermissions('users:create')
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateUserDto) { return this.users.create(actor, dto); }

  @Get(':id')
  @RequirePermissions('users:read')
  get(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) { return this.users.get(actor, id); }

  @Patch(':id')
  @RequirePermissions('users:update')
  update(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(actor, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('users:delete')
  deactivate(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) { return this.users.deactivate(actor, id); }
}
