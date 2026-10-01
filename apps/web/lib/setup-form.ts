export function passwordConfirmationError(password: string, confirmation: string): string | null {
  return password === confirmation ? null : 'Mật khẩu xác nhận không khớp.';
}

export function setupRequestError(status: unknown): string {
  if (status === 400) return 'Thông tin cửa hàng hoặc Owner chưa hợp lệ. Hãy kiểm tra các trường bắt buộc.';
  if (status === 401 || status === 403) return 'Setup Token không hợp lệ. Hãy kiểm tra token do người vận hành cung cấp.';
  if (status === 409) return 'Hệ thống đã được khởi tạo hoặc thông tin bị trùng. Tải lại trang để kiểm tra trạng thái.';
  if (status === 503) return 'Thiết lập khởi tạo chưa sẵn sàng. Liên hệ người vận hành hệ thống.';
  return 'Không thể khởi tạo hệ thống lúc này. Hãy thử lại sau.';
}
