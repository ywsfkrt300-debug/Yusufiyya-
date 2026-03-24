import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, orderBy, updateDoc, doc, arrayUnion, arrayRemove, deleteDoc } from 'firebase/firestore';
import { Camera, Plus, X, Image as ImageIcon, Type, Trash2, Heart } from 'lucide-react';
import { format } from 'date-fns';
import clsx from 'clsx';
import ImageCropperModal from './ImageCropperModal';

interface Props {
  localUser: any;
  users: any[];
  getDisplayName?: (user: any) => string;
}

interface Status {
  id: string;
  userId: string;
  type: 'text' | 'image';
  content: string;
  textColor?: string;
  timestamp: any;
  expiresAt: number;
  viewedBy?: string[];
  likes?: string[];
}

export default function StatusTab({ localUser, users, getDisplayName }: Props) {
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [viewingUserStatuses, setViewingUserStatuses] = useState<Status[] | null>(null);
  const [currentStatusIndex, setCurrentStatusIndex] = useState(0);
  const [isAddingStatus, setIsAddingStatus] = useState(false);
  
  // Add Status State
  const [statusType, setStatusType] = useState<'text' | 'image'>('text');
  const [statusText, setStatusText] = useState('');
  const [statusTextColor, setStatusTextColor] = useState('#000000');
  const [statusImageSrc, setStatusImageSrc] = useState<string | null>(null);
  const [showCropper, setShowCropper] = useState(false);

  useEffect(() => {
    const now = Date.now();
    const q = query(
      collection(db, 'statuses'),
      where('expiresAt', '>', now),
      orderBy('expiresAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Status[] = [];
      snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() } as Status));
      setStatuses(list);
    });

    return () => unsubscribe();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        setStatusImageSrc(reader.result?.toString() || null);
        setShowCropper(true);
      });
      reader.readAsDataURL(file);
    }
  };

  const handleCropComplete = async (croppedBase64: string) => {
    setShowCropper(false);
    
    try {
      await addDoc(collection(db, 'statuses'), {
        userId: localUser.uid,
        type: 'image',
        content: croppedBase64,
        timestamp: serverTimestamp(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
        viewedBy: [],
        likes: []
      });
      setIsAddingStatus(false);
      setStatusImageSrc(null);
    } catch (error) {
      console.error('Error uploading image status:', error);
    }
  };

  const handleAddTextStatus = async () => {
    if (!statusText.trim()) return;
    try {
      await addDoc(collection(db, 'statuses'), {
        userId: localUser.uid,
        type: 'text',
        content: statusText,
        textColor: statusTextColor,
        timestamp: serverTimestamp(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
        viewedBy: [],
        likes: []
      });
      setIsAddingStatus(false);
      setStatusText('');
      setStatusTextColor('#000000');
    } catch (error) {
      console.error('Error adding text status:', error);
    }
  };

  // Group statuses by user
  const userStatuses = statuses.reduce((acc, status) => {
    if (!acc[status.userId]) acc[status.userId] = [];
    acc[status.userId].push(status);
    return acc;
  }, {} as Record<string, Status[]>);

  // Sort statuses by timestamp ascending for viewing
  Object.keys(userStatuses).forEach(uid => {
    userStatuses[uid].sort((a, b) => (a.timestamp?.toMillis?.() || 0) - (b.timestamp?.toMillis?.() || 0));
  });

  const myStatuses = userStatuses[localUser.uid] || [];
  const otherUsersWithStatuses = users.filter(u => {
    if (u.privacy?.status === 'nobody') return false;
    return userStatuses[u.uid] && userStatuses[u.uid].length > 0;
  });

  const handleViewStatus = async (userStatusesList: Status[]) => {
    setViewingUserStatuses(userStatusesList);
    setCurrentStatusIndex(0);
    
    // Mark first status as viewed
    const firstStatus = userStatusesList[0];
    if (firstStatus && !firstStatus.viewedBy?.includes(localUser.uid)) {
      await updateDoc(doc(db, 'statuses', firstStatus.id), {
        viewedBy: arrayUnion(localUser.uid)
      });
    }
  };

  const handleNextStatus = async () => {
    if (!viewingUserStatuses) return;
    
    if (currentStatusIndex < viewingUserStatuses.length - 1) {
      const nextIndex = currentStatusIndex + 1;
      setCurrentStatusIndex(nextIndex);
      
      const nextStatus = viewingUserStatuses[nextIndex];
      if (!nextStatus.viewedBy?.includes(localUser.uid)) {
        await updateDoc(doc(db, 'statuses', nextStatus.id), {
          viewedBy: arrayUnion(localUser.uid)
        });
      }
    } else {
      setViewingUserStatuses(null);
    }
  };

  const handleLikeStatus = async (e: React.MouseEvent, statusId: string, isLiked: boolean) => {
    e.stopPropagation();
    try {
      await updateDoc(doc(db, 'statuses', statusId), {
        likes: isLiked ? arrayRemove(localUser.uid) : arrayUnion(localUser.uid)
      });
    } catch (error) {
      console.error('Error liking status:', error);
    }
  };

  const currentStatus = viewingUserStatuses?.[currentStatusIndex];
  const isLiked = currentStatus?.likes?.includes(localUser.uid) || false;

  return (
    <div className="flex-1 overflow-y-auto bg-[#f0f2f5] dark:bg-[#111b21] p-4" dir="rtl">
      {/* My Status */}
      <div className="bg-white dark:bg-[#202c33] rounded-2xl shadow-sm mb-6 overflow-hidden border border-gray-100 dark:border-gray-800/50">
        <div 
          className="p-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-[#2a3942] transition-colors duration-200"
          onClick={() => myStatuses.length > 0 ? handleViewStatus(myStatuses) : setIsAddingStatus(true)}
        >
          <div className="relative">
            <img src={localUser?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(localUser?.displayName || 'User')}`} alt="My Status" className={clsx("w-14 h-14 rounded-full object-cover", myStatuses.length > 0 && "ring-2 ring-gray-300 dark:ring-gray-600 p-0.5")} />
            <div className="absolute bottom-0 right-0 bg-[#25D366] text-white rounded-full p-1.5 border-2 border-white dark:border-[#202c33] shadow-sm transform hover:scale-110 transition-transform" onClick={(e) => { e.stopPropagation(); setIsAddingStatus(true); }}>
              <Plus className="w-3.5 h-3.5" strokeWidth={3} />
            </div>
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 text-lg">حالتي</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mt-0.5">
              {myStatuses.length > 0 ? 'انقر لعرض تحديثاتك' : 'انقر لإضافة حالة جديدة'}
            </p>
          </div>
        </div>
      </div>

      {/* Recent Updates */}
      {otherUsersWithStatuses.length > 0 && (
        <>
          <h4 className="text-gray-500 dark:text-gray-400 font-bold mb-3 px-4 text-sm tracking-wide">التحديثات الأخيرة</h4>
          <div className="bg-white dark:bg-[#202c33] rounded-2xl shadow-sm overflow-hidden border border-gray-100 dark:border-gray-800/50">
            {otherUsersWithStatuses.map(u => {
              const uStatuses = userStatuses[u.uid];
              const allViewed = uStatuses.every(s => s.viewedBy?.includes(localUser.uid));
              
              return (
                <div 
                  key={u.uid}
                  className="p-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-[#2a3942] transition-colors duration-200 border-b last:border-0 border-gray-100 dark:border-gray-800/50"
                  onClick={() => handleViewStatus(uStatuses)}
                >
                  <div className="relative">
                    <svg className="absolute -inset-1 w-[calc(100%+8px)] h-[calc(100%+8px)]" viewBox="0 0 100 100">
                      <circle 
                        cx="50" cy="50" r="48" 
                        fill="none" 
                        stroke={allViewed ? (document.documentElement.classList.contains('dark') ? '#4b5563' : '#d1d5db') : '#25D366'} 
                        strokeWidth="4" 
                        strokeDasharray={uStatuses.length > 1 ? `${(301 / uStatuses.length) - 4} 4` : 'none'}
                        className="transform -rotate-90 origin-center transition-colors duration-300"
                      />
                    </svg>
                    <img src={u?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(getDisplayName ? getDisplayName(u) : u.displayName)}`} alt={getDisplayName ? getDisplayName(u) : u.displayName} className="w-14 h-14 rounded-full object-cover relative z-10 border-2 border-white dark:border-[#202c33]" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-gray-900 dark:text-gray-100 text-lg">{getDisplayName ? getDisplayName(u) : u.displayName}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mt-0.5">{uStatuses.length} حالة</p>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Add Status Modal */}
      {isAddingStatus && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex flex-col animate-in fade-in duration-200">
          <div className="p-4 flex justify-between items-center text-white bg-gradient-to-b from-black/80 to-transparent">
            <button onClick={() => setIsAddingStatus(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <X className="w-6 h-6" />
            </button>
            <h2 className="font-bold text-lg tracking-wide">إضافة حالة جديدة</h2>
            <div className="w-10"></div>
          </div>
          
          <div className="flex-1 flex flex-col items-center justify-center p-6 relative">
            {statusType === 'text' ? (
              <div className="w-full max-w-md animate-in zoom-in-95 duration-200 flex flex-col items-center gap-6">
                <textarea
                  value={statusText}
                  onChange={(e) => setStatusText(e.target.value)}
                  placeholder="اكتب حالتك هنا..."
                  className="w-full h-64 bg-transparent text-white text-4xl text-center resize-none focus:outline-none placeholder-white/30 font-medium leading-relaxed"
                  style={{ color: statusTextColor }}
                  autoFocus
                />
                <input
                  type="color"
                  value={statusTextColor}
                  onChange={(e) => setStatusTextColor(e.target.value)}
                  className="w-12 h-12 rounded-full cursor-pointer border-2 border-white/20"
                />
                <button 
                  onClick={handleAddTextStatus}
                  disabled={!statusText.trim()}
                  className="w-full mt-8 bg-[#25D366] text-white font-bold py-4 rounded-2xl hover:bg-[#128C7E] transition-all disabled:opacity-50 disabled:hover:bg-[#25D366] shadow-lg hover:shadow-xl transform hover:-translate-y-1"
                >
                  نشر الحالة
                </button>
              </div>
            ) : (
              <div className="w-full max-w-md flex flex-col items-center gap-8 animate-in zoom-in-95 duration-200">
                <label className="w-40 h-40 rounded-full bg-white/5 flex flex-col items-center justify-center cursor-pointer hover:bg-white/10 transition-all border-2 border-dashed border-white/20 hover:border-white/40 group">
                  <Camera className="w-12 h-12 text-white/70 group-hover:text-white mb-2 transition-colors" />
                  <span className="text-white/70 group-hover:text-white text-sm font-medium transition-colors">اضغط للالتقاط</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                </label>
                <p className="text-white/80 text-lg font-medium">أو اختر صورة من المعرض</p>
              </div>
            )}
          </div>

          <div className="p-6 flex justify-center gap-12 bg-gradient-to-t from-black/80 to-transparent">
            <button 
              onClick={() => setStatusType('text')}
              className={clsx("flex flex-col items-center gap-2 transition-all transform hover:scale-110", statusType === 'text' ? "text-[#25D366]" : "text-white/50 hover:text-white/80")}
            >
              <div className={clsx("p-3 rounded-full", statusType === 'text' ? "bg-[#25D366]/20" : "bg-white/5")}>
                <Type className="w-6 h-6" />
              </div>
              <span className="text-sm font-medium">نص</span>
            </button>
            <button 
              onClick={() => setStatusType('image')}
              className={clsx("flex flex-col items-center gap-2 transition-all transform hover:scale-110", statusType === 'image' ? "text-[#25D366]" : "text-white/50 hover:text-white/80")}
            >
              <div className={clsx("p-3 rounded-full", statusType === 'image' ? "bg-[#25D366]/20" : "bg-white/5")}>
                <ImageIcon className="w-6 h-6" />
              </div>
              <span className="text-sm font-medium">صورة</span>
            </button>
          </div>
        </div>
      )}

      {/* View Status Modal */}
      {viewingUserStatuses && viewingUserStatuses[currentStatusIndex] && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col animate-in fade-in duration-200" onClick={handleNextStatus}>
          {/* Progress bars */}
          <div className="absolute top-0 left-0 right-0 p-2 flex gap-1.5 z-30 bg-gradient-to-b from-black/60 to-transparent pt-4">
            {viewingUserStatuses.map((_, idx) => (
              <div key={idx} className="h-1 flex-1 bg-white/30 rounded-full overflow-hidden backdrop-blur-sm">
                <div 
                  className={clsx(
                    "h-full bg-white transition-all ease-linear",
                    idx < currentStatusIndex ? "w-full" : idx === currentStatusIndex ? "animate-shrink" : "w-0"
                  )} 
                  onAnimationEnd={idx === currentStatusIndex ? handleNextStatus : undefined}
                ></div>
              </div>
            ))}
          </div>

          <div className="absolute top-6 left-0 right-0 p-4 flex justify-between items-center z-20">
            <div className="flex items-center gap-3">
              <img 
                src={currentStatus.userId === localUser.uid ? (localUser?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(localUser?.displayName || 'User')}`) : (users.find(u => u.uid === currentStatus.userId)?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(users.find(u => u.uid === currentStatus.userId)?.displayName || 'User')}`)} 
                className="w-10 h-10 rounded-full border-2 border-white/20 shadow-sm" 
                alt="User"
              />
              <div className="flex flex-col">
                <span className="text-white font-bold drop-shadow-md text-lg">
                  {currentStatus.userId === localUser.uid ? 'أنت' : users.find(u => u.uid === currentStatus.userId)?.displayName}
                </span>
                <span className="text-white/80 text-xs drop-shadow-md">
                  {currentStatus.timestamp ? format(currentStatus.timestamp.toDate(), 'HH:mm') : 'الآن'}
                </span>
              </div>
            </div>
            <button onClick={(e) => { e.stopPropagation(); setViewingUserStatuses(null); }} className="p-2 text-white hover:bg-white/20 rounded-full transition-colors backdrop-blur-sm">
              <X className="w-6 h-6" />
            </button>
            {currentStatus.userId === localUser.uid && (
              <button 
                onClick={async (e) => {
                  e.stopPropagation();
                  await deleteDoc(doc(db, 'statuses', currentStatus.id));
                  setViewingUserStatuses(null);
                }}
                className="p-2 text-red-500 hover:bg-red-500/20 rounded-full transition-colors backdrop-blur-sm"
              >
                <Trash2 className="w-6 h-6" />
              </button>
            )}
          </div>

          <div className="flex-1 flex items-center justify-center relative bg-black">
            {currentStatus.type === 'image' ? (
              <img src={currentStatus.content} alt="Status" className="w-full h-full object-contain animate-in zoom-in-95 duration-300" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-8 animate-in zoom-in-95 duration-300">
                <p 
                  className="text-4xl md:text-5xl text-center font-bold drop-shadow-2xl leading-relaxed whitespace-pre-wrap max-w-3xl"
                  style={{ color: currentStatus.textColor || '#ffffff' }}
                >
                  {currentStatus.content}
                </p>
              </div>
            )}

            {/* Like Button Overlay */}
            <div className="absolute bottom-10 left-0 right-0 flex flex-col items-center gap-2 z-30">
              <button 
                onClick={(e) => handleLikeStatus(e, currentStatus.id, isLiked)}
                className={clsx(
                  "p-4 rounded-full transition-all transform hover:scale-125 active:scale-95 shadow-2xl backdrop-blur-md",
                  isLiked ? "bg-red-500 text-white" : "bg-white/20 text-white hover:bg-white/40"
                )}
              >
                <Heart className={clsx("w-8 h-8", isLiked && "fill-current")} />
              </button>
              {currentStatus.likes && currentStatus.likes.length > 0 && (
                <span className="text-white font-bold text-sm drop-shadow-md bg-black/20 px-3 py-1 rounded-full backdrop-blur-sm">
                  {currentStatus.likes.length} إعجاب
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {showCropper && statusImageSrc && (
        <ImageCropperModal
          imageSrc={statusImageSrc}
          onCropComplete={handleCropComplete}
          onCancel={() => {
            setShowCropper(false);
            setStatusImageSrc(null);
          }}
        />
      )}
    </div>
  );
}
