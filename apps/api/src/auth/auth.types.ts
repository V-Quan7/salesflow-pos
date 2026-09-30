export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  status: 'ACTIVE' | 'INACTIVE';
  storeId: string;
  roleId: string;
  roleName: string;
  roleStoreId: string | null;
  store: { id: string; code: string; name: string; timezone: string };
  permissions: string[];
}

export interface AuthRequest extends Request {
  user: AuthenticatedUser;
}

export interface JwtClaims {
  sub: string;
  sid: string;
}
