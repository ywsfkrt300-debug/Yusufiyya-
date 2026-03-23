import React, { useState, useEffect, useRef } from 'react';
import { db } from './firebase';
import { collection, doc, setDoc, getDoc, onSnapshot, query, where, orderBy, addDoc, serverTimestamp, or, deleteDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { generateKeyPair, exportPublicKey, exportPrivateKey, encryptMessage, decryptMessage } from './lib/crypto';
import { savePrivateKey, getPrivateKey } from './lib/idb';
import EmojiPicker from 'emoji-picker-react';
import { format } from 'date-fns';
import { MessageCircle, Send, Smile, Lock, Phone, Camera, Settings, CircleDashed, Users, Mic, Square, Trash2, MoreVertical, Play, Pause } from 'lucide-react';
import clsx from 'clsx';
import StatusTab from './components/StatusTab';
import SettingsTab from './components/SettingsTab';
import ImageCropperModal from './components/ImageCropperModal';

// ... (interfaces and AVATARS remain the same)
interface UserProfile {
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
}

interface Message {
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
}

interface DecryptedMessage extends Message {
  text: string;
}

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
  
  // Chat State
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [decryptedMessages, setDecryptedMessages] = useState<DecryptedMessage[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [newMessage, setNewMessage] = useState('');
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

  // Initialize from LocalStorage
  useEffect(() => {
    const storedUser = localStorage.getItem('youssefia_user');
    if (storedUser) {
      setLocalUser(JSON.parse(storedUser));
      setStep('main');
    }
    setIsInitializing(false);
    
    // Request Notification Permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

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

  // Fetch Messages
  useEffect(() => {
    if (step !== 'main' || !localUser || !selectedUser) return;

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
        }
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

  const handleLogout = () => {
    localStorage.removeItem('youssefia_user');
    setLocalUser(null);
    setSelectedUser(null);
    setStep('phone');
    setActiveTab('chats');
  };

  const sendEncryptedMessage = async (content: string, type: 'text' | 'audio' = 'text') => {
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
        read: false
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
    await sendEncryptedMessage(textToSend, 'text');
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
    return <div className="min-h-screen flex items-center justify-center bg-[#ece5dd]">جاري التحميل...</div>;
  }

  if (step === 'phone') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#ece5dd] p-4 text-center" dir="rtl">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full">
          <MessageCircle className="w-16 h-16 text-[#25D366] mx-auto mb-6" />
          <h1 className="text-3xl font-bold text-gray-800 mb-2">يوسفيه للمحادثات</h1>
          <p className="text-gray-600 mb-8">أدخل رقم هاتفك للبدء</p>
          
          <form onSubmit={handlePhoneSubmit} className="space-y-4">
            <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-[#25D366] focus-within:border-transparent bg-white">
              <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-l border-gray-300" dir="ltr">
                <span className="text-xl" title="سوريا">🇸🇾</span>
                <span className="font-bold text-gray-700">+963</span>
              </div>
              <input 
                type="tel" 
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                className="w-full px-4 py-3 outline-none text-left font-semibold text-gray-800 tracking-wider"
                dir="ltr"
                placeholder="9xxxxxxxx"
                required
              />
            </div>
            <button 
              type="submit"
              className="w-full bg-[#25D366] hover:bg-[#128C7E] text-white font-bold py-3 px-4 rounded-lg transition duration-200"
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
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#ece5dd] p-4 text-center" dir="rtl">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">إعداد الملف الشخصي</h2>
          <p className="text-gray-600 mb-6">الرجاء إدخال اسمك واختيار صورة</p>
          
          <form onSubmit={handleProfileSubmit} className="space-y-6">
            <div className="flex justify-center mb-4">
              <div className="relative group">
                <img src={selectedAvatar} alt="Avatar" className="w-24 h-24 rounded-full border-4 border-[#25D366] object-cover" />
                <label className="absolute bottom-0 right-0 bg-[#25D366] p-2 rounded-full text-white cursor-pointer hover:bg-[#128C7E] transition shadow-md">
                  <Camera className="w-4 h-4" />
                  <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                </label>
              </div>
            </div>
            
            <div className="grid grid-cols-4 gap-2 mb-6">
              {AVATARS.map((avatar, idx) => (
                <img 
                  key={idx}
                  src={avatar}
                  alt={`Avatar ${idx}`}
                  onClick={() => setSelectedAvatar(avatar)}
                  className={clsx(
                    "w-12 h-12 rounded-full cursor-pointer border-2 transition-all",
                    selectedAvatar === avatar ? "border-[#25D366] scale-110" : "border-transparent hover:scale-105"
                  )}
                />
              ))}
            </div>

            <input 
              type="text" 
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#25D366] focus:border-transparent outline-none"
              placeholder="اسمك (مثال: يوسف)"
              required
            />
            
            <button 
              type="submit"
              className="w-full bg-[#25D366] hover:bg-[#128C7E] text-white font-bold py-3 px-4 rounded-lg transition duration-200"
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
        <div className="bg-[#f0f2f5] p-4 flex justify-between items-center border-b border-gray-200">
          <h1 className="font-bold text-xl text-gray-800">يوسفيه</h1>
          <div className="flex items-center gap-3">
            <img src={localUser?.photoURL} alt="Profile" className="w-10 h-10 rounded-full object-cover" />
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'chats' && (
          <div className="flex-1 overflow-y-auto">
            {users.length === 0 ? (
              <div className="p-8 text-center text-gray-500 flex flex-col items-center">
                <Users className="w-12 h-12 text-gray-300 mb-4" />
                <p>لا يوجد مستخدمين آخرين حالياً.</p>
                <p className="text-sm mt-2">شارك التطبيق مع أصدقائك للبدء!</p>
              </div>
            ) : (
              users.map(u => (
                <div 
                  key={u.uid} 
                  onClick={() => setSelectedUser(u)}
                  className={clsx(
                    "flex items-center gap-3 p-4 cursor-pointer border-b border-gray-100 hover:bg-[#f5f6f6] transition",
                    selectedUser?.uid === u.uid && "bg-[#ebebeb]"
                  )}
                >
                  <img src={u.photoURL} alt={u.displayName} className="w-12 h-12 rounded-full object-cover" />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center">
                      <h3 className="font-semibold text-gray-800 truncate">{u.displayName}</h3>
                      {unreadCounts[u.uid] > 0 && (
                        <span className="bg-[#25D366] text-white text-xs font-bold px-2 py-1 rounded-full">
                          {unreadCounts[u.uid]}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 truncate" dir="ltr">{u.phoneNumber}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'status' && (
          <StatusTab localUser={localUser} users={users} />
        )}

        {activeTab === 'settings' && (
          <SettingsTab localUser={localUser} setLocalUser={setLocalUser} onLogout={handleLogout} />
        )}

        {/* Bottom Navigation Tabs */}
        <div className="bg-[#f0f2f5] border-t border-gray-200 flex justify-around p-2">
          <button 
            onClick={() => { setActiveTab('chats'); setSelectedUser(null); }}
            className={clsx("flex flex-col items-center p-2 rounded-lg transition-colors flex-1", activeTab === 'chats' ? "text-[#25D366]" : "text-gray-500 hover:bg-gray-200")}
          >
            <MessageCircle className="w-6 h-6 mb-1" />
            <span className="text-xs font-semibold">الدردشات</span>
          </button>
          <button 
            onClick={() => { setActiveTab('status'); setSelectedUser(null); }}
            className={clsx("flex flex-col items-center p-2 rounded-lg transition-colors flex-1", activeTab === 'status' ? "text-[#25D366]" : "text-gray-500 hover:bg-gray-200")}
          >
            <CircleDashed className="w-6 h-6 mb-1" />
            <span className="text-xs font-semibold">الحالة</span>
          </button>
          <button 
            onClick={() => { setActiveTab('settings'); setSelectedUser(null); }}
            className={clsx("flex flex-col items-center p-2 rounded-lg transition-colors flex-1", activeTab === 'settings' ? "text-[#25D366]" : "text-gray-500 hover:bg-gray-200")}
          >
            <Settings className="w-6 h-6 mb-1" />
            <span className="text-xs font-semibold">الإعدادات</span>
          </button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className={clsx("flex-1 flex flex-col bg-[#e5ddd5] relative", (!selectedUser || activeTab !== 'chats') ? "hidden md:flex" : "flex")}>
        {selectedUser && activeTab === 'chats' ? (
          <>
            {/* Chat Header */}
            <div className="bg-[#f0f2f5] p-3 flex items-center gap-3 border-b border-gray-200 z-10">
              <button className="md:hidden text-gray-600 mr-2" onClick={() => setSelectedUser(null)}>
                &rarr;
              </button>
              <img src={selectedUser.photoURL} alt={selectedUser.displayName} className="w-10 h-10 rounded-full object-cover" />
              <div>
                <h2 className="font-semibold text-gray-800">{selectedUser.displayName}</h2>
                {selectedUser.privacy?.lastSeen !== 'nobody' && selectedUser.lastSeen && (
                  <p className="text-xs text-gray-500">
                    آخر ظهور: {format(selectedUser.lastSeen.toDate(), 'HH:mm')}
                  </p>
                )}
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")', backgroundRepeat: 'repeat', opacity: 0.9 }}>
              <div className="flex justify-center mb-6">
                <div className="bg-[#fff3c4] text-gray-700 text-xs py-1.5 px-3 rounded-lg shadow-sm flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  الرسائل مشفرة تماماً بين الطرفين. لا يمكن لأحد قراءتها.
                </div>
              </div>
              
              {decryptedMessages.map((msg) => {
                const isMe = msg.senderId === localUser?.uid;
                const isSelected = selectedMessageId === msg.id;
                
                return (
                  <div key={msg.id} className={clsx("flex flex-col", isMe ? "items-end" : "items-start")}>
                    <div className={clsx("flex items-center gap-2", isMe ? "flex-row-reverse" : "flex-row")}>
                      <div 
                        className={clsx(
                          "max-w-[75%] rounded-lg p-2 shadow-sm relative cursor-pointer transition-all",
                          isMe ? "bg-[#dcf8c6] rounded-tr-none" : "bg-white rounded-tl-none",
                          isSelected && "ring-2 ring-[#25D366] ring-offset-1"
                        )}
                        onClick={() => setSelectedMessageId(isSelected ? null : msg.id)}
                      >
                        {msg.type === 'audio' ? (
                          <AudioPlayer src={msg.text} />
                        ) : (
                          <p className="text-gray-800 text-[15px] leading-relaxed break-words whitespace-pre-wrap">{msg.text}</p>
                        )}
                        <div className="text-[10px] text-gray-500 text-left mt-1 flex justify-between items-center gap-2">
                          <span>{msg.timestamp ? format(msg.timestamp.toDate(), 'HH:mm') : '...'}</span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Delete Menu */}
                    {isSelected && (
                      <div className={clsx("mt-1 flex gap-2 bg-white p-2 rounded-lg shadow-md z-10", isMe ? "mr-2" : "ml-2")}>
                        <button 
                          onClick={() => handleDeleteMessage(msg.id, false)}
                          className="text-xs text-red-500 hover:bg-red-50 px-2 py-1 rounded flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" /> حذف لدي
                        </button>
                        {isMe && (
                          <button 
                            onClick={() => handleDeleteMessage(msg.id, true)}
                            className="text-xs text-red-600 hover:bg-red-50 px-2 py-1 rounded flex items-center gap-1 font-semibold"
                          >
                            <Trash2 className="w-3 h-3" /> حذف لدى الجميع
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
            <div className="bg-[#f0f2f5] p-3 flex items-end gap-2 relative z-20">
              {showEmojiPicker && (
                <div className="absolute bottom-16 right-2 z-50 shadow-xl rounded-lg overflow-hidden" dir="ltr">
                  <EmojiPicker 
                    onEmojiClick={(emojiObject) => setNewMessage(prev => prev + emojiObject.emoji)} 
                    searchPlaceHolder="بحث..."
                    width={300} 
                    height={400} 
                  />
                </div>
              )}
              
              <button 
                type="button"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="p-2 text-gray-500 hover:text-gray-700 transition"
              >
                <Smile className="w-6 h-6" />
              </button>
              
              {isRecording ? (
                <div className="flex-1 flex items-center justify-between bg-red-50 rounded-full px-4 py-2 border border-red-200">
                  <div className="flex items-center gap-2 text-red-500 animate-pulse">
                    <Mic className="w-5 h-5" />
                    <span className="font-mono">{Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}</span>
                  </div>
                  <button 
                    onClick={handleStopRecording}
                    className="bg-red-500 text-white p-2 rounded-full hover:bg-red-600 transition"
                  >
                    <Square className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSendMessage} className="flex-1 flex gap-2">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="اكتب رسالة..."
                    className="flex-1 py-2.5 px-4 rounded-full border-none focus:outline-none focus:ring-1 focus:ring-[#128C7E] bg-white text-gray-800"
                  />
                  {newMessage.trim() ? (
                    <button 
                      type="submit" 
                      className="bg-[#128C7E] text-white p-2.5 rounded-full hover:bg-[#075e54] transition flex items-center justify-center"
                    >
                      <Send className="w-5 h-5 rtl:-scale-x-100" />
                    </button>
                  ) : (
                    <button 
                      type="button" 
                      onClick={handleStartRecording}
                      className="bg-[#25D366] text-white p-2.5 rounded-full hover:bg-[#128C7E] transition flex items-center justify-center"
                    >
                      <Mic className="w-5 h-5" />
                    </button>
                  )}
                </form>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-[#f8f9fa]">
            <MessageCircle className="w-24 h-24 text-gray-300 mb-4" />
            <h2 className="text-2xl font-light text-gray-600 mb-2">يوسفيه للمحادثات</h2>
            <p className="text-gray-500">اختر محادثة من القائمة للبدء في المراسلة المشفرة.</p>
          </div>
        )}
      </div>
    </div>
  );
}
