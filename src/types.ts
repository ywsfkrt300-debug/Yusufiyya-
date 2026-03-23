export interface UserProfile {
  uid: string;
  displayName: string;
  phoneNumber: string;
  photoURL: string;
  publicKey: string;
  lastSeen?: any;
  privacy?: {
    lastSeen: 'everyone' | 'nobody';
    status: 'everyone' | 'nobody';
  };
  customNames?: Record<string, string>;
  theme?: 'light' | 'dark';
}

export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  ciphertext: string;
  iv: string;
  encKeySender: string;
  encKeyReceiver: string;
  timestamp: any;
  type?: 'text' | 'audio';
  deletedFor?: string[];
  read?: boolean;
  quotedMessageId?: string;
}

export interface DecryptedMessage extends Message {
  text: string;
}

export interface Group {
  id: string;
  name: string;
  members: string[]; // Array of user UIDs
  createdBy: string;
  createdAt: any;
  photoURL: string;
}
