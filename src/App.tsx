import React, { useState, useEffect, useRef, useMemo } from 'react';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { db, auth } from './firebase';
import { collection, doc, setDoc, getDoc, getDocs, onSnapshot, query, where, orderBy, addDoc, serverTimestamp, or, deleteDoc, updateDoc, arrayUnion, writeBatch, increment, limit } from 'firebase/firestore';
import { generateKeyPair, exportPublicKey, exportPrivateKey, encryptMessage, decryptMessage } from './lib/crypto';
import { savePrivateKey, getPrivateKey } from './lib/idb';
import EmojiPicker, { Theme } from 'emoji-picker-react';
import { format } from 'date-fns';
import { MessageCircle, Send, Smile, Lock, Unlock, Phone, Video, Camera, Settings, CircleDashed, Users, Mic, Square, Trash2, MoreVertical, Play, Pause, Check, CheckCheck, User as UserIcon, Paperclip, File, Image as ImageIcon, Download, X, Pin, Search, BellOff, Bell } from 'lucide-react';
import clsx from 'clsx';
import { AnimatePresence } from 'motion/react';
import AnimatedEmoji from './components/AnimatedEmoji';
import StatusTab from './components/StatusTab';
import SettingsTab from './components/SettingsTab';
import ImageCropperModal from './components/ImageCropperModal';
import CallScreen from './components/CallScreen';
import IncomingCall from './components/IncomingCall';
import { UserProfile, Message, DecryptedMessage, Group, Call, Chat } from './types';

const isEmojiOnly = (text: string) => {
  const emojiRegex = /^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}]+$/u;
  return emojiRegex.test(text.trim());
};

// ... (interfaces and AVATARS remain the same)
const AudioPlayer = ({ src }: { src: string }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <div className="flex items-center gap-2 bg-black/5 rounded-full p-1 pr-3 mt-1">
      <button onClick={togglePlay} className="bg-[#25D366] text-white p-2 rounded-full hover:bg-[#128C7E] transition">
        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>
      <div className="w-32 h-1.5 bg-gray-300 rounded-full overflow-hidden">
        <div className="h-full bg-[#25D366] transition-all duration-300" style={{ width: isPlaying ? '100%' : '0%' }}></div>
      </div>
      <audio 
        ref={audioRef} 
        src={src} 
        onEnded={() => setIsPlaying(false)} 
        className="hidden" 
      />
    </div>
  );
};

const AVATARS = [
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Jocelyn",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Nala",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Oliver",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Sam",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Tinkerbell",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Zoe"
];

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  const [step, setStep] = useState<'phone' | 'profile' | 'main'>('phone');
  const [activeTab, setActiveTab] = useState<'chats' | 'status' | 'settings'>('chats');
  const [localUser, setLocalUser] = useState<UserProfile | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  
  // Login State
  const [phoneNumber, setPhoneNumber] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(AVATARS[0]);
  const [isExistingUser, setIsExistingUser] = useState(false);
  const [password, setPassword] = useState('');
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Custom Profile Image State
  const [customImageSrc, setCustomImageSrc] = useState<string | null>(null);
  const [showCropper, setShowCropper] = useState(false);
  
  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || selectedMembers.length === 0 || !localUser) return;

    try {
      await addDoc(collection(db, 'groups'), {
        name: newGroupName,
        members: [...selectedMembers, localUser.uid],
        createdBy: localUser.uid,
        createdAt: serverTimestamp(),
        photoURL: 'https://ui-avatars.com/api/?name=' + encodeURIComponent(newGroupName)
      });
      setIsCreatingGroup(false);
      setNewGroupName('');
      setSelectedMembers([]);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'groups');
    }
  };

  // Chat State
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [isLockedChatsVisible, setIsLockedChatsVisible] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [decryptedMessages, setDecryptedMessages] = useState<DecryptedMessage[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const chatsRef = useRef<Chat[]>([]);
  
  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilter, setSearchFilter] = useState<'all' | 'unread' | 'media' | 'links' | 'docs'>('all');
  const [searchDate, setSearchDate] = useState('');
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const [isSearchingMessages, setIsSearchingMessages] = useState(false);
  const [sortOrder, setSortOrder] = useState<'recent' | 'unread' | 'pinned'>('recent');
  const [quotedMessage, setQuotedMessage] = useState<DecryptedMessage | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Voice Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingInterval = useRef<any>(null);

  // Audio for notifications
  const notificationSound = useRef(new Audio('https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3'));
  const sentSound = useRef(new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3'));

  // Theme State
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // Edit Contact Name State
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [newContactName, setNewContactName] = useState('');

  // Call State
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [incomingCall, setIncomingCall] = useState<Call | null>(null);
  const ringtone = useRef(new Audio('https://assets.mixkit.co/active_storage/sfx/1350/1350-preview.mp3'));

  // Initialize from LocalStorage and Auth
  useEffect(() => {
    const storedUser = localStorage.getItem('youssefia_user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setLocalUser(parsedUser);
      setTheme(parsedUser.theme || 'light');
      setStep('main');
    }
    setIsInitializing(false);
    
    // Sign in anonymously to get a UID for Firestore rules
    signInAnonymously(auth).catch(err => {
      if (err.code === 'auth/admin-restricted-operation') {
        console.warn("Anonymous Auth is disabled. Please enable it in Firebase Console to secure messages.");
      } else {
        console.error("Auth error:", err);
      }
    });

    // Request Notification Permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Listen for incoming calls
  useEffect(() => {
    if (!localUser) return;
    const q = query(
      collection(db, 'calls'),
      where('receiverId', '==', localUser.uid),
      where('status', '==', 'ringing')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const callData = { id: change.doc.id, ...change.doc.data() } as Call;
          setIncomingCall(callData);
          ringtone.current.loop = true;
          ringtone.current.play().catch(e => console.log('Ringtone play failed:', e));
        }
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'calls');
    });
    return () => unsubscribe();
  }, [localUser]);

  const handleStartCall = async (type: 'audio' | 'video') => {
    if (!localUser || !selectedUser) return;
    const callData = {
      callerId: localUser.uid,
      receiverId: selectedUser.uid,
      type,
      status: 'ringing',
      timestamp: serverTimestamp(),
    };
    try {
      const docRef = await addDoc(collection(db, 'calls'), callData);
      setActiveCall({ id: docRef.id, ...callData } as Call);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'calls');
    }
  };

  const handleAcceptCall = async () => {
    if (!incomingCall) return;
    ringtone.current.pause();
    ringtone.current.currentTime = 0;
    setActiveCall(incomingCall);
    setIncomingCall(null);
  };

  const handleRejectCall = async () => {
    if (!incomingCall) return;
    ringtone.current.pause();
    ringtone.current.currentTime = 0;
    try {
      await updateDoc(doc(db, 'calls', incomingCall.id), { status: 'rejected' });
      setIncomingCall(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `calls/${incomingCall.id}`);
    }
  };

  const handleEndCall = () => {
    setActiveCall(null);
    setIncomingCall(null);
    ringtone.current.pause();
    ringtone.current.currentTime = 0;
  };

  // Apply Theme
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const getDisplayName = (user: UserProfile) => {
    if (localUser?.customNames && localUser.customNames[user.uid]) {
      return localUser.customNames[user.uid];
    }
    return user.displayName;
  };

  // Advanced Search Effect
  useEffect(() => {
    if (!searchQuery || step !== 'main' || !localUser) {
      setSearchResults([]);
      setIsSearchingMessages(false);
      return;
    }
    
    setIsSearchingMessages(true);
    const delayDebounceFn = setTimeout(async () => {
      try {
        const q1 = query(collection(db, 'messages'), where('receiverId', '==', localUser.uid), orderBy('timestamp', 'desc'), limit(500));
        const q2 = query(collection(db, 'messages'), where('senderId', '==', localUser.uid), orderBy('timestamp', 'desc'), limit(500));
        
        const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
        
        const allMsgs = [...snap1.docs, ...snap2.docs].map(d => ({ id: d.id, ...d.data() } as Message));
        
        const filtered = allMsgs.filter(m => {
          if (searchFilter === 'media' && m.type !== 'image' && m.type !== 'video') return false;
          if (searchFilter === 'links' && !m.ciphertext.includes('http')) return false;
          if (searchFilter === 'docs' && m.type !== 'file') return false;
          
          if (searchDate && m.timestamp) {
            const msgDate = new Date(m.timestamp.toMillis()).toISOString().split('T')[0];
            if (msgDate !== searchDate) return false;
          }
          
          return m.ciphertext.toLowerCase().includes(searchQuery.toLowerCase()) || 
                 (m.fileName && m.fileName.toLowerCase().includes(searchQuery.toLowerCase()));
        });
        
        const unique = Array.from(new Map(filtered.map(m => [m.id, m])).values());
        setSearchResults(unique.sort((a, b) => (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0)));
      } catch (error) {
        console.error("Error searching messages:", error);
      } finally {
        setIsSearchingMessages(false);
      }
    }, 500);
    
    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, searchFilter, searchDate, localUser, step]);

  // Fetch Users
  useEffect(() => {
    if (step !== 'main' || !localUser) return;
    
    // Update last seen
    const updateLastSeen = async () => {
      try {
        await updateDoc(doc(db, 'users', localUser.uid), {
          lastSeen: serverTimestamp()
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${localUser.uid}`);
      }
    };
    updateLastSeen();
    const interval = setInterval(updateLastSeen, 60000); // Update every minute

    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersList: UserProfile[] = [];
      snapshot.forEach((doc) => {
        if (doc.id !== localUser.uid) {
          usersList.push(doc.data() as UserProfile);
        }
      });
      setUsers(usersList);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'users');
    });
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [step, localUser]);

  // Fetch Chats
  useEffect(() => {
    if (step !== 'main' || !localUser) return;

    const q = query(
      collection(db, 'users', localUser.uid, 'chats'),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const chatsList: Chat[] = [];
      snapshot.forEach((doc) => {
        chatsList.push(doc.data() as Chat);
      });
      setChats(chatsList);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${localUser.uid}/chats`);
    });

    return () => unsubscribe();
  }, [step, localUser]);

  // Fetch Unread Counts
  useEffect(() => {
    if (step !== 'main' || !localUser) return;
    
    const q = query(
      collection(db, 'messages'),
      where('receiverId', '==', localUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const counts: Record<string, number> = {};
      snapshot.forEach((doc) => {
        const data = doc.data() as Message;
        if (!data.read && !data.deletedFor?.includes(localUser.uid)) {
          counts[data.senderId] = (counts[data.senderId] || 0) + 1;
        }
      });
      setUnreadCounts(counts);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'messages');
    });

    return () => unsubscribe();
  }, [step, localUser]);

  // Fetch Groups
  useEffect(() => {
    if (step !== 'main' || !localUser) return;

    const q = query(
      collection(db, 'groups'),
      where('members', 'array-contains', localUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const groupsList: Group[] = [];
      snapshot.forEach((doc) => {
        groupsList.push({ id: doc.id, ...doc.data() } as Group);
      });
      setGroups(groupsList);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'groups');
    });

    return () => unsubscribe();
  }, [step, localUser]);

  // Fetch Messages
  useEffect(() => {
    if (step !== 'main' || !localUser || (!selectedUser && !selectedGroup)) return;

    let q;
    if (selectedGroup) {
      q = query(
        collection(db, 'messages'),
        where('receiverId', '==', selectedGroup.id)
      );
    } else {
      q = query(
        collection(db, 'messages'),
        where('receiverId', '==', localUser.uid)
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: Message[] = [];
      let hasNewMessage = false;
      
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data() as Message;
          if (selectedUser && data.receiverId === localUser.uid && data.senderId === selectedUser.uid) {
             hasNewMessage = true;
          } else if (selectedGroup && data.receiverId === selectedGroup.id && data.senderId !== localUser.uid) {
             hasNewMessage = true;
          }
        }
      });

      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as Message;
        const isDirectMatch = selectedUser && (
          (data.senderId === localUser.uid && data.receiverId === selectedUser.uid) ||
          (data.senderId === selectedUser.uid && data.receiverId === localUser.uid)
        );
        const isGroupMatch = selectedGroup && data.receiverId === selectedGroup.id;

        if (isDirectMatch || isGroupMatch) {
          if (!data.deletedFor?.includes(localUser.uid)) {
            msgs.push({ ...data, id: docSnap.id });
            
    try {
      const updateReadStatus = async () => {
        await updateDoc(doc(db, 'messages', docSnap.id), { read: true });
      };
      updateReadStatus();
    } catch (error) {
      console.error("Error updating read status:", error);
    }
          }
        }
      });
      
      const sortedMsgs = msgs.sort((a, b) => {
        const t1 = a.timestamp?.toMillis ? a.timestamp.toMillis() : (a.timestamp || 0);
        const t2 = b.timestamp?.toMillis ? b.timestamp.toMillis() : (b.timestamp || 0);
        return t1 - t2;
      });
      setMessages(sortedMsgs);
      
      if (hasNewMessage) {
        const chatId = selectedUser ? selectedUser.uid : selectedGroup?.id;
        const chat = chatsRef.current.find(c => c.id === chatId);
        
        if (!chat?.isMuted) {
          notificationSound.current.play().catch(e => console.log('Audio play failed:', e));
          if (document.hidden && Notification.permission === 'granted') {
             const title = selectedUser ? `رسالة من ${selectedUser.displayName}` : `رسالة في ${selectedGroup?.name}`;
             new Notification(title, {
               body: 'لديك رسالة جديدة',
               icon: selectedUser?.photoURL || selectedGroup?.photoURL
             });
          }
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'messages');
    });

    return () => unsubscribe();
  }, [step, localUser, selectedUser, selectedGroup]);

  // Display Messages (Encryption disabled)
  useEffect(() => {
    if (step !== 'main' || !localUser) return;

    const displayAll = async () => {
      const decrypted = messages.map((msg) => {
        return { ...msg, text: msg.ciphertext || "" };
      });
      
      setDecryptedMessages(decrypted);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    };

    displayAll();
  }, [messages, localUser, step]);

  const normalizePhone = (phone: string) => {
    let cleaned = phone.replace(/\D/g, '');
    // Remove country code if entered
    if (cleaned.startsWith('963')) {
      cleaned = cleaned.substring(3);
    }
    // Remove leading zero
    if (cleaned.startsWith('0')) {
      cleaned = cleaned.substring(1);
    }
    return cleaned;
  };

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const normalized = normalizePhone(phoneNumber);
    const fullPhone = `+963${normalized}`;
    
    if (normalized.length < 9) return;
    
    try {
      const userDoc = await getDoc(doc(db, 'users', fullPhone));
      if (userDoc.exists()) {
        const userData = userDoc.data() as UserProfile & { authUid?: string };
        
        // If user has a password and we haven't shown the input yet
        if (userData.password && !showPasswordInput) {
          setShowPasswordInput(true);
          return;
        }

        // If password input is shown, verify it
        if (userData.password && showPasswordInput) {
          if (userData.password !== password) {
            setError('كلمة المرور غير صحيحة');
            return;
          }
        }

        // Ensure Auth UID is updated in Firestore for security rules
        const currentAuthUid = auth.currentUser?.uid;
        if (currentAuthUid && userData.authUid !== currentAuthUid) {
          try {
            await updateDoc(doc(db, 'users', fullPhone), { authUid: currentAuthUid });
            userData.authUid = currentAuthUid;
          } catch (e) {
            console.error("Error updating authUid:", e);
          }
        }

        setLocalUser(userData);
        localStorage.setItem('youssefia_user', JSON.stringify(userData));
        setStep('main');
        setShowPasswordInput(false);
        setPassword('');
        return;
      }
      setIsExistingUser(false);
      setStep('profile');
    } catch (error) {
      console.error("Error checking phone:", error);
      setError('حدث خطأ أثناء التحقق من الرقم');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        setCustomImageSrc(reader.result?.toString() || null);
        setShowCropper(true);
      });
      reader.readAsDataURL(file);
    }
  };

  const handleCropComplete = (croppedBase64: string) => {
    setSelectedAvatar(croppedBase64);
    setShowCropper(false);
    setCustomImageSrc(null);
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    const normalized = normalizePhone(phoneNumber);
    const fullPhone = `+963${normalized}`;

    try {
      const authUid = auth.currentUser?.uid;
      
      const newUser: UserProfile & { authUid?: string } = {
        uid: fullPhone,
        phoneNumber: fullPhone,
        displayName: displayName,
        photoURL: selectedAvatar,
        publicKey: "", // Encryption disabled
        authUid: authUid, // Store Auth UID for rules
        password: password || undefined,
        privacy: {
          lastSeen: 'everyone',
          online: 'everyone',
          readReceipts: true,
          typing: true,
          recording: true,
          groups: 'everyone',
          profilePhoto: 'everyone',
          status: 'everyone'
        },
        customNames: {},
        theme: 'light'
      };

      try {
        await setDoc(doc(db, 'users', fullPhone), newUser);
        
        setLocalUser(newUser);
        localStorage.setItem('youssefia_user', JSON.stringify(newUser));
        setStep('main');
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `users/${fullPhone}`);
      }
    } catch (error) {
      console.error("Error creating profile:", error);
    }
  };

  const handleSaveContactName = async (contactId: string) => {
    if (!localUser || !newContactName.trim()) return;
    
    try {
      const updatedCustomNames = {
        ...(localUser.customNames || {}),
        [contactId]: newContactName.trim()
      };
      
      try {
        await updateDoc(doc(db, 'users', localUser.uid), {
          customNames: updatedCustomNames
        });
        
        const updatedUser = { ...localUser, customNames: updatedCustomNames };
        setLocalUser(updatedUser);
        localStorage.setItem('youssefia_user', JSON.stringify(updatedUser));
        setEditingContactId(null);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${localUser.uid}`);
      }
    } catch (error) {
      console.error("Error updating contact name:", error);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('youssefia_user');
    setLocalUser(null);
    setSelectedUser(null);
    setStep('phone');
    setActiveTab('chats');
    setShowPasswordInput(false);
    setPassword('');
  };

  const handleAccountDelete = async () => {
    if (!localUser) return;
    if (!window.confirm('هل أنت متأكد من رغبتك في حذف حسابك؟ سيتم حذف جميع بياناتك نهائياً.')) return;

    try {
      await deleteDoc(doc(db, 'users', localUser.uid));
      handleLogout();
    } catch (error) {
      console.error('Error deleting account:', error);
      alert('حدث خطأ أثناء حذف الحساب');
    }
  };

  const handleToggleLockChat = async (targetId: string) => {
    if (!localUser) return;
    const isLocked = localUser.lockedChats?.includes(targetId);
    const updatedLockedChats = isLocked 
      ? localUser.lockedChats?.filter(id => id !== targetId)
      : [...(localUser.lockedChats || []), targetId];

    try {
      await updateDoc(doc(db, 'users', localUser.uid), {
        lockedChats: updatedLockedChats
      });
      const updatedUser = { ...localUser, lockedChats: updatedLockedChats };
      setLocalUser(updatedUser);
      localStorage.setItem('youssefia_user', JSON.stringify(updatedUser));
    } catch (error) {
      console.error("Error toggling chat lock:", error);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !localUser || !selectedUser) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      const type = file.type.startsWith('image/') ? 'image' : 'file';
      await sendMessage(base64, type, undefined, file.name, file.size);
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // Reset input
  };

  const sendMessage = async (content: string, type: 'text' | 'audio' | 'image' | 'file' = 'text', quotedMessageId?: string, fileName?: string, fileSize?: number) => {
    if (!localUser || (!selectedUser && !selectedGroup)) return;
    try {
      // Encryption disabled - sending plain text
      const ciphertext = content;
      const iv = "";
      const encKeySender = "";
      const encKeyReceiver = "";
      
      const authUid = auth.currentUser?.uid;

      // Play sent sound immediately
      sentSound.current.play().catch(e => console.log('Audio play failed:', e));

      try {
        const batch = writeBatch(db);
        const messageRef = doc(collection(db, 'messages'));
        const receiverId = selectedUser ? selectedUser.uid : selectedGroup!.id;
        
        batch.set(messageRef, {
          senderId: localUser.uid,
          receiverId: receiverId,
          senderAuthUid: authUid, // For security rules
          receiverAuthUid: selectedUser ? (selectedUser as any).authUid : null, // For security rules
          ciphertext,
          iv,
          encKeySender,
          encKeyReceiver,
          timestamp: serverTimestamp(),
          type,
          fileName: fileName || null,
          fileSize: fileSize || null,
          deletedFor: [],
          read: false,
          quotedMessageId: quotedMessageId || null
        });

        // Update sender's chat
        const senderChatRef = doc(db, 'users', localUser.uid, 'chats', receiverId);
        batch.set(senderChatRef, {
          id: receiverId,
          type: selectedUser ? 'user' : 'group',
          lastMessage: type === 'text' ? content : (type === 'audio' ? 'رسالة صوتية' : (type === 'image' ? 'صورة' : 'ملف')),
          lastMessageType: type,
          timestamp: serverTimestamp(),
        }, { merge: true });

        // Update receiver's chat
        if (selectedUser) {
          const receiverChatRef = doc(db, 'users', receiverId, 'chats', localUser.uid);
          batch.set(receiverChatRef, {
            id: localUser.uid,
            type: 'user',
            lastMessage: type === 'text' ? content : (type === 'audio' ? 'رسالة صوتية' : (type === 'image' ? 'صورة' : 'ملف')),
            lastMessageType: type,
            timestamp: serverTimestamp(),
            unreadCount: increment(1)
          }, { merge: true });
        } else if (selectedGroup) {
          selectedGroup.members.forEach(memberId => {
            if (memberId !== localUser.uid) {
              const memberChatRef = doc(db, 'users', memberId, 'chats', selectedGroup.id);
              batch.set(memberChatRef, {
                id: selectedGroup.id,
                type: 'group',
                lastMessage: type === 'text' ? content : (type === 'audio' ? 'رسالة صوتية' : (type === 'image' ? 'صورة' : 'ملف')),
                lastMessageType: type,
                timestamp: serverTimestamp(),
                unreadCount: increment(1)
              }, { merge: true });
            }
          });
        }

        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, 'messages');
      }
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    const textToSend = newMessage;
    setNewMessage('');
    setShowEmojiPicker(false);

    if (editingMessageId) {
      try {
        await updateDoc(doc(db, 'messages', editingMessageId), {
          ciphertext: textToSend,
          isEdited: true
        });
        setEditingMessageId(null);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, 'messages');
      }
    } else {
      await sendMessage(textToSend, 'text', quotedMessage?.id);
      setQuotedMessage(null);
    }
  };

  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = async () => {
          const base64Audio = reader.result as string;
          await sendMessage(base64Audio, 'audio');
        };
      };
      
      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      setRecordingDuration(0);
      recordingInterval.current = setInterval(() => setRecordingDuration(prev => prev + 1), 1000);
    } catch (err) {
      console.error("Microphone access denied", err);
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
      clearInterval(recordingInterval.current);
    }
  };

  const handleDeleteMessage = async (msgIds: string[], forEveryone: boolean) => {
    if (!localUser || msgIds.length === 0) return;
    try {
      const batch = writeBatch(db);
      for (const msgId of msgIds) {
        const msgRef = doc(db, 'messages', msgId);
        if (forEveryone) {
          batch.delete(msgRef);
        } else {
          batch.update(msgRef, {
            deletedFor: arrayUnion(localUser.uid)
          });
        }
      }
      await batch.commit();
      setSelectedMessageId(null);
      setSelectedMessageIds([]);
      setIsSelectionMode(false);
    } catch (error) {
      console.error("Error deleting messages:", error);
    }
  };

  const handleDeleteChat = async (e: React.MouseEvent, targetId: string, isGroup: boolean) => {
    e.stopPropagation();
    if (!localUser) return;
    
    try {
      const q = isGroup 
        ? query(collection(db, 'messages'), where('receiverId', '==', targetId))
        : query(
            collection(db, 'messages'),
            or(
              where('senderId', '==', localUser.uid),
              where('receiverId', '==', localUser.uid)
            )
          );

      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as Message;
        if (isGroup || (data.senderId === targetId || data.receiverId === targetId)) {
          batch.update(doc(db, 'messages', docSnap.id), {
            deletedFor: arrayUnion(localUser.uid)
          });
        }
      });

      await batch.commit();
      if (selectedUser?.uid === targetId || selectedGroup?.id === targetId) {
        setSelectedUser(null);
        setSelectedGroup(null);
      }
    } catch (error) {
      console.error("Error deleting chat:", error);
    }
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#ece5dd] to-[#dcf8c6] dark:from-[#111b21] dark:to-[#202c33]">
        <div className="animate-pulse flex flex-col items-center">
          <MessageCircle className="w-16 h-16 text-[#25D366] mb-4" />
          <div className="text-gray-600 dark:text-gray-400 font-medium">جاري التحميل...</div>
        </div>
      </div>
    );
  }

  if (step === 'phone') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#ece5dd] to-[#dcf8c6] dark:from-[#111b21] dark:to-[#202c33] p-4 text-center" dir="rtl">
        <div className="bg-white/90 dark:bg-[#202c33]/90 backdrop-blur-md p-8 rounded-3xl shadow-2xl max-w-md w-full border border-white/20 dark:border-gray-700/50">
          <div className="bg-[#25D366]/10 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6">
            <MessageCircle className="w-12 h-12 text-[#25D366]" />
          </div>
          <h1 className="text-3xl font-extrabold text-gray-800 dark:text-white mb-2 tracking-tight">يوسفيه للمحادثات</h1>
          <p className="text-gray-500 dark:text-gray-400 mb-8 font-medium">أدخل رقم هاتفك للبدء في المراسلة الآمنة</p>
          
          <form onSubmit={handlePhoneSubmit} className="space-y-6">
            <div className="flex items-center border-2 border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden focus-within:ring-4 focus-within:ring-[#25D366]/20 focus-within:border-[#25D366] bg-white dark:bg-[#111b21] transition-all">
              <div className="flex items-center gap-2 px-4 py-4 bg-gray-50 dark:bg-[#2a3942] border-l border-gray-200 dark:border-gray-700" dir="ltr">
                <span className="text-xl" title="سوريا">🇸🇾</span>
                <span className="font-bold text-gray-700 dark:text-gray-300">+963</span>
              </div>
              <input 
                type="tel" 
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                className="w-full px-4 py-4 outline-none text-left font-bold text-gray-800 dark:text-white tracking-widest bg-transparent text-lg"
                dir="ltr"
                placeholder="9xxxxxxxx"
                required
                disabled={showPasswordInput}
              />
            </div>

            {showPasswordInput && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                    <Lock className="w-5 h-5 text-gray-400" />
                  </div>
                  <input 
                    type="password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-4 pr-12 py-4 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:ring-4 focus:ring-[#25D366]/20 focus:border-[#25D366] bg-white dark:bg-[#111b21] text-gray-900 dark:text-white text-lg font-medium outline-none transition-all"
                    placeholder="كلمة المرور"
                    required
                    autoFocus
                  />
                </div>
                <button 
                  type="button" 
                  onClick={() => {
                    setShowPasswordInput(false);
                    setPassword('');
                  }}
                  className="text-sm text-[#25D366] font-bold hover:underline"
                >
                  تغيير الرقم؟
                </button>
              </div>
            )}

            {error && (
              <p className="text-red-500 text-sm font-bold">{error}</p>
            )}
            
            <button 
              type="submit" 
              className="w-full bg-[#25D366] text-white py-4 rounded-xl font-bold text-lg shadow-lg shadow-[#25D366]/30 hover:bg-[#128C7E] active:scale-95 transition-all"
            >
              {showPasswordInput ? 'دخول' : 'متابعة'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (step === 'profile') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#ece5dd] to-[#dcf8c6] dark:from-[#111b21] dark:to-[#202c33] p-4 text-center" dir="rtl">
        <div className="bg-white/90 dark:bg-[#202c33]/90 backdrop-blur-md p-8 rounded-3xl shadow-2xl max-w-md w-full border border-white/20 dark:border-gray-700/50">
          <h2 className="text-3xl font-extrabold text-gray-800 dark:text-white mb-2 tracking-tight">
            {isExistingUser ? 'أهلاً بك مجدداً!' : 'إعداد الملف الشخصي'}
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-8 font-medium">
            {isExistingUser 
              ? 'لقد وجدنا حسابك، يرجى تأكيد بياناتك للمتابعة على هذا الجهاز.' 
              : 'الرجاء إدخال اسمك واختيار صورة'}
          </p>
          
          <form onSubmit={handleProfileSubmit} className="space-y-8">
            <div className="flex justify-center mb-6">
              <div className="relative group cursor-pointer">
                <div className="absolute inset-0 bg-gradient-to-tr from-[#25D366] to-[#128C7E] rounded-full blur-md opacity-40 group-hover:opacity-60 transition-opacity duration-300"></div>
                <img src={selectedAvatar} alt="Avatar" className="w-32 h-32 rounded-full border-4 border-white dark:border-[#202c33] object-cover relative z-10 shadow-xl transition-transform duration-300 group-hover:scale-[1.02]" />
                <label className="absolute bottom-1 right-1 bg-[#25D366] p-3 rounded-full text-white cursor-pointer hover:bg-[#128C7E] transition-all transform hover:scale-110 shadow-lg z-20 border-2 border-white dark:border-[#202c33]">
                  <Camera className="w-5 h-5" />
                  <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                </label>
              </div>
            </div>
            
            <div className="grid grid-cols-4 gap-3 mb-8 bg-gray-50 dark:bg-[#111b21] p-4 rounded-2xl border border-gray-100 dark:border-gray-800/50">
              {AVATARS.map((avatar, idx) => (
                <img 
                  key={idx}
                  src={avatar}
                  alt={`Avatar ${idx}`}
                  onClick={() => setSelectedAvatar(avatar)}
                  className={clsx(
                    "w-14 h-14 rounded-full cursor-pointer border-2 transition-all duration-200 hover:shadow-md",
                    selectedAvatar === avatar ? "border-[#25D366] scale-110 shadow-lg ring-2 ring-[#25D366]/20 ring-offset-2 dark:ring-offset-[#111b21]" : "border-transparent hover:scale-105 opacity-80 hover:opacity-100"
                  )}
                />
              ))}
            </div>

            <div className="relative">
              <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                <UserIcon className="w-5 h-5 text-gray-400 dark:text-gray-500" />
              </div>
              <input 
                type="text" 
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full pl-4 pr-12 py-4 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:ring-4 focus:ring-[#25D366]/20 focus:border-[#25D366] bg-white dark:bg-[#111b21] text-gray-900 dark:text-white text-lg font-medium outline-none transition-all placeholder-gray-400 dark:placeholder-gray-600"
                placeholder="اسمك (مثال: يوسف)"
                required
              />
            </div>

            <div className="relative">
              <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                <Lock className="w-5 h-5 text-gray-400 dark:text-gray-500" />
              </div>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-4 pr-12 py-4 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:ring-4 focus:ring-[#25D366]/20 focus:border-[#25D366] bg-white dark:bg-[#111b21] text-gray-900 dark:text-white text-lg font-medium outline-none transition-all placeholder-gray-400 dark:placeholder-gray-600"
                placeholder="كلمة المرور (اختياري)"
              />
            </div>
            
            <button 
              type="submit"
              className="w-full bg-[#25D366] hover:bg-[#128C7E] text-white font-bold py-4 px-4 rounded-xl shadow-lg shadow-[#25D366]/30 transition-all transform hover:-translate-y-0.5 text-lg"
            >
              {isExistingUser ? 'تأكيد ومتابعة' : 'حفظ والبدء'}
            </button>
          </form>
        </div>

        {showCropper && customImageSrc && (
          <ImageCropperModal
            imageSrc={customImageSrc}
            onCropComplete={handleCropComplete}
            onCancel={() => {
              setShowCropper(false);
              setCustomImageSrc(null);
            }}
          />
        )}
      </div>
    );
  }

  interface ChatListItem {
    id: string;
    type: 'user' | 'group';
    data: UserProfile | Group;
    lastMessage?: string;
    lastMessageType?: 'text' | 'audio' | 'image' | 'file';
    timestamp: number;
    unreadCount: number;
    isPinned: boolean;
  }

  const chatListItems = useMemo(() => {
    const items: ChatListItem[] = [];
    
    // Add groups
    groups.forEach(g => {
      const chatData = chats.find(c => c.id === g.id && c.type === 'group');
      items.push({
        id: g.id,
        type: 'group',
        data: g,
        lastMessage: chatData?.lastMessage,
        lastMessageType: chatData?.lastMessageType,
        timestamp: chatData?.timestamp?.toMillis() || 0,
        unreadCount: unreadCounts[g.id] || 0,
        isPinned: localUser?.pinnedChats?.includes(g.id) || false
      });
    });

    // Add users
    users.forEach(u => {
      const chatData = chats.find(c => c.id === u.uid && c.type === 'user');
      items.push({
        id: u.uid,
        type: 'user',
        data: u,
        lastMessage: chatData?.lastMessage,
        lastMessageType: chatData?.lastMessageType,
        timestamp: chatData?.timestamp?.toMillis() || 0,
        unreadCount: unreadCounts[u.uid] || 0,
        isPinned: localUser?.pinnedChats?.includes(u.uid) || false
      });
    });

    // Filter by search query
    let result = items.filter(item => {
      const name = item.type === 'user' ? getDisplayName(item.data as UserProfile) : (item.data as Group).name;
      return name.toLowerCase().includes(searchQuery.toLowerCase());
    });

    // Filter by locked chats
    if (isLockedChatsVisible) {
      result = result.filter(item => localUser?.lockedChats?.includes(item.id));
    } else {
      result = result.filter(item => !localUser?.lockedChats?.includes(item.id));
    }

    // Filter by search filter
    if (searchFilter === 'unread') {
      result = result.filter(item => item.unreadCount > 0);
    } else if (searchFilter !== 'all') {
      result = [];
    }

    // Sort
    result.sort((a, b) => {
      if (sortOrder === 'pinned') {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
      } else if (sortOrder === 'unread') {
        if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
        if (a.unreadCount === 0 && b.unreadCount > 0) return 1;
      }
      // Default sort by timestamp
      return b.timestamp - a.timestamp;
    });

    return result;
  }, [users, groups, chats, searchQuery, isLockedChatsVisible, localUser?.lockedChats, localUser?.pinnedChats, searchFilter, sortOrder, unreadCounts]);

  return (
    <div className="flex h-screen bg-[#ece5dd] overflow-hidden font-sans" dir="rtl">
      {/* Sidebar / Tabs Area */}
      <div className={clsx("w-full md:w-1/3 lg:w-1/4 bg-white border-l border-gray-200 flex flex-col", selectedUser && activeTab === 'chats' ? "hidden md:flex" : "flex")}>
        
        {/* App Header */}
        <div className="bg-[#f0f2f5] dark:bg-[#202c33] p-4 flex justify-between items-center border-b border-gray-200 dark:border-gray-700 shadow-sm z-10">
          <h1 className="font-bold text-2xl text-gray-800 dark:text-white tracking-tight">يوسفيه</h1>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsLockedChatsVisible(!isLockedChatsVisible)} 
              className={clsx(
                "p-2 rounded-full transition-colors",
                isLockedChatsVisible ? "bg-[#25D366] text-white" : "text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              )}
              title={isLockedChatsVisible ? "إخفاء المحادثات المقفولة" : "إظهار المحادثات المقفولة"}
            >
              {isLockedChatsVisible ? <Unlock className="w-6 h-6" /> : <Lock className="w-6 h-6" />}
            </button>
            <button onClick={() => setIsCreatingGroup(true)} className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full">
              <Users className="w-6 h-6" />
            </button>
            <img src={localUser?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(localUser?.displayName || 'User')}`} alt="Profile" className="w-10 h-10 rounded-full object-cover border-2 border-[#25D366]" />
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'chats' && (
          isCreatingGroup ? (
            <div className="p-4 flex-1 overflow-y-auto bg-white dark:bg-[#111b21]">
              <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">إنشاء مجموعة جديدة</h2>
              <input 
                type="text" 
                placeholder="اسم المجموعة" 
                value={newGroupName} 
                onChange={(e) => setNewGroupName(e.target.value)}
                className="w-full p-3 mb-4 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-[#111b21] dark:text-white"
              />
              <h3 className="font-bold mb-2 text-gray-700 dark:text-gray-300">اختر الأعضاء:</h3>
              <div className="space-y-2 mb-4">
                {users.map(u => (
                  <div key={u.uid} className="flex items-center gap-2 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded cursor-pointer" onClick={() => {
                    setSelectedMembers(prev => prev.includes(u.uid) ? prev.filter(id => id !== u.uid) : [...prev, u.uid]);
                  }}>
                    <input type="checkbox" checked={selectedMembers.includes(u.uid)} readOnly />
                    <img src={u?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(getDisplayName(u))}`} className="w-8 h-8 rounded-full" />
                    <span className="text-gray-900 dark:text-gray-100">{getDisplayName(u)}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setIsCreatingGroup(false)} className="flex-1 p-2 bg-gray-200 dark:bg-gray-700 rounded-lg text-gray-800 dark:text-gray-200">إلغاء</button>
                <button onClick={handleCreateGroup} className="flex-1 p-2 bg-[#25D366] text-white rounded-lg font-bold">إنشاء</button>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto bg-white dark:bg-[#111b21]">
              <div className="p-4 border-b border-gray-200 dark:border-gray-800">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="بحث في يوسفيات..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-gray-100 dark:bg-[#202c33] text-gray-900 dark:text-gray-100 rounded-full pl-10 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#25D366]/50 transition-all"
                  />
                  <Search className="w-5 h-5 text-gray-500 absolute left-3 top-2.5" />
                </div>
                
                {/* Advanced Search Filters */}
                <div className="flex gap-2 mt-3 overflow-x-auto pb-1 scrollbar-hide items-center">
                  {['all', 'unread', 'media', 'links', 'docs'].map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setSearchFilter(filter as any)}
                      className={clsx(
                        "px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all",
                        searchFilter === filter 
                          ? "bg-[#25D366] text-white shadow-md" 
                          : "bg-gray-100 dark:bg-[#202c33] text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                      )}
                    >
                      {filter === 'all' && 'الكل'}
                      {filter === 'unread' && 'غير مقروءة'}
                      {filter === 'media' && 'صور وفيديو'}
                      {filter === 'links' && 'روابط'}
                      {filter === 'docs' && 'ملفات'}
                    </button>
                  ))}
                  <input 
                    type="date" 
                    value={searchDate}
                    onChange={(e) => setSearchDate(e.target.value)}
                    className="px-3 py-1.5 rounded-full text-sm font-medium bg-gray-100 dark:bg-[#202c33] text-gray-600 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-[#25D366]/50"
                  />
                </div>
              </div>
              
              {/* Sort Options */}
              {!searchQuery && (
                <div className="px-4 py-2 flex justify-between items-center bg-gray-50 dark:bg-[#111b21] border-b border-gray-100 dark:border-gray-800/50">
                  <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">المحادثات</span>
                  <div className="flex gap-3">
                    <button onClick={() => setSortOrder('recent')} className={clsx("text-xs font-medium transition-colors", sortOrder === 'recent' ? "text-[#25D366]" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300")}>الأحدث</button>
                    <button onClick={() => setSortOrder('unread')} className={clsx("text-xs font-medium transition-colors", sortOrder === 'unread' ? "text-[#25D366]" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300")}>غير المقروءة</button>
                    <button onClick={() => setSortOrder('pinned')} className={clsx("text-xs font-medium transition-colors", sortOrder === 'pinned' ? "text-[#25D366]" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300")}>المثبتة</button>
                  </div>
                </div>
              )}
              
              {searchQuery && (
                <div className="px-4 py-2 bg-gray-50 dark:bg-[#111b21] border-b border-gray-100 dark:border-gray-800/50">
                  <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">المحادثات ({chatListItems.length})</span>
                </div>
              )}
              
            {chatListItems.length === 0 && !searchQuery ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400 flex flex-col items-center justify-center h-full">
                <div className="bg-gray-100 dark:bg-gray-800 p-6 rounded-full mb-4">
                  <Users className="w-12 h-12 text-gray-400 dark:text-gray-500" />
                </div>
                <p className="text-lg font-medium text-gray-700 dark:text-gray-300">لا يوجد محادثات مطابقة.</p>
              </div>
            ) : (
              <>
                {chatListItems.map(item => {
                  const isUser = item.type === 'user';
                  const u = isUser ? item.data as UserProfile : null;
                  const g = !isUser ? item.data as Group : null;
                  const name = isUser ? getDisplayName(u!) : g!.name;
                  const photoURL = isUser ? u?.photoURL : g?.photoURL;
                  const isSelected = isUser ? selectedUser?.uid === u!.uid : selectedGroup?.id === g!.id;
                  
                  return (
                    <div 
                      key={item.id} 
                      onClick={() => { 
                        if (isUser) {
                          setSelectedUser(u); setSelectedGroup(null); 
                        } else {
                          setSelectedGroup(g); setSelectedUser(null);
                        }
                      }}
                      className={clsx(
                        "flex items-center gap-4 p-4 cursor-pointer border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-[#202c33] transition-all duration-200 group",
                        isSelected && "bg-gray-100 dark:bg-[#2a3942]",
                        item.isPinned && "bg-blue-50/30 dark:bg-blue-900/10"
                      )}
                    >
                      <div className="relative">
                        <img src={photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}`} alt={name} className="w-[60px] h-[60px] rounded-full object-cover border-2 border-transparent group-hover:border-[#25D366] transition-colors" />
                        {isUser && u?.privacy?.status !== 'nobody' && (
                          <div className="absolute bottom-0 right-0 w-4 h-4 bg-[#25D366] border-2 border-white dark:border-[#111b21] rounded-full"></div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center mb-1">
                          <h3 className="font-bold text-gray-900 dark:text-gray-100 text-lg truncate flex items-center gap-2">
                            {name}
                            {item.isMuted && <BellOff className="w-3.5 h-3.5 text-gray-400" />}
                            {item.isPinned && <Pin className="w-3.5 h-3.5 text-gray-400" />}
                          </h3>
                          <div className="flex flex-col items-end gap-1">
                            {item.timestamp > 0 && (
                              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                                {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                            {item.unreadCount > 0 && (
                              <span className="bg-[#25D366] text-white text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full shadow-sm">
                                {item.unreadCount}
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 truncate font-medium flex items-center gap-1" dir="auto">
                          {item.lastMessageType === 'image' && <ImageIcon className="w-4 h-4 inline" />}
                          {item.lastMessageType === 'audio' && <Mic className="w-4 h-4 inline" />}
                          {item.lastMessageType === 'file' && <File className="w-4 h-4 inline" />}
                          {item.lastMessage || (isUser ? u!.phoneNumber : 'مجموعة')}
                        </p>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            const newMuted = !item.isMuted;
                            updateDoc(doc(db, 'users', localUser!.uid, 'chats', item.id), { isMuted: newMuted });
                          }}
                          className="p-2 text-gray-400 hover:text-orange-500 transition-colors"
                          title={item.isMuted ? "إلغاء الكتم" : "كتم"}
                        >
                          {item.isMuted ? <Bell className="w-5 h-5 text-orange-500" /> : <BellOff className="w-5 h-5" />}
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            const isPinned = localUser?.pinnedChats?.includes(item.id);
                            const newPinned = isPinned 
                              ? (localUser?.pinnedChats || []).filter(id => id !== item.id)
                              : [...(localUser?.pinnedChats || []), item.id];
                            updateDoc(doc(db, 'users', localUser!.uid), { pinnedChats: newPinned });
                          }}
                          className="p-2 text-gray-400 hover:text-[#25D366] transition-colors"
                          title={item.isPinned ? "إلغاء التثبيت" : "تثبيت"}
                        >
                          <Pin className={clsx("w-5 h-5", item.isPinned && "fill-current text-[#25D366]")} />
                        </button>
                        <button 
                          onClick={(e) => handleDeleteChat(e, item.id, !isUser)}
                          className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                          title="حذف"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {searchQuery && (
              <>
                <div className="px-4 py-2 bg-gray-50 dark:bg-[#111b21] border-b border-gray-100 dark:border-gray-800/50 mt-2">
                  <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    الرسائل {isSearchingMessages ? '...' : `(${searchResults.length})`}
                  </span>
                </div>
                {searchResults.map(msg => {
                  const isSentByMe = msg.senderId === localUser?.uid;
                  const otherUserId = isSentByMe ? msg.receiverId : msg.senderId;
                  const otherUser = users.find(u => u.uid === otherUserId);
                  const group = groups.find(g => g.id === msg.receiverId);
                  const name = group ? group.name : (otherUser ? getDisplayName(otherUser) : 'مستخدم');
                  const photoURL = group ? group.photoURL : otherUser?.photoURL;
                  
                  return (
                    <div 
                      key={msg.id} 
                      onClick={() => { 
                        if (group) {
                          setSelectedGroup(group); setSelectedUser(null); 
                        } else if (otherUser) {
                          setSelectedUser(otherUser); setSelectedGroup(null);
                        }
                      }}
                      className="flex items-center gap-4 p-4 cursor-pointer border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-[#202c33] transition-all duration-200 group"
                    >
                      <img src={photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}`} alt={name} className="w-[50px] h-[50px] rounded-full object-cover" />
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center mb-1">
                          <h3 className="font-bold text-gray-900 dark:text-gray-100 text-md truncate">
                            {name}
                          </h3>
                          {msg.timestamp && (
                            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                              {new Date(msg.timestamp.toMillis()).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-300 truncate" dir="auto">
                          {msg.type === 'image' && <ImageIcon className="w-4 h-4 inline ml-1" />}
                          {msg.type === 'audio' && <Mic className="w-4 h-4 inline ml-1" />}
                          {msg.type === 'file' && <File className="w-4 h-4 inline ml-1" />}
                          {msg.ciphertext}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {searchResults.length === 0 && !isSearchingMessages && (
                  <div className="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                    لا توجد رسائل مطابقة.
                  </div>
                )}
              </>
            )}
          </div>
        )
      )}

      {activeTab === 'status' && (
        <StatusTab localUser={localUser} users={users} getDisplayName={getDisplayName} />
      )}

      {activeTab === 'settings' && (
        <SettingsTab 
          localUser={localUser} 
          setLocalUser={setLocalUser} 
          onLogout={handleLogout} 
          onDeleteAccount={handleAccountDelete}
          theme={theme} 
          setTheme={setTheme} 
        />
      )}

        {/* Bottom Navigation Tabs */}
        <div className="bg-[#f0f2f5] dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex justify-around p-2">
          <button 
            onClick={() => { setActiveTab('chats'); setSelectedUser(null); }}
            className={clsx("flex flex-col items-center p-2 rounded-lg transition-colors flex-1", activeTab === 'chats' ? "text-[#25D366] dark:text-[#25D366]" : "text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700")}
          >
            <MessageCircle className="w-6 h-6 mb-1" />
            <span className="text-xs font-semibold">الدردشات</span>
          </button>
          <button 
            onClick={() => { setActiveTab('status'); setSelectedUser(null); }}
            className={clsx("flex flex-col items-center p-2 rounded-lg transition-colors flex-1", activeTab === 'status' ? "text-[#25D366] dark:text-[#25D366]" : "text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700")}
          >
            <CircleDashed className="w-6 h-6 mb-1" />
            <span className="text-xs font-semibold">الحالة</span>
          </button>
          <button 
            onClick={() => { setActiveTab('settings'); setSelectedUser(null); }}
            className={clsx("flex flex-col items-center p-2 rounded-lg transition-colors flex-1", activeTab === 'settings' ? "text-[#25D366] dark:text-[#25D366]" : "text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700")}
          >
            <Settings className="w-6 h-6 mb-1" />
            <span className="text-xs font-semibold">الإعدادات</span>
          </button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className={clsx("flex-1 flex flex-col bg-[#efeae2] dark:bg-[#0b141a] relative", (!selectedUser && !selectedGroup || activeTab !== 'chats') ? "hidden md:flex" : "flex")}>
        {(selectedUser || selectedGroup) && activeTab === 'chats' ? (
          <>
            {/* Chat Header or Selection Toolbar */}
            {isSelectionMode ? (
              <div className="bg-[#008069] text-white p-3 flex items-center gap-4 shadow-md z-20 animate-in slide-in-from-top duration-200">
                <button onClick={() => { setIsSelectionMode(false); setSelectedMessageIds([]); }} className="p-2 hover:bg-white/10 rounded-full transition">
                  <X className="w-6 h-6" />
                </button>
                <span className="flex-1 font-bold text-lg">{selectedMessageIds.length}</span>
                <div className="flex items-center gap-2">
                  {selectedMessageIds.length === 1 && decryptedMessages.find(m => m.id === selectedMessageIds[0])?.senderId === localUser?.uid && decryptedMessages.find(m => m.id === selectedMessageIds[0])?.type === 'text' && (
                    <button 
                      onClick={() => {
                        const msg = decryptedMessages.find(m => m.id === selectedMessageIds[0]);
                        if (msg) {
                          setEditingMessageId(msg.id);
                          setNewMessage(msg.text);
                        }
                        setIsSelectionMode(false);
                        setSelectedMessageIds([]);
                      }}
                      className="p-2 hover:bg-white/10 rounded-full transition"
                      title="تعديل"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                    </button>
                  )}
                  {selectedMessageIds.length === 1 && (
                    <button 
                      onClick={() => {
                        const msg = decryptedMessages.find(m => m.id === selectedMessageIds[0]);
                        if (msg) setQuotedMessage(msg);
                        setIsSelectionMode(false);
                        setSelectedMessageIds([]);
                      }}
                      className="p-2 hover:bg-white/10 rounded-full transition"
                      title="رد"
                    >
                      <MessageCircle className="w-6 h-6" />
                    </button>
                  )}
                  <button 
                    onClick={() => handleDeleteMessage(selectedMessageIds, false)}
                    className="p-2 hover:bg-white/10 rounded-full transition"
                    title="حذف لدي"
                  >
                    <Trash2 className="w-6 h-6" />
                  </button>
                  {selectedMessageIds.every(id => decryptedMessages.find(m => m.id === id)?.senderId === localUser?.uid) && (
                    <button 
                      onClick={() => handleDeleteMessage(selectedMessageIds, true)}
                      className="p-2 hover:bg-white/10 rounded-full transition"
                      title="حذف لدى الجميع"
                    >
                      <Trash2 className="w-6 h-6 text-red-200" />
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-[#f0f2f5] dark:bg-[#202c33] p-3 flex items-center gap-4 border-b border-gray-200 dark:border-gray-700 shadow-sm z-10">
                <button className="md:hidden text-gray-600 dark:text-gray-300 p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition" onClick={() => { setSelectedUser(null); setSelectedGroup(null); }}>
                  &rarr;
                </button>
                <img src={selectedUser ? (selectedUser?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(getDisplayName(selectedUser))}`) : (selectedGroup?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(selectedGroup!.name)}`)} alt={selectedUser ? getDisplayName(selectedUser) : selectedGroup!.name} className="w-12 h-12 rounded-full object-cover border border-gray-200 dark:border-gray-600" />
                <div className="flex-1">
                  {editingContactId === selectedUser.uid ? (
                    <div className="flex items-center gap-2">
                      <input 
                        type="text" 
                        value={newContactName} 
                        onChange={(e) => setNewContactName(e.target.value)}
                        className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-[#111b21] dark:text-white focus:ring-2 focus:ring-[#25D366] outline-none"
                        autoFocus
                      />
                      <button onClick={() => handleSaveContactName(selectedUser.uid)} className="text-[#25D366] font-bold text-sm bg-[#25D366]/10 px-3 py-1.5 rounded-lg hover:bg-[#25D366]/20 transition">حفظ</button>
                      <button onClick={() => setEditingContactId(null)} className="text-gray-500 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 px-3 py-1.5 rounded-lg transition">إلغاء</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 cursor-pointer group w-max" onClick={() => { setEditingContactId(selectedUser.uid); setNewContactName(getDisplayName(selectedUser)); }}>
                      <h2 className="font-bold text-gray-900 dark:text-white text-lg">{getDisplayName(selectedUser)}</h2>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleToggleLockChat(selectedUser.uid); }}
                        className={clsx(
                          "p-1.5 rounded-full transition-all",
                          localUser?.lockedChats?.includes(selectedUser.uid) ? "text-[#25D366] bg-[#25D366]/10" : "text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                        )}
                        title={localUser?.lockedChats?.includes(selectedUser.uid) ? "إلغاء قفل المحادثة" : "قفل المحادثة"}
                      >
                        {localUser?.lockedChats?.includes(selectedUser.uid) ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                      </button>
                      <span className="text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-md">تعديل</span>
                    </div>
                  )}
                  {selectedUser.privacy?.lastSeen !== 'nobody' && selectedUser.lastSeen && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                      آخر ظهور: {format(selectedUser.lastSeen.toDate(), 'HH:mm')}
                    </p>
                  )}
                </div>

                {selectedUser && (
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => handleStartCall('audio')}
                      className="p-2.5 text-gray-500 dark:text-gray-400 hover:text-[#25D366] hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition"
                      title="مكالمة صوتية"
                    >
                      <Phone className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => handleStartCall('video')}
                      className="p-2.5 text-gray-500 dark:text-gray-400 hover:text-[#25D366] hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition"
                      title="مكالمة فيديو"
                    >
                      <Video className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 relative" style={{ backgroundImage: theme === 'dark' ? 'none' : 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")', backgroundRepeat: 'repeat', opacity: theme === 'dark' ? 1 : 0.9 }}>
              {theme === 'dark' && <div className="absolute inset-0 bg-[#0b141a] opacity-95 pointer-events-none"></div>}
              <div className="relative z-10 flex justify-center mb-6">
                <div className="bg-[#fff3c4] dark:bg-[#182229] dark:text-[#ffd279] text-gray-700 text-xs py-2 px-4 rounded-xl shadow-sm flex items-center gap-2 font-medium border border-yellow-200/50 dark:border-yellow-900/30">
                  <Lock className="w-4 h-4" />
                  الرسائل محمية تماماً بين الطرفين. لا يمكن لأحد قراءتها.
                </div>
              </div>
              
              {decryptedMessages.map((msg) => {
                const isMe = msg.senderId === localUser?.uid;
                const isSelected = selectedMessageIds.includes(msg.id);
                
                const handleMessageClick = () => {
                  if (isSelectionMode) {
                    if (isSelected) {
                      const newSelected = selectedMessageIds.filter(id => id !== msg.id);
                      setSelectedMessageIds(newSelected);
                      if (newSelected.length === 0) setIsSelectionMode(false);
                    } else {
                      setSelectedMessageIds([...selectedMessageIds, msg.id]);
                    }
                  }
                };

                const handleLongPress = (e: React.MouseEvent | React.TouchEvent) => {
                  e.preventDefault();
                  if (!isSelectionMode) {
                    setIsSelectionMode(true);
                    setSelectedMessageIds([msg.id]);
                  }
                };

                return (
                  <div 
                    key={msg.id} 
                    className={clsx(
                      "flex flex-col transition-all duration-200", 
                      isMe ? "items-end" : "items-start",
                      isSelected && "bg-[#25D366]/10 dark:bg-[#25D366]/5 -mx-4 px-4"
                    )}
                    onClick={handleMessageClick}
                    onContextMenu={handleLongPress}
                  >
                    <div className={clsx("flex items-center gap-2 max-w-[85%] md:max-w-[75%]", isMe ? "flex-row-reverse" : "flex-row")}>
                      <div 
                        className={clsx(
                          "rounded-2xl px-4 py-2.5 shadow-sm relative cursor-pointer transition-all duration-200",
                          isMe ? "bg-[#dcf8c6] dark:bg-[#005c4b] rounded-tr-none" : "bg-white dark:bg-[#202c33] rounded-tl-none",
                          isSelected && "ring-2 ring-[#25D366] ring-offset-2 dark:ring-offset-[#0b141a] scale-[1.01]"
                        )}
                      >
                        {/* Tail for my messages */}
                        {isMe && (
                          <svg viewBox="0 0 8 13" width="8" height="13" className="absolute top-0 -right-[8px] text-[#dcf8c6] dark:text-[#005c4b]">
                            <path opacity="1" fill="currentColor" d="M5.188 1H0v11.193l6.467-8.625C7.526 2.156 6.958 1 5.188 1z"></path>
                          </svg>
                        )}
                        {/* Tail for their messages */}
                        {!isMe && (
                          <svg viewBox="0 0 8 13" width="8" height="13" className="absolute top-0 -left-[8px] text-white dark:text-[#202c33]">
                            <path opacity="1" fill="currentColor" d="M2.812 1H8v11.193L1.533 3.568C.474 2.156 1.042 1 2.812 1z"></path>
                          </svg>
                        )}
                        
                        {msg.quotedMessageId && (
                          <div className="bg-black/5 dark:bg-black/20 p-2 rounded-lg border-l-4 border-[#25D366] mb-2 text-xs">
                            <p className="font-bold text-[#25D366]">رد على:</p>
                            <p className="text-gray-600 dark:text-gray-400 truncate">
                              {decryptedMessages.find(m => m.id === msg.quotedMessageId)?.text || 'رسالة محذوفة'}
                            </p>
                          </div>
                        )}
                        
                        {msg.type === 'audio' ? (
                          <AudioPlayer src={msg.text} />
                        ) : msg.type === 'image' ? (
                          <div className="space-y-2">
                            <img src={msg.text} alt="Sent image" className="max-w-full rounded-lg shadow-sm cursor-pointer hover:opacity-90 transition" onClick={() => window.open(msg.text)} />
                          </div>
                        ) : msg.type === 'file' ? (
                          <div className="flex items-center gap-3 bg-black/5 dark:bg-black/20 p-3 rounded-xl border border-black/5 dark:border-white/5">
                            <div className="bg-[#25D366]/20 p-2 rounded-lg">
                              <File className="w-6 h-6 text-[#25D366]" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold truncate text-gray-900 dark:text-gray-100">{msg.fileName || 'ملف'}</p>
                              <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">{msg.fileSize ? (msg.fileSize / 1024).toFixed(1) + ' KB' : 'غير معروف'}</p>
                            </div>
                            <a href={msg.text} download={msg.fileName || 'file'} className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition text-[#25D366]">
                              <Download className="w-5 h-5" />
                            </a>
                          </div>
                        ) : isEmojiOnly(msg.text) ? (
                          <div className="flex gap-1">
                            {Array.from(msg.text.trim()).map((char, i) => (
                              <AnimatedEmoji key={i} emoji={char} />
                            ))}
                          </div>
                        ) : (
                          <p className="text-gray-900 dark:text-gray-100 text-[16px] leading-relaxed break-words whitespace-pre-wrap">{msg.text}</p>
                        )}
                        <div className="text-[11px] text-gray-500 dark:text-gray-400 text-left mt-1.5 flex justify-end items-center gap-1.5 font-medium">
                          {msg.isEdited && <span className="italic">تم التعديل</span>}
                          <span>{msg.timestamp ? format(msg.timestamp.toDate(), 'HH:mm') : '...'}</span>
                          {isMe && (
                            <CheckCheck className={clsx("w-4 h-4", msg.read ? "text-[#53bdeb]" : "text-gray-400")} />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="bg-[#f0f2f5] dark:bg-[#202c33] p-3 flex flex-col gap-2 relative z-20 border-t border-gray-200 dark:border-gray-700 shadow-sm">
              {editingMessageId && (
                <div className="bg-white dark:bg-[#111b21] p-2 rounded-lg border-l-4 border-blue-500 flex justify-between items-center text-sm shadow-sm">
                  <div className="truncate">
                    <p className="font-bold text-blue-500 text-xs">تعديل الرسالة:</p>
                    <p className="text-gray-700 dark:text-gray-300 truncate">{decryptedMessages.find(m => m.id === editingMessageId)?.text}</p>
                  </div>
                  <button onClick={() => { setEditingMessageId(null); setNewMessage(''); }} className="text-gray-500 hover:text-gray-700">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              {quotedMessage && (
                <div className="bg-white dark:bg-[#111b21] p-2 rounded-lg border-l-4 border-[#25D366] flex justify-between items-center text-sm shadow-sm">
                  <div className="truncate">
                    <p className="font-bold text-[#25D366] text-xs">رد على:</p>
                    <p className="text-gray-700 dark:text-gray-300 truncate">{quotedMessage.text}</p>
                  </div>
                  <button onClick={() => setQuotedMessage(null)} className="text-gray-500 hover:text-gray-700">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
              {showEmojiPicker && (
                <div className="absolute bottom-20 right-4 z-50 shadow-2xl rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 animate-in slide-in-from-bottom-2 duration-200" dir="ltr">
                  <EmojiPicker 
                    onEmojiClick={(emojiObject) => setNewMessage(prev => prev + emojiObject.emoji)} 
                    searchPlaceHolder="بحث..."
                    width={320} 
                    height={400} 
                    theme={theme === 'dark' ? Theme.DARK : Theme.LIGHT}
                  />
                </div>
              )}
              
              <button 
                type="button"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="p-2.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-all"
              >
                <Smile className="w-6 h-6" />
              </button>

              <button 
                type="button"
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'image/*';
                  input.capture = 'environment';
                  input.onchange = (e: any) => handleFileSelect(e);
                  input.click();
                }}
                className="p-2.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-all"
              >
                <Camera className="w-6 h-6" />
              </button>

              <button 
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-2.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-all"
              >
                <Paperclip className="w-6 h-6" />
              </button>
              <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />
              
              {isRecording ? (
                <div className="flex-1 flex items-center justify-between bg-red-50 dark:bg-red-900/20 rounded-full px-5 py-2.5 border border-red-200 dark:border-red-800/50 shadow-inner">
                  <div className="flex items-center gap-3 text-red-500 dark:text-red-400">
                    <div className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                    </div>
                    <Mic className="w-5 h-5 animate-pulse" />
                    <span className="font-mono text-lg font-medium">{Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}</span>
                  </div>
                  <button 
                    onClick={handleStopRecording}
                    className="bg-red-500 text-white p-2.5 rounded-full hover:bg-red-600 transition-colors shadow-md hover:shadow-lg transform hover:scale-105"
                  >
                    <Square className="w-5 h-5" fill="currentColor" />
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSendMessage} className="flex-1 flex items-end gap-3">
                  <textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="اكتب رسالة..."
                    className="flex-1 bg-white dark:bg-[#2a3942] dark:text-white rounded-2xl px-5 py-3 border-none focus:ring-2 focus:ring-[#25D366] focus:outline-none resize-none min-h-[48px] max-h-32 shadow-sm transition-shadow"
                    rows={1}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage(e);
                      }
                    }}
                  />
                  {newMessage.trim() ? (
                    <button 
                      type="submit" 
                      className="bg-[#25D366] text-white p-3.5 rounded-full hover:bg-[#128C7E] transition-colors shadow-md hover:shadow-lg transform hover:scale-105 flex-shrink-0"
                    >
                      <Send className="w-5 h-5 ml-1 rtl:-scale-x-100" />
                    </button>
                  ) : (
                    <button 
                      type="button" 
                      onClick={handleStartRecording}
                      className="bg-[#25D366] text-white p-3.5 rounded-full hover:bg-[#128C7E] transition-colors shadow-md hover:shadow-lg transform hover:scale-105 flex-shrink-0"
                    >
                      <Mic className="w-5 h-5" />
                    </button>
                  )}
                </form>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-[#f8f9fa] dark:bg-[#0b141a]">
            <MessageCircle className="w-32 h-32 text-gray-300 dark:text-gray-700 mb-6" />
            <h2 className="text-3xl font-light text-gray-600 dark:text-gray-400 mb-3">يوسفيه للمحادثات</h2>
            <p className="text-gray-500 dark:text-gray-500 text-lg">اختر محادثة من القائمة للبدء في المراسلة المحمية.</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {incomingCall && (
          <IncomingCall 
            caller={users.find(u => u.uid === incomingCall.callerId)!} 
            call={incomingCall} 
            onAccept={handleAcceptCall} 
            onReject={handleRejectCall} 
          />
        )}
        {activeCall && (
          <CallScreen 
            localUser={localUser!} 
            remoteUser={users.find(u => u.uid === (activeCall.callerId === localUser?.uid ? activeCall.receiverId : activeCall.callerId))!} 
            call={activeCall} 
            onEnd={handleEndCall} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}
