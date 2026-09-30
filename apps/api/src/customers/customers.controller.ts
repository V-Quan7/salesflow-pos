import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CustomerHistoryDto } from './dto/customer-history.dto';
import { ListCustomersDto } from './dto/list-customers.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomersService } from './customers.service';

@Controller('customers')
@UseGuards(AuthGuard, PermissionsGuard)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get() @RequirePermissions('customers:read')
  list(@CurrentUser() actor: AuthenticatedUser, @Query() query: ListCustomersDto) { return this.customers.list(actor, query); }

  @Post() @RequirePermissions('customers:create')
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateCustomerDto) { return this.customers.create(actor, dto); }

  @Get(':id/history') @RequirePermissions('customers:read')
  history(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Query() query: CustomerHistoryDto) {
    return this.customers.history(actor, id, query);
  }

  @Get(':id') @RequirePermissions('customers:read')
  get(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) { return this.customers.get(actor, id); }

  @Patch(':id') @RequirePermissions('customers:update')
  update(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCustomerDto) {
    return this.customers.update(actor, id, dto);
  }

  @Delete(':id') @RequirePermissions('customers:delete')
  remove(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) { return this.customers.remove(actor, id); }
}
