import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersDto } from './dto/list-orders.dto';
import { OrderReasonDto } from './dto/order-reason.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
@UseGuards(AuthGuard, PermissionsGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get() @RequirePermissions('orders:read')
  list(@CurrentUser() actor: AuthenticatedUser, @Query() query: ListOrdersDto) { return this.orders.list(actor, query); }

  @Get(':id') @RequirePermissions('orders:read')
  get(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) { return this.orders.get(actor, id); }

  @Post() @RequirePermissions('orders:create')
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateOrderDto) { return this.orders.create(actor, dto); }

  @Patch(':id/status') @RequirePermissions('orders:update')
  updateStatus(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.orders.updateStatus(actor, id, dto);
  }

  @Post(':id/cancel') @RequirePermissions('orders:cancel')
  cancel(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: OrderReasonDto) {
    return this.orders.cancel(actor, id, dto);
  }

  @Post(':id/refund') @RequirePermissions('orders:refund')
  refund(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: OrderReasonDto) {
    return this.orders.refund(actor, id, dto);
  }
}
