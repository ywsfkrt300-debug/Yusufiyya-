import React, { useState, useEffect, useRef } from 'react';
import { db } from './firebase';
import { collection, doc, setDoc, getDoc, onSnapshot, query, where, orderBy, addDoc, serverTimestamp, or, deleteDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { generateKeyPair, exportPublicKey, exportPrivateKey, encryptMessage, decryptMessage } from './lib/crypto';
import { savePrivateKey, getPrivateKey } from './lib/idb';
import EmojiPicker, { Theme } from 'emoji-picker-react';
import { format } from 'date-fns';
import { MessageCircle, Send, Smile, Lock, Phone, Camera, Settings, CircleDashed, Users, Mic, Square, Trash2, MoreVertical, Play, Pause, Check, CheckCheck, User as UserIcon } from 'lucide-react';
import clsx from 'clsx';
import AnimatedEmoji from './components/AnimatedEmoji';
import StatusTab from './components/StatusTab';
import SettingsTab from './components/SettingsTab';
import ImageCropperModal from './components/ImageCropperModal';
import { UserProfile, Message, DecryptedMessage, Group } from './types';

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

export default function App() {
  const [step, setStep] = useState<'phone' | 'profile' | 'main'>('phone');
  const [activeTab, setActiveTab] = useState<'chats' | 'status' | 'settings'>('chats');
  const [localUser, setLocalUser] = useState<UserProfile | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  
  // Login State
  const [phoneNumber, setPhoneNumber] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(AVATARS[0]);
  
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
      console.error('Error creating group:', error);
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [decryptedMessages, setDecryptedMessages] = useState<DecryptedMessage[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [quotedMessage, setQuotedMessage] = useState<DecryptedMessage | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
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

  // Initialize from LocalStorage
  useEffect(() => {
    const storedUser = localStorage.getItem('youssefia_user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setLocalUser(parsedUser);
      setTheme(parsedUser.theme || 'light');
      setStep('main');
    }
    setIsInitializing(false);
    
    // Request Notification Permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

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

  // Fetch Users
  useEffect(() => {
    if (step !== 'main' || !localUser) return;
    
    // Update last seen
    const updateLastSeen = async () => {
      await updateDoc(doc(db, 'users', localUser.uid), {
        lastSeen: serverTimestamp()
      });
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
    });
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
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
    });

    return () => unsubscribe();
  }, [step, localUser]);

  // Fetch Messages
  useEffect(() => {
    if (step !== 'main' || !localUser || (!selectedUser && !selectedGroup)) return;

    const q = query(
      collection(db, 'messages'),
      or(
        where('senderId', '==', localUser.uid),
        where('receiverId', '==', localUser.uid)
      ),
      orderBy('timestamp', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: Message[] = [];
      let hasNewMessage = false;
      
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data() as Message;
          // Only notify if it's a new message received (not sent by me) and it's from the selected user
          if (data.receiverId === localUser.uid && data.senderId === selectedUser.uid) {
             hasNewMessage = true;
          }
        }
      });

      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as Message;
        if (
          (data.senderId === localUser.uid && data.receiverId === selectedUser.uid) ||
          (data.senderId === selectedUser.uid && data.receiverId === localUser.uid)
        ) {
          if (!data.deletedFor?.includes(localUser.uid)) {
            msgs.push({ ...data, id: docSnap.id });
            
            // Mark as read if we are receiving it
            if (data.receiverId === localUser.uid && !data.read) {
              updateDoc(doc(db, 'messages', docSnap.id), { read: true });
            }
          }
        }
      });
      
      setMessages(msgs);
      
      if (hasNewMessage) {
        notificationSound.current.play().catch(e => console.log('Audio play failed:', e));
        if (document.hidden && Notification.permission === 'granted') {
           new Notification('رسالة جديدة', {
             body: `لديك رسالة جديدة من ${selectedUser.displayName}`,
             icon: selectedUser.photoURL
           });
        }
      }
    });

    return () => unsubscribe();
  }, [step, localUser, selectedUser]);

  // Decrypt Messages
  useEffect(() => {
    if (step !== 'main' || !localUser) return;

    const decryptAll = async () => {
      const privateKeyPem = await getPrivateKey(localUser.uid);
      if (!privateKeyPem) return;

      const decrypted = await Promise.all(messages.map(async (msg) => {
        const isSender = msg.senderId === localUser.uid;
        const encKey = isSender ? msg.encKeySender : msg.encKeyReceiver;
        
        const text = await decryptMessage(msg.ciphertext, msg.iv, encKey, privateKeyPem);
        return { ...msg, text };
      }));
      
      setDecryptedMessages(decrypted);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    };

    decryptAll();
  }, [messages, localUser, step]);

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fullPhone = `+963${phoneNumber}`;
    if (fullPhone.length < 10) return;
    
    const userDoc = await getDoc(doc(db, 'users', fullPhone));
    if (userDoc.exists()) {
      const privateKey = await getPrivateKey(fullPhone);
      if (privateKey) {
        const userData = userDoc.data() as UserProfile;
        setLocalUser(userData);
        localStorage.setItem('youssefia_user', JSON.stringify(userData));
        setStep('main');
        return;
      }
    }
    setStep('profile');
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
    const fullPhone = `+963${phoneNumber}`;

    try {
      const keyPair = await generateKeyPair();
      const pubKeyPem = await exportPublicKey(keyPair.publicKey);
      const privKeyPem = await exportPrivateKey(keyPair.privateKey);
      
      await savePrivateKey(fullPhone, privKeyPem);
      
      const newUser: UserProfile = {
        uid: fullPhone,
        phoneNumber: fullPhone,
        displayName: displayName,
        photoURL: selectedAvatar,
        publicKey: pubKeyPem,
        privacy: {
          lastSeen: 'everyone',
          status: 'everyone'
        },
        customNames: {},
        theme: 'light'
      };

      await setDoc(doc(db, 'users', fullPhone), newUser);
      
      setLocalUser(newUser);
      localStorage.setItem('youssefia_user', JSON.stringify(newUser));
      setStep('main');
    } catch (error) {
      console.error("Error creating profile:", error);
      alert("حدث خطأ أثناء إنشاء الحساب.");
    }
  };

  const handleSaveContactName = async (contactId: string) => {
    if (!localUser || !newContactName.trim()) return;
    
    try {
      const updatedCustomNames = {
        ...(localUser.customNames || {}),
        [contactId]: newContactName.trim()
      };
      
      await updateDoc(doc(db, 'users', localUser.uid), {
        customNames: updatedCustomNames
      });
      
      const updatedUser = { ...localUser, customNames: updatedCustomNames };
      setLocalUser(updatedUser);
      localStorage.setItem('youssefia_user', JSON.stringify(updatedUser));
      setEditingContactId(null);
    } catch (error) {
      console.error("Error updating contact name:", error);
      alert("حدث خطأ أثناء تحديث الاسم");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('youssefia_user');
    setLocalUser(null);
    setSelectedUser(null);
    setStep('phone');
    setActiveTab('chats');
  };

  const sendEncryptedMessage = async (content: string, type: 'text' | 'audio' = 'text', quotedMessageId?: string) => {
    if (!localUser || !selectedUser) return;
    try {
      const senderPubKey = localUser.publicKey;
      const receiverPubKey = selectedUser.publicKey;

      if (!senderPubKey || !receiverPubKey) throw new Error("Public keys missing");

      const encryptedData = await encryptMessage(content, senderPubKey, receiverPubKey);

      // Play sent sound immediately
      sentSound.current.play().catch(e => console.log('Audio play failed:', e));

      await addDoc(collection(db, 'messages'), {
        senderId: localUser.uid,
        receiverId: selectedUser.uid,
        ciphertext: encryptedData.ciphertext,
        iv: encryptedData.iv,
        encKeySender: encryptedData.encKeySender,
        encKeyReceiver: encryptedData.encKeyReceiver,
        timestamp: serverTimestamp(),
        type,
        deletedFor: [],
        read: false,
        quotedMessageId
      });
    } catch (error) {
      console.error("Error sending message:", error);
      alert("فشل إرسال الرسالة. يرجى المحاولة مرة أخرى.");
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    const textToSend = newMessage;
    setNewMessage('');
    setShowEmojiPicker(false);
    await sendEncryptedMessage(textToSend, 'text', quotedMessage?.id);
    setQuotedMessage(null);
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
          await sendEncryptedMessage(base64Audio, 'audio');
        };
      };
      
      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      setRecordingDuration(0);
      recordingInterval.current = setInterval(() => setRecordingDuration(prev => prev + 1), 1000);
    } catch (err) {
      console.error("Microphone access denied", err);
      alert("يرجى السماح بالوصول إلى الميكروفون.");
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

  const handleDeleteMessage = async (msgId: string, forEveryone: boolean) => {
    if (!localUser) return;
    try {
      if (forEveryone) {
        await deleteDoc(doc(db, 'messages', msgId));
      } else {
        await updateDoc(doc(db, 'messages', msgId), {
          deletedFor: arrayUnion(localUser.uid)
        });
      }
      setSelectedMessageId(null);
    } catch (error) {
      console.error("Error deleting message:", error);
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
              />
            </div>
            <button 
              type="submit"
              className="w-full bg-[#25D366] hover:bg-[#128C7E] text-white font-bold py-4 px-4 rounded-xl shadow-lg shadow-[#25D366]/30 transition-all transform hover:-translate-y-0.5"
            >
              التالي
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
          <h2 className="text-3xl font-extrabold text-gray-800 dark:text-white mb-2 tracking-tight">إعداد الملف الشخصي</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-8 font-medium">الرجاء إدخال اسمك واختيار صورة</p>
          
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
            
            <button 
              type="submit"
              className="w-full bg-[#25D366] hover:bg-[#128C7E] text-white font-bold py-4 px-4 rounded-xl shadow-lg shadow-[#25D366]/30 transition-all transform hover:-translate-y-0.5 text-lg"
            >
              حفظ والبدء
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

  return (
    <div className="flex h-screen bg-[#ece5dd] overflow-hidden font-sans" dir="rtl">
      {/* Sidebar / Tabs Area */}
      <div className={clsx("w-full md:w-1/3 lg:w-1/4 bg-white border-l border-gray-200 flex flex-col", selectedUser && activeTab === 'chats' ? "hidden md:flex" : "flex")}>
        
        {/* App Header */}
        <div className="bg-[#f0f2f5] dark:bg-[#202c33] p-4 flex justify-between items-center border-b border-gray-200 dark:border-gray-700 shadow-sm z-10">
          <h1 className="font-bold text-2xl text-gray-800 dark:text-white tracking-tight">يوسفيه</h1>
          <div className="flex items-center gap-3">
            <button onClick={() => setIsCreatingGroup(true)} className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full">
              <Users className="w-6 h-6" />
            </button>
            <img src={localUser?.photoURL} alt="Profile" className="w-10 h-10 rounded-full object-cover border-2 border-[#25D366]" />
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
                    <img src={u.photoURL} className="w-8 h-8 rounded-full" />
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
                <input
                  type="text"
                  placeholder="بحث..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-gray-100 dark:bg-[#202c33] text-gray-900 dark:text-gray-100 rounded-lg px-4 py-2 focus:outline-none"
                />
              </div>
            {users.filter(u => getDisplayName(u).toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && groups.filter(g => g.name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400 flex flex-col items-center justify-center h-full">
                <div className="bg-gray-100 dark:bg-gray-800 p-6 rounded-full mb-4">
                  <Users className="w-12 h-12 text-gray-400 dark:text-gray-500" />
                </div>
                <p className="text-lg font-medium text-gray-700 dark:text-gray-300">لا يوجد مستخدمين أو مجموعات بهذا الاسم.</p>
              </div>
            ) : (
              <>
                {groups.filter(g => g.name.toLowerCase().includes(searchQuery.toLowerCase())).map(g => (
                  <div 
                    key={g.id} 
                    onClick={() => { setSelectedGroup(g); setSelectedUser(null); }}
                    className={clsx(
                      "flex items-center gap-4 p-4 cursor-pointer border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-[#202c33] transition-all duration-200",
                      selectedGroup?.id === g.id && "bg-gray-100 dark:bg-[#2a3942]"
                    )}
                  >
                    <div className="relative">
                      <img src={g.photoURL} alt={g.name} className="w-14 h-14 rounded-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-gray-900 dark:text-gray-100 text-lg truncate">{g.name}</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 truncate font-medium">مجموعة</p>
                    </div>
                  </div>
                ))}
                {users.filter(u => getDisplayName(u).toLowerCase().includes(searchQuery.toLowerCase())).map(u => (
                  <div 
                    key={u.uid} 
                    onClick={() => { setSelectedUser(u); setSelectedGroup(null); }}
                    className={clsx(
                      "flex items-center gap-4 p-4 cursor-pointer border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-[#202c33] transition-all duration-200",
                      selectedUser?.uid === u.uid && "bg-gray-100 dark:bg-[#2a3942]"
                    )}
                  >
                    <div className="relative">
                      <img src={u.photoURL} alt={getDisplayName(u)} className="w-14 h-14 rounded-full object-cover" />
                      {u.privacy?.status !== 'nobody' && (
                        <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-[#25D366] border-2 border-white dark:border-[#111b21] rounded-full"></div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-1">
                        <h3 className="font-bold text-gray-900 dark:text-gray-100 text-lg truncate">{getDisplayName(u)}</h3>
                        {unreadCounts[u.uid] > 0 && (
                          <span className="bg-[#25D366] text-white text-xs font-bold px-2 py-1 rounded-full shadow-sm">
                            {unreadCounts[u.uid]}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 truncate font-medium" dir="ltr">{u.phoneNumber}</p>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )
      )}

      {activeTab === 'status' && (
        <StatusTab localUser={localUser} users={users} getDisplayName={getDisplayName} />
      )}

      {activeTab === 'settings' && (
        <SettingsTab localUser={localUser} setLocalUser={setLocalUser} onLogout={handleLogout} theme={theme} setTheme={setTheme} />
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
            {/* Chat Header */}
            <div className="bg-[#f0f2f5] dark:bg-[#202c33] p-3 flex items-center gap-4 border-b border-gray-200 dark:border-gray-700 shadow-sm z-10">
              <button className="md:hidden text-gray-600 dark:text-gray-300 p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition" onClick={() => { setSelectedUser(null); setSelectedGroup(null); }}>
                &rarr;
              </button>
              <img src={selectedUser ? selectedUser.photoURL : selectedGroup!.photoURL} alt={selectedUser ? getDisplayName(selectedUser) : selectedGroup!.name} className="w-12 h-12 rounded-full object-cover border border-gray-200 dark:border-gray-600" />
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
                    <span className="text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-md">تعديل</span>
                  </div>
                )}
                {selectedUser.privacy?.lastSeen !== 'nobody' && selectedUser.lastSeen && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                    آخر ظهور: {format(selectedUser.lastSeen.toDate(), 'HH:mm')}
                  </p>
                )}
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 relative" style={{ backgroundImage: theme === 'dark' ? 'none' : 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")', backgroundRepeat: 'repeat', opacity: theme === 'dark' ? 1 : 0.9 }}>
              {theme === 'dark' && <div className="absolute inset-0 bg-[#0b141a] opacity-95 pointer-events-none"></div>}
              <div className="relative z-10 flex justify-center mb-6">
                <div className="bg-[#fff3c4] dark:bg-[#182229] dark:text-[#ffd279] text-gray-700 text-xs py-2 px-4 rounded-xl shadow-sm flex items-center gap-2 font-medium border border-yellow-200/50 dark:border-yellow-900/30">
                  <Lock className="w-4 h-4" />
                  الرسائل مشفرة تماماً بين الطرفين. لا يمكن لأحد قراءتها.
                </div>
              </div>
              
              {decryptedMessages.map((msg) => {
                const isMe = msg.senderId === localUser?.uid;
                const isSelected = selectedMessageId === msg.id;
                
                return (
                  <div key={msg.id} className={clsx("flex flex-col", isMe ? "items-end" : "items-start")}>
                    <div className={clsx("flex items-center gap-2 max-w-[85%] md:max-w-[75%]", isMe ? "flex-row-reverse" : "flex-row")}>
                      <div 
                        className={clsx(
                          "rounded-2xl px-4 py-2.5 shadow-sm relative cursor-pointer transition-all duration-200",
                          isMe ? "bg-[#dcf8c6] dark:bg-[#005c4b] rounded-tr-none" : "bg-white dark:bg-[#202c33] rounded-tl-none",
                          isSelected && "ring-2 ring-[#25D366] ring-offset-2 dark:ring-offset-[#0b141a] scale-[1.02]"
                        )}
                        onClick={() => setSelectedMessageId(isSelected ? null : msg.id)}
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
                          <span>{msg.timestamp ? format(msg.timestamp.toDate(), 'HH:mm') : '...'}</span>
                          {isMe && (
                            <CheckCheck className={clsx("w-4 h-4", msg.read ? "text-[#53bdeb]" : "text-gray-400")} />
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* Delete Menu */}
                    {isSelected && (
                      <div className={clsx("mt-2 flex gap-2 bg-white dark:bg-[#202c33] p-2 rounded-xl shadow-lg z-10 border border-gray-100 dark:border-gray-700/50 animate-in fade-in zoom-in duration-200", isMe ? "mr-2" : "ml-2")}>
                        <button 
                          onClick={() => {
                            setQuotedMessage(msg);
                            setSelectedMessageId(null);
                          }}
                          className="text-sm text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors font-medium"
                        >
                          <MessageCircle className="w-4 h-4" /> رد
                        </button>
                        <button 
                          onClick={() => handleDeleteMessage(msg.id, false)}
                          className="text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors font-medium"
                        >
                          <Trash2 className="w-4 h-4" /> حذف لدي
                        </button>
                        {isMe && (
                          <button 
                            onClick={() => handleDeleteMessage(msg.id, true)}
                            className="text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 px-4 py-2 rounded-lg flex items-center gap-2 font-bold transition-colors"
                          >
                            <Trash2 className="w-4 h-4" /> حذف لدى الجميع
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="bg-[#f0f2f5] dark:bg-[#202c33] p-3 flex flex-col gap-2 relative z-20 border-t border-gray-200 dark:border-gray-700 shadow-sm">
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
            <p className="text-gray-500 dark:text-gray-500 text-lg">اختر محادثة من القائمة للبدء في المراسلة المشفرة.</p>
          </div>
        )}
      </div>
    </div>
  );
}
