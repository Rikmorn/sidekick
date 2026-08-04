export interface Notification {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  readAt: string | null;
}

export interface Recipient {
  userId: string;
  displayName: string;
  email: string;
}
