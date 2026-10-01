export type ProductBarcodeFormFeedback = { kind: 'success'; message: string };

export function captureBarcodeForProductForm(
  barcode: string,
  updateBarcode: (value: string) => void,
  closeScanner: () => void,
): ProductBarcodeFormFeedback {
  updateBarcode(barcode);
  closeScanner();
  return { kind: 'success', message: 'Mã vạch đã được điền vào biểu mẫu.' };
}
