export interface Chat {
  id: string; // The ID of the other user or the group
  type: 'user' | 'group';
  lastMessage: string;
  lastMessageType: 'text' | 'audio' | 'image' | 'video' | 'file';
  timestamp: any;
  unreadCount: number;
  isPinned?: boolean;
  isMuted?: boolean;
  muteUntil?: number;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  phoneNumber: string;
  photoURL?: string;
  publicKey: string;
  lastSeen?: any;
  privacy?: {
    lastSeen: 'everyone' | 'nobody' | 'contacts';
    online: 'everyone' | 'same_as_last_seen';
    readReceipts: boolean;
    typing: boolean;
    recording: boolean;
    groups: 'everyone' | 'contacts';
    profilePhoto: 'everyone' | 'nobody' | 'contacts';
    status: 'everyone' | 'nobody' | 'contacts';
  };
  customization?: {
    theme: 'light' | 'dark' | 'system';
    color: string;
    font: string;
    bubbleShape: 'rounded' | 'square' | 'modern';
  };
  customNames?: Record<string, string>;
  theme?: 'light' | 'dark';
  lockedChats?: string[]; // Array of user UIDs or group IDs
  pinnedChats?: string[]; // Array of user UIDs or group IDs
  password?: string;
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
  type?: 'text' | 'audio' | 'image' | 'video' | 'file';
  fileName?: string;
  fileSize?: number;
  deletedFor?: string[];
  read?: boolean;
  quotedMessageId?: string;
  isEdited?: boolean;
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

export interface Call {
  id: string;
  callerId: string;
  receiverId: string;
  type: 'audio' | 'video';
  status: 'ringing' | 'accepted' | 'rejected' | 'ended';
  offer?: any;
  answer?: any;
  timestamp: any;
}
