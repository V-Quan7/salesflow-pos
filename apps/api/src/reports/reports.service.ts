import { BadRequestException, Injectable } from '@nestjs/common';
import { OrderStatus, PaymentStatus, Prisma, ProductStatus } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.types';
import { storeDateRange } from '../common/store-date';
import { PrismaService } from '../prisma/prisma.service';
import { DateRangeDto, InventoryReportDto } from './dto/date-range.dto';

function localDay(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(actor: AuthenticatedUser) {
    const today = localDay(new Date(), actor.store.timezone);
    const range = storeDateRange(today, today, actor.store.timezone)!;
    const paidToday: Prisma.OrderWhereInput = { storeId: actor.storeId, orderStatus: OrderStatus.COMPLETED,
      paymentStatus: PaymentStatus.PAID, createdAt: range };
    const [revenue, ordersToday, itemsSold, lowStockProducts, recentOrders] = await Promise.all([
      this.revenueForRange(actor, range),
      this.prisma.order.count({ where: paidToday }),
      this.prisma.orderItem.aggregate({ where: { order: { is: paidToday } }, _sum: { quantity: true } }),
      this.prisma.product.count({ where: { storeId: actor.storeId, status: ProductStatus.ACTIVE,
        stockQuantity: { lte: this.prisma.product.fields.minStock } } }),
      this.prisma.order.findMany({ where: { storeId: actor.storeId }, take: 10, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { id: true, orderCode: true, total: true, orderStatus: true, paymentStatus: true, createdAt: true,
          customer: { select: { id: true, name: true } } } }),
    ]);
    return { date: today, timezone: actor.store.timezone, revenueToday: revenue.total,
      ordersToday, productsSoldToday: itemsSold._sum.quantity ?? 0, lowStockProducts, recentOrders };
  }

  async revenue(actor: AuthenticatedUser, query: DateRangeDto) {
    const range = this.range(actor, query);
    const result = await this.revenueForRange(actor, range);
    return { timezone: actor.store.timezone, dateFrom: query.dateFrom ?? localDay(new Date(), actor.store.timezone),
      dateTo: query.dateTo ?? localDay(new Date(), actor.store.timezone), ...result };
  }

  async topProducts(actor: AuthenticatedUser, query: DateRangeDto) {
    const range = this.range(actor, query);
    const groups = await this.prisma.orderItem.groupBy({
      by: ['productNameSnapshot', 'skuSnapshot'],
      where: { order: { is: { storeId: actor.storeId, orderStatus: OrderStatus.COMPLETED,
        paymentStatus: PaymentStatus.PAID, createdAt: range } } },
      _sum: { quantity: true },
      orderBy: [{ _sum: { quantity: 'desc' } }, { productNameSnapshot: 'asc' }, { skuSnapshot: 'asc' }],
      take: query.limit,
    });
    return { timezone: actor.store.timezone, dateFrom: query.dateFrom ?? localDay(new Date(), actor.store.timezone),
      dateTo: query.dateTo ?? localDay(new Date(), actor.store.timezone),
      items: groups.map(({ productNameSnapshot, skuSnapshot, _sum }) => ({ productNameSnapshot, skuSnapshot, quantity: _sum.quantity ?? 0 })) };
  }

  async inventory(actor: AuthenticatedUser, query: InventoryReportDto) {
    const base: Prisma.ProductWhereInput = { storeId: actor.storeId, status: ProductStatus.ACTIVE };
    const low: Prisma.ProductWhereInput = { ...base, stockQuantity: { lte: this.prisma.product.fields.minStock } };
    const out: Prisma.ProductWhereInput = { ...base, stockQuantity: 0 };
    const where = query.state === 'LOW_STOCK' ? low : query.state === 'OUT_OF_STOCK' ? out : base;
    const [productCount, lowStockProducts, outOfStockProducts, total, items] = await Promise.all([
      this.prisma.product.count({ where: base }), this.prisma.product.count({ where: low }), this.prisma.product.count({ where: out }),
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({ where, skip: (query.page - 1) * query.limit, take: query.limit,
        orderBy: [{ stockQuantity: 'asc' }, { name: 'asc' }],
        select: { id: true, sku: true, name: true, stockQuantity: true, minStock: true, unit: true,
          category: { select: { id: true, name: true } } } }),
    ]);
    return { summary: { productCount, lowStockProducts, outOfStockProducts }, items, total, page: query.page, limit: query.limit };
  }

  private range(actor: AuthenticatedUser, query: DateRangeDto) {
    if ((query.dateFrom && !query.dateTo) || (!query.dateFrom && query.dateTo)) {
      throw new BadRequestException('dateFrom and dateTo must be supplied together');
    }
    if (query.dateFrom && query.dateTo) return storeDateRange(query.dateFrom, query.dateTo, actor.store.timezone)!;
    const today = localDay(new Date(), actor.store.timezone);
    return storeDateRange(today, today, actor.store.timezone)!;
  }

  private async revenueForRange(actor: AuthenticatedUser, range: { gte?: Date; lt?: Date }) {
    const dailyRows = await this.prisma.$queryRaw<Array<{ date: string; sales: Prisma.Decimal; refunds: Prisma.Decimal }>>(Prisma.sql`
      WITH sale_events AS (
        SELECT ("createdAt" AT TIME ZONE ${actor.store.timezone})::date AS day, SUM("total") AS amount
        FROM "Order"
        WHERE "storeId" = CAST(${actor.storeId} AS uuid)
          AND "createdAt" >= ${range.gte!} AND "createdAt" < ${range.lt!}
          AND "orderStatus" IN ('COMPLETED', 'REFUNDED')
          AND "paymentStatus" IN ('PAID', 'REFUNDED')
        GROUP BY 1
      ), refund_events AS (
        SELECT ("refundedAt" AT TIME ZONE ${actor.store.timezone})::date AS day, SUM("total") AS amount
        FROM "Order"
        WHERE "storeId" = CAST(${actor.storeId} AS uuid)
          AND "refundedAt" >= ${range.gte!} AND "refundedAt" < ${range.lt!}
          AND "orderStatus" = 'REFUNDED' AND "paymentStatus" = 'REFUNDED'
        GROUP BY 1
      )
      SELECT COALESCE(sale_events.day, refund_events.day)::text AS date,
        COALESCE(sale_events.amount, 0)::numeric AS sales,
        COALESCE(refund_events.amount, 0)::numeric AS refunds
      FROM sale_events FULL OUTER JOIN refund_events USING (day)
      ORDER BY date ASC
    `);
    const daily = dailyRows.map(({ date, sales, refunds }) => ({
      date, sales: sales.toString(), refunds: refunds.toString(), netRevenue: sales.sub(refunds).toString(),
    }));
    const sales = daily.reduce((total, day) => total.add(day.sales), new Prisma.Decimal(0));
    const refunds = daily.reduce((total, day) => total.add(day.refunds), new Prisma.Decimal(0));
    return { sales: sales.toString(), refunds: refunds.toString(), total: sales.sub(refunds).toString(), daily };
  }
}
