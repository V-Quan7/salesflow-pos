import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';

import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AdjustInventoryDto } from './dto/adjust-inventory.dto';
import { ListInventoryHistoryDto } from './dto/list-inventory-history.dto';
import { ListInventoryDto } from './dto/list-inventory.dto';
import { InventoryService } from './inventory.service';

@Controller('inventory')
@UseGuards(AuthGuard, PermissionsGuard)
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  @RequirePermissions('inventory:read')
  list(@CurrentUser() actor: AuthenticatedUser, @Query() query: ListInventoryDto) {
    return this.inventory.list(actor, query);
  }

  @Post('adjust')
  @RequirePermissions('inventory:adjust')
  adjust(@CurrentUser() actor: AuthenticatedUser, @Body() dto: AdjustInventoryDto) {
    return this.inventory.adjust(actor, dto);
  }

  @Get(':productId/history')
  @RequirePermissions('inventory:read')
  history(@CurrentUser() actor: AuthenticatedUser, @Param('productId', ParseUUIDPipe) productId: string,
    @Query() query: ListInventoryHistoryDto) {
    return this.inventory.history(actor, productId, query);
  }
}
