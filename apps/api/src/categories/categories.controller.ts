import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { AuthenticatedUser } from '../auth/auth.types';
import { AuthGuard } from '../auth/guards/auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { ListCategoriesDto } from './dto/list-categories.dto';

@Controller('categories')
@UseGuards(AuthGuard, PermissionsGuard)
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @RequirePermissions('categories:read')
  list(@CurrentUser() actor: AuthenticatedUser, @Query() query: ListCategoriesDto) {
    return this.categories.list(actor, query);
  }

  @Post()
  @RequirePermissions('categories:create')
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateCategoryDto) {
    return this.categories.create(actor, dto);
  }

  @Patch(':id')
  @RequirePermissions('categories:update')
  update(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCategoryDto) {
    return this.categories.update(actor, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('categories:delete')
  remove(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.categories.remove(actor, id);
  }
}
