import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { DateRangeDto, InventoryReportDto } from './dto/date-range.dto';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermissions('reports:read')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('dashboard') dashboard(@CurrentUser() actor: AuthenticatedUser) { return this.reports.dashboard(actor); }
  @Get('revenue') revenue(@CurrentUser() actor: AuthenticatedUser, @Query() query: DateRangeDto) { return this.reports.revenue(actor, query); }
  @Get('top-products') topProducts(@CurrentUser() actor: AuthenticatedUser, @Query() query: DateRangeDto) { return this.reports.topProducts(actor, query); }
  @Get('inventory') inventory(@CurrentUser() actor: AuthenticatedUser, @Query() query: InventoryReportDto) { return this.reports.inventory(actor, query); }
}
