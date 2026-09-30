import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CustomerStatus, OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CustomerHistoryDto } from './dto/customer-history.dto';
import { ListCustomersDto } from './dto/list-customers.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthenticatedUser, query: ListCustomersDto) {
    const search = query.search?.trim();
    const where: Prisma.CustomerWhereInput = {
      storeId: actor.storeId,
      ...(query.status ? { status: query.status as CustomerStatus } : {}),
      ...(search ? { OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({ where, skip: (query.page - 1) * query.limit, take: query.limit,
        orderBy: [{ [query.sortBy]: query.order }, { id: 'asc' }] }),
      this.prisma.customer.count({ where }),
    ]);
    return { items, total, page: query.page, limit: query.limit };
  }

  async create(actor: AuthenticatedUser, dto: CreateCustomerDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Customer name is required');
    return this.prisma.customer.create({ data: {
      storeId: actor.storeId, name, phone: this.optionalText(dto.phone), email: this.email(dto.email),
      address: this.optionalText(dto.address), note: this.optionalText(dto.note), status: CustomerStatus.ACTIVE,
    } });
  }

  async get(actor: AuthenticatedUser, id: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id, storeId: actor.storeId } });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateCustomerDto) {
    await this.get(actor, id);
    if (dto.name !== undefined && !dto.name.trim()) throw new BadRequestException('Customer name is required');
    return this.prisma.customer.update({ where: { id }, data: {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.phone !== undefined ? { phone: this.optionalText(dto.phone) } : {}),
      ...(dto.email !== undefined ? { email: this.email(dto.email) } : {}),
      ...(dto.address !== undefined ? { address: this.optionalText(dto.address) } : {}),
      ...(dto.note !== undefined ? { note: this.optionalText(dto.note) } : {}),
      ...(dto.status !== undefined ? { status: dto.status as CustomerStatus } : {}),
    } });
  }

  async remove(actor: AuthenticatedUser, id: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id, storeId: actor.storeId },
      include: { _count: { select: { orders: true } } } });
    if (!customer) throw new NotFoundException('Customer not found');
    if (customer._count.orders > 0) {
      const inactive = await this.prisma.customer.update({ where: { id }, data: { status: CustomerStatus.INACTIVE } });
      return { ...inactive, deactivated: true };
    }
    try {
      await this.prisma.customer.delete({ where: { id } });
      return { id, deleted: true };
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2003') {
        const inactive = await this.prisma.customer.update({ where: { id }, data: { status: CustomerStatus.INACTIVE } });
        return { ...inactive, deactivated: true };
      }
      throw error;
    }
  }

  async history(actor: AuthenticatedUser, id: string, query: CustomerHistoryDto) {
    const customer = await this.prisma.customer.findFirst({ where: { id, storeId: actor.storeId },
      select: { id: true, name: true, phone: true, email: true, status: true } });
    if (!customer) throw new NotFoundException('Customer not found');
    const where: Prisma.OrderWhereInput = { storeId: actor.storeId, customerId: id,
      orderStatus: OrderStatus.COMPLETED, paymentStatus: PaymentStatus.PAID };
    const [totalOrders, totals, orders, total] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.aggregate({ where, _sum: { total: true } }),
      this.prisma.order.findMany({ where, skip: (query.page - 1) * query.limit, take: query.limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: {
          id: true, orderCode: true, subtotal: true, discount: true, total: true, paymentMethod: true,
          paymentStatus: true, orderStatus: true, createdAt: true,
          items: { select: { productNameSnapshot: true, skuSnapshot: true, quantity: true, unitPrice: true, discount: true, total: true } },
        } }),
      this.prisma.order.count({ where }),
    ]);
    return { customer, summary: { totalOrders, totalPurchaseAmount: (totals._sum.total ?? new Prisma.Decimal(0)).toString() },
      orders: { items: orders, total, page: query.page, limit: query.limit } };
  }

  private email(value?: string | null) { return value?.trim().toLowerCase() || null; }
  private optionalText(value?: string | null) { return value?.trim() || null; }
}
