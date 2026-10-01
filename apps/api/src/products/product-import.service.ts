import { BadRequestException, ConflictException, Injectable, PayloadTooLargeException } from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import ExcelJS from 'exceljs';
import { extname } from 'node:path';
import { randomUUID } from 'node:crypto';

import { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { openingStockTransactionData } from './opening-stock-transaction';

export const PRODUCT_IMPORT_MAX_FILE_SIZE = 5 * 1024 * 1024;
export const PRODUCT_IMPORT_MAX_ROWS = 500;
export const PRODUCT_IMPORT_MAX_EXPANDED_SIZE = 25 * 1024 * 1024;
export const PRODUCT_IMPORT_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const headers = [
  'SKU', 'Barcode', 'Product name', 'Category slug', 'Unit', 'Cost price',
  'Selling price', 'Minimum stock', 'Status', 'Opening stock', 'Description',
] as const;
const headerKey = (value: string) => value.trim().toLowerCase();
const headerIndexes = new Map(headers.map((header, index) => [headerKey(header), index + 1]));
const decimalPattern = /^(?:0|[1-9]\d{0,34})(?:\.\d{1,30})?$/;
const maxInteger = 2_147_483_647;

export type ProductImportError = { row: number; column: string; message: string };
export type ProductImportPreviewRow = {
  row: number;
  sku: string;
  barcode: string;
  name: string;
  categorySlug: string;
  categoryName: string;
  unit: string;
  costPrice: string;
  sellingPrice: string;
  minStock: number;
  status: 'ACTIVE' | 'INACTIVE';
  openingStock: number;
  description: string;
  errors: ProductImportError[];
};

export type ProductImportFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

type InternalImportRow = ProductImportPreviewRow & { categoryId?: string };
type ValidationResult = {
  totalRows: number;
  rows: InternalImportRow[];
  errors: ProductImportError[];
};

@Injectable()
export class ProductImportService {
  constructor(private readonly prisma: PrismaService) {}

  async createTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SalesFlow';
    workbook.created = new Date(0);
    const sheet = workbook.addWorksheet('Products');
    sheet.addRow([...headers]);
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.getRow(1).font = { bold: true };
    sheet.columns = [
      { width: 24, numFmt: '@' }, { width: 22, numFmt: '@' }, { width: 30 },
      { width: 24 }, { width: 16 }, { width: 18 }, { width: 18 },
      { width: 18 }, { width: 16 }, { width: 18 }, { width: 48 },
    ];
    sheet.getColumn(1).numFmt = '@';
    sheet.getColumn(2).numFmt = '@';
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async preview(actor: AuthenticatedUser, file: ProductImportFile) {
    this.assertValidFile(file);
    const result = await this.validateWorkbook(actor, file.buffer);
    return this.toPublicPreview(result);
  }

  async import(actor: AuthenticatedUser, file: ProductImportFile) {
    this.assertValidFile(file);
    const result = await this.validateWorkbook(actor, file.buffer);
    const preview = this.toPublicPreview(result);
    if (preview.errors.length > 0 || preview.validRows !== preview.totalRows || preview.totalRows === 0) {
      throw new BadRequestException({ message: 'Import validation failed. Review the workbook preview and try again.', ...preview });
    }

    const rows = result.rows;
    const products: Prisma.ProductUncheckedCreateInput[] = rows.map((row) => ({
      id: randomUUID(),
      storeId: actor.storeId,
      categoryId: row.categoryId!,
      sku: row.sku,
      barcode: row.barcode || null,
      name: row.name,
      description: row.description || null,
      costPrice: new Prisma.Decimal(row.costPrice),
      sellingPrice: new Prisma.Decimal(row.sellingPrice),
      unit: row.unit,
      stockQuantity: row.openingStock,
      minStock: row.minStock,
      status: row.status as ProductStatus,
    }));
    const openingTransactions: Prisma.InventoryTransactionCreateManyInput[] = rows.flatMap((row, index) => row.openingStock > 0
      ? [openingStockTransactionData({
          storeId: actor.storeId,
          productId: products[index].id!,
          quantity: row.openingStock,
          actorId: actor.id,
        }) as Prisma.InventoryTransactionCreateManyInput]
      : []);

    try {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.product.createMany({ data: products });
        if (openingTransactions.length > 0) {
          await transaction.inventoryTransaction.createMany({ data: openingTransactions });
        }
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 });
    } catch (error) {
      if (this.isUniqueError(error)) {
        throw new ConflictException('A SKU or barcode was added by another request. Nothing was imported; preview the workbook again.');
      }
      if (this.isSerializationError(error)) {
        throw new ConflictException('Store data changed during import. Nothing was imported; preview the workbook again.');
      }
      throw error;
    }

    return { createdCount: products.length };
  }

  assertValidFile(file?: ProductImportFile): asserts file is ProductImportFile {
    if (!file || !Buffer.isBuffer(file.buffer)) throw new BadRequestException('An .xlsx workbook is required');
    if (file.size > PRODUCT_IMPORT_MAX_FILE_SIZE || file.buffer.length > PRODUCT_IMPORT_MAX_FILE_SIZE) {
      throw new PayloadTooLargeException('Workbook exceeds the 5 MB limit');
    }
    if (extname(file.originalname).toLowerCase() !== '.xlsx') throw new BadRequestException('Only .xlsx workbooks are supported');
    if (file.mimetype && file.mimetype !== PRODUCT_IMPORT_MIME_TYPE && file.mimetype !== 'application/octet-stream') {
      throw new BadRequestException('The uploaded file must be an .xlsx workbook');
    }
    if (file.buffer.length < 4 || file.buffer[0] !== 0x50 || file.buffer[1] !== 0x4b) {
      throw new BadRequestException('The uploaded file is not a valid Excel workbook');
    }
    assertSafeWorkbookArchive(file.buffer);
  }

  private async validateWorkbook(actor: AuthenticatedUser, buffer: Buffer): Promise<ValidationResult> {
    const workbook = new ExcelJS.Workbook();
    try {
      const excelBuffer = Buffer.from(buffer) as unknown as Parameters<typeof workbook.xlsx.load>[0];
      await workbook.xlsx.load(excelBuffer);
    } catch {
      throw new BadRequestException('The uploaded .xlsx workbook is damaged or unsupported');
    }
    if (workbook.worksheets.length !== 1 || workbook.worksheets[0].name !== 'Products') {
      throw new BadRequestException('Workbook must contain exactly one worksheet named Products');
    }
    const sheet = workbook.worksheets[0];
    if (sheet.rowCount > PRODUCT_IMPORT_MAX_ROWS + 1) {
      throw new BadRequestException(`Workbook exceeds the ${PRODUCT_IMPORT_MAX_ROWS} data row limit`);
    }
    if (sheet.columnCount > headers.length) {
      throw new BadRequestException(`Products worksheet may contain no more than ${headers.length} columns`);
    }

    const globalErrors: ProductImportError[] = [];
    const indexes = new Map<string, number>();
    const headerRow = sheet.getRow(1);
    const seenHeaders = new Set<string>();
    for (let column = 1; column <= Math.max(sheet.columnCount, headers.length); column += 1) {
      const cell = headerRow.getCell(column);
      const value = cell.value;
      if (isUnsafeCellValue(value)) {
        globalErrors.push({ row: 1, column: columnLabel(column), message: 'Formula or unsupported cell value is not allowed in the header' });
        continue;
      }
      if (typeof value !== 'string' || value.trim() === '') {
        if (column <= headers.length) globalErrors.push({ row: 1, column: columnLabel(column), message: 'Required header is missing' });
        continue;
      }
      const key = headerKey(value);
      const index = headerIndexes.get(key);
      if (index === undefined) {
        globalErrors.push({ row: 1, column: columnLabel(column), message: `Unexpected header "${value.trim()}"` });
      } else if (seenHeaders.has(key)) {
        globalErrors.push({ row: 1, column: value.trim(), message: 'Header appears more than once' });
      } else {
        seenHeaders.add(key);
        indexes.set(key, index);
      }
    }
    for (const header of headers) {
      if (!seenHeaders.has(headerKey(header))) globalErrors.push({ row: 1, column: header, message: 'Required header is missing' });
    }
    if (globalErrors.length > 0) return { totalRows: 0, rows: [], errors: globalErrors };

    const rows: InternalImportRow[] = [];
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const excelRow = sheet.getRow(rowNumber);
      if (!this.rowHasContent(excelRow)) continue;
      const errors: ProductImportError[] = [];
      const valueAt = (header: typeof headers[number]) => excelRow.getCell(indexes.get(headerKey(header))!).value;
      if (excelRow.cellCount > headers.length) {
        const extraValues = excelRow.values as unknown[];
        if (extraValues.slice(headers.length + 1).some((value) => !isBlankValue(value))) {
          errors.push({ row: rowNumber, column: 'Extra columns', message: 'Values outside the template columns are not allowed' });
        }
      }

      const sku = this.readText(valueAt('SKU'), rowNumber, 'SKU', errors, { required: true, maxLength: 100 }).toUpperCase();
      const barcode = this.readText(valueAt('Barcode'), rowNumber, 'Barcode', errors, { required: false, maxLength: 128 });
      const name = this.readText(valueAt('Product name'), rowNumber, 'Product name', errors, { required: true, maxLength: 160 });
      const categorySlug = this.readText(valueAt('Category slug'), rowNumber, 'Category slug', errors, { required: true, maxLength: 160 }).toLowerCase();
      if (categorySlug && !/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(categorySlug)) {
        errors.push({ row: rowNumber, column: 'Category slug', message: 'Category slug format is invalid' });
      }
      const unit = this.readText(valueAt('Unit'), rowNumber, 'Unit', errors, { required: true, maxLength: 40 });
      const costPrice = this.readDecimal(valueAt('Cost price'), rowNumber, 'Cost price', errors);
      const sellingPrice = this.readDecimal(valueAt('Selling price'), rowNumber, 'Selling price', errors);
      const minStock = this.readInteger(valueAt('Minimum stock'), rowNumber, 'Minimum stock', errors, false);
      const statusText = this.readText(valueAt('Status'), rowNumber, 'Status', errors, { required: true, maxLength: 16 }).toUpperCase();
      const openingStock = this.readInteger(valueAt('Opening stock'), rowNumber, 'Opening stock', errors, true);
      const description = this.readText(valueAt('Description'), rowNumber, 'Description', errors, { required: false, maxLength: 5000 });
      if (statusText !== 'ACTIVE' && statusText !== 'INACTIVE') {
        errors.push({ row: rowNumber, column: 'Status', message: 'Status must be ACTIVE or INACTIVE' });
      }
      rows.push({ row: rowNumber, sku, barcode, name, categorySlug, categoryName: '', unit,
        costPrice, sellingPrice, minStock, status: statusText === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
        openingStock, description, errors });
    }

    if (rows.length === 0) {
      globalErrors.push({ row: 1, column: 'Products', message: 'No product rows were found' });
      return { totalRows: 0, rows: [], errors: globalErrors };
    }

    this.addFileDuplicates(rows, 'SKU', (row) => row.sku);
    this.addFileDuplicates(rows, 'Barcode', (row) => row.barcode);

    const categorySlugs = [...new Set(rows.map((row) => row.categorySlug)
      .filter((slug) => slug.length <= 160 && /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(slug)))];
    const categories = categorySlugs.length === 0 ? [] : await this.prisma.category.findMany({
      where: { storeId: actor.storeId, slug: { in: categorySlugs } },
      select: { id: true, slug: true, name: true },
    });
    const categoryBySlug = new Map(categories.map((category) => [category.slug, category]));
    for (const row of rows) {
      const category = categoryBySlug.get(row.categorySlug);
      if (!category) row.errors.push({ row: row.row, column: 'Category slug', message: 'Category slug does not exist in the current Store' });
      else { row.categoryId = category.id; row.categoryName = category.name; }
    }

    const skus = [...new Set(rows.map((row) => row.sku).filter((sku) => sku.length > 0 && sku.length <= 100))];
    const barcodes = [...new Set(rows.map((row) => row.barcode).filter((barcode) => barcode.length > 0 && barcode.length <= 128))];
    const duplicateConditions: Prisma.ProductWhereInput[] = [];
    if (skus.length > 0) duplicateConditions.push({ sku: { in: skus } });
    if (barcodes.length > 0) duplicateConditions.push({ barcode: { in: barcodes } });
    if (duplicateConditions.length > 0) {
      const existingProducts = await this.prisma.product.findMany({
        where: { storeId: actor.storeId, OR: duplicateConditions },
        select: { sku: true, barcode: true },
      });
      const existingSkus = new Set(existingProducts.map((product) => product.sku));
      const existingBarcodes = new Set(existingProducts.map((product) => product.barcode).filter((barcode): barcode is string => Boolean(barcode)));
      for (const row of rows) {
        if (row.sku && existingSkus.has(row.sku)) row.errors.push({ row: row.row, column: 'SKU', message: 'SKU already exists in the current Store' });
        if (row.barcode && existingBarcodes.has(row.barcode)) row.errors.push({ row: row.row, column: 'Barcode', message: 'Barcode already exists in the current Store' });
      }
    }

    return { totalRows: rows.length, rows, errors: globalErrors };
  }

  private toPublicPreview(result: ValidationResult) {
    const rowErrors = result.rows.flatMap((row) => row.errors);
    const errors = [...result.errors, ...rowErrors];
    return {
      totalRows: result.totalRows,
      validRows: result.totalRows - result.rows.filter((row) => row.errors.length > 0).length,
      errorRows: result.rows.filter((row) => row.errors.length > 0).length,
      errors,
      rows: result.rows.map((row) => ({
        row: row.row, sku: row.sku, barcode: row.barcode, name: row.name,
        categorySlug: row.categorySlug, categoryName: row.categoryName, unit: row.unit,
        costPrice: row.costPrice, sellingPrice: row.sellingPrice, minStock: row.minStock,
        status: row.status, openingStock: row.openingStock, description: row.description, errors: row.errors,
      })),
    };
  }

  private rowHasContent(row: ExcelJS.Row): boolean {
    for (let column = 1; column <= Math.max(row.cellCount, headers.length); column += 1) {
      if (!isBlankValue(row.getCell(column).value)) return true;
    }
    return false;
  }

  private readText(value: unknown, row: number, column: string, errors: ProductImportError[], options: { required: boolean; maxLength: number }): string {
    if (isUnsafeCellValue(value)) {
      errors.push({ row, column, message: 'Formula or unsupported cell value is not allowed' });
      return '';
    }
    if (value === null || value === undefined || value === '') {
      if (options.required) errors.push({ row, column, message: 'This field is required' });
      return '';
    }
    if (typeof value !== 'string') {
      errors.push({ row, column, message: 'This field must be stored as text in Excel' });
      return '';
    }
    const normalized = value.trim();
    if (!normalized && options.required) errors.push({ row, column, message: 'This field is required' });
    if (normalized.length > options.maxLength) errors.push({ row, column, message: `Must be ${options.maxLength} characters or fewer` });
    return normalized;
  }

  private readDecimal(value: unknown, row: number, column: string, errors: ProductImportError[]): string {
    if (isUnsafeCellValue(value) || (typeof value !== 'string' && typeof value !== 'number')) {
      errors.push({ row, column, message: 'Enter a numeric value greater than or equal to 0' });
      return '0';
    }
    const normalized = String(value).trim();
    if (!decimalPattern.test(normalized)) {
      errors.push({ row, column, message: 'Enter a non-negative decimal value with up to 35 integer and 30 decimal digits' });
      return '0';
    }
    return normalized;
  }

  private readInteger(value: unknown, row: number, column: string, errors: ProductImportError[], blankAsZero: boolean): number {
    if (value === null || value === undefined || value === '') {
      if (!blankAsZero) errors.push({ row, column, message: 'This field is required' });
      return 0;
    }
    if (isUnsafeCellValue(value) || (typeof value !== 'string' && typeof value !== 'number')) {
      errors.push({ row, column, message: 'Enter a non-negative whole number' });
      return 0;
    }
    const normalized = String(value).trim();
    if (!/^(?:0|[1-9]\d*)$/.test(normalized)) {
      errors.push({ row, column, message: 'Enter a non-negative whole number' });
      return 0;
    }
    const number = Number(normalized);
    if (!Number.isSafeInteger(number) || number > maxInteger) {
      errors.push({ row, column, message: `Must be between 0 and ${maxInteger}` });
      return 0;
    }
    return number;
  }

  private addFileDuplicates(rows: InternalImportRow[], column: string, valueOf: (row: InternalImportRow) => string) {
    const groups = new Map<string, InternalImportRow[]>();
    for (const row of rows) {
      const value = valueOf(row);
      if (!value) continue;
      const group = groups.get(value) ?? [];
      group.push(row);
      groups.set(value, group);
    }
    for (const group of groups.values()) {
      if (group.length > 1) {
        for (const row of group) row.errors.push({ row: row.row, column, message: `${column} is duplicated in this workbook` });
      }
    }
  }

  private isUniqueError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
  }

  private isSerializationError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034';
  }
}

function isUnsafeCellValue(value: unknown): boolean {
  return value instanceof Date || (typeof value === 'object' && value !== null);
}

function isBlankValue(value: unknown): boolean {
  return value === null || value === undefined || value === '' || (typeof value === 'string' && value.trim() === '');
}

function columnLabel(index: number): string {
  let value = index;
  let label = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

function assertSafeWorkbookArchive(buffer: Buffer): void {
  const firstEndOfCentralDirectory = Math.max(0, buffer.length - 22 - 0xffff);
  let endOffset = -1;
  for (let offset = buffer.length - 22; offset >= firstEndOfCentralDirectory; offset -= 1) {
    if (buffer.readUInt32LE(offset) !== 0x06054b50) continue;
    const commentLength = buffer.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === buffer.length) { endOffset = offset; break; }
  }
  if (endOffset < 0) throw new BadRequestException('The uploaded file is not a complete .xlsx archive');

  const diskNumber = buffer.readUInt16LE(endOffset + 4);
  const centralDirectoryDisk = buffer.readUInt16LE(endOffset + 6);
  const entriesOnDisk = buffer.readUInt16LE(endOffset + 8);
  const totalEntries = buffer.readUInt16LE(endOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(endOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(endOffset + 16);
  if (diskNumber !== 0 || centralDirectoryDisk !== 0 || entriesOnDisk !== totalEntries
    || totalEntries === 0 || totalEntries > 100 || totalEntries === 0xffff
    || centralDirectorySize === 0xffffffff || centralDirectoryOffset === 0xffffffff
    || centralDirectoryOffset + centralDirectorySize > endOffset) {
    throw new BadRequestException('The .xlsx archive layout is unsupported or exceeds safety limits');
  }

  let offset = centralDirectoryOffset;
  let expandedSize = 0;
  const names = new Set<string>();
  for (let entry = 0; entry < totalEntries; entry += 1) {
    if (offset + 46 > endOffset || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new BadRequestException('The .xlsx archive directory is invalid');
    }
    const flags = buffer.readUInt16LE(offset + 8);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const filenameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const entryLength = 46 + filenameLength + extraLength + commentLength;
    if (offset + entryLength > endOffset || (flags & 0x0001) !== 0 || uncompressedSize === 0xffffffff) {
      throw new BadRequestException('Encrypted or unsupported .xlsx archive entries are not allowed');
    }
    const name = buffer.toString('utf8', offset + 46, offset + 46 + filenameLength);
    if (name.toLowerCase().endsWith('vbaproject.bin')) throw new BadRequestException('Macro-enabled workbooks are not supported');
    names.add(name);
    expandedSize += uncompressedSize;
    if (uncompressedSize > 12 * 1024 * 1024 || expandedSize > PRODUCT_IMPORT_MAX_EXPANDED_SIZE) {
      throw new PayloadTooLargeException('Expanded workbook content exceeds the 25 MB safety limit');
    }
    offset += entryLength;
  }
  if (offset !== centralDirectoryOffset + centralDirectorySize
    || !names.has('[Content_Types].xml') || !names.has('xl/workbook.xml')
    || ![...names].some((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))) {
    throw new BadRequestException('The uploaded file is not a valid Excel workbook');
  }
}
