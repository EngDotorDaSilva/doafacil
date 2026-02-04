export type UserRole = 'donor' | 'center' | 'admin';

export type User = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  phone?: string | null;
  avatarUrl?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export type CenterProfile = {
  id: number;
  userId: number;
  displayName: string;
  address: string;
  lat: number | null;
  lng: number | null;
  hours: string | null;
  acceptedItemTypes: string[];
  approved: boolean;
  createdAt: string;
  updatedAt: string;
};

