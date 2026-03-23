import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, orderBy, updateDoc, doc, arrayUnion } from 'firebase/firestore';
import { Camera, Plus, X, Image as ImageIcon, Type } from 'lucide-react';
import clsx from 'clsx';
import ImageCropperModal from './ImageCropperModal';

interface Props {
  localUser: any;
  users: any[];
}

interface Status {
  id: string;
  userId: string;
  type: 'text' | 'image';
  content: string;
  timestamp: any;
  expiresAt: number;
  viewedBy?: string[];
}

export default function StatusTab({ localUser, users }: Props) {
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [viewingUserStatuses, setViewingUserStatuses] = useState<Status[] | null>(null);
  const [currentStatusIndex, setCurrentStatusIndex] = useState(0);
  const [isAddingStatus, setIsAddingStatus] = useState(false);
  
  // Add Status State
  const [statusType, setStatusType] = useState<'text' | 'image'>('text');
  const [statusText, setStatusText] = useState('');
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
        viewedBy: []
      });
      setIsAddingStatus(false);
      setStatusImageSrc(null);
    } catch (error) {
      console.error(error);
      alert('حدث خطأ أثناء رفع الحالة');
    }
  };

  const handleAddTextStatus = async () => {
    if (!statusText.trim()) return;
    try {
      await addDoc(collection(db, 'statuses'), {
        userId: localUser.uid,
        type: 'text',
        content: statusText,
        timestamp: serverTimestamp(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
        viewedBy: []
      });
      setIsAddingStatus(false);
      setStatusText('');
    } catch (error) {
      console.error(error);
      alert('حدث خطأ أثناء رفع الحالة');
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

  return (
    <div className="flex-1 overflow-y-auto bg-[#f0f2f5] p-4" dir="rtl">
      {/* My Status */}
      <div className="bg-white rounded-xl shadow-sm mb-4 overflow-hidden">
        <div 
          className="p-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50 transition"
          onClick={() => myStatuses.length > 0 ? handleViewStatus(myStatuses) : setIsAddingStatus(true)}
        >
          <div className="relative">
            <img src={localUser.photoURL} alt="My Status" className={clsx("w-14 h-14 rounded-full object-cover", myStatuses.length > 0 && "ring-4 ring-gray-300 p-0.5")} />
            <div className="absolute bottom-0 right-0 bg-[#25D366] text-white rounded-full p-1 border-2 border-white" onClick={(e) => { e.stopPropagation(); setIsAddingStatus(true); }}>
              <Plus className="w-4 h-4" />
            </div>
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-gray-800">حالتي</h3>
            <p className="text-sm text-gray-500">
              {myStatuses.length > 0 ? 'انقر لعرض تحديثاتك' : 'انقر لإضافة حالة جديدة'}
            </p>
          </div>
        </div>
      </div>

      {/* Recent Updates */}
      {otherUsersWithStatuses.length > 0 && (
        <>
          <h4 className="text-gray-500 font-semibold mb-3 px-2">التحديثات الأخيرة</h4>
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            {otherUsersWithStatuses.map(u => {
              const uStatuses = userStatuses[u.uid];
              const allViewed = uStatuses.every(s => s.viewedBy?.includes(localUser.uid));
              
              return (
                <div 
                  key={u.uid}
                  className="p-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50 transition border-b last:border-0 border-gray-100"
                  onClick={() => handleViewStatus(uStatuses)}
                >
                  <img src={u.photoURL} alt={u.displayName} className={clsx("w-14 h-14 rounded-full object-cover ring-4 p-0.5", allViewed ? "ring-gray-300" : "ring-[#25D366]")} />
                  <div className="flex-1">
                    <h3 className="font-bold text-gray-800">{u.displayName}</h3>
                    <p className="text-sm text-gray-500">{uStatuses.length} حالة</p>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Add Status Modal */}
      {isAddingStatus && (
        <div className="fixed inset-0 z-40 bg-black bg-opacity-90 flex flex-col">
          <div className="p-4 flex justify-between items-center text-white">
            <button onClick={() => setIsAddingStatus(false)} className="p-2 hover:bg-white/10 rounded-full">
              <X className="w-6 h-6" />
            </button>
            <h2 className="font-bold">إضافة حالة جديدة</h2>
            <div className="w-10"></div>
          </div>
          
          <div className="flex-1 flex flex-col items-center justify-center p-6">
            {statusType === 'text' ? (
              <div className="w-full max-w-md">
                <textarea
                  value={statusText}
                  onChange={(e) => setStatusText(e.target.value)}
                  placeholder="اكتب حالتك هنا..."
                  className="w-full h-64 bg-transparent text-white text-3xl text-center resize-none focus:outline-none placeholder-white/50"
                  autoFocus
                />
                <button 
                  onClick={handleAddTextStatus}
                  disabled={!statusText.trim()}
                  className="w-full mt-8 bg-[#25D366] text-white font-bold py-4 rounded-full hover:bg-[#128C7E] transition disabled:opacity-50"
                >
                  نشر الحالة
                </button>
              </div>
            ) : (
              <div className="w-full max-w-md flex flex-col items-center gap-6">
                <label className="w-32 h-32 rounded-full bg-white/10 flex items-center justify-center cursor-pointer hover:bg-white/20 transition border-2 border-dashed border-white/30">
                  <Camera className="w-12 h-12 text-white" />
                  <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                </label>
                <p className="text-white text-lg">اختر صورة من هاتفك</p>
              </div>
            )}
          </div>

          <div className="p-6 flex justify-center gap-8 bg-black/50">
            <button 
              onClick={() => setStatusType('text')}
              className={clsx("flex flex-col items-center gap-2 transition", statusType === 'text' ? "text-[#25D366]" : "text-white/50")}
            >
              <Type className="w-8 h-8" />
              <span className="text-sm">نص</span>
            </button>
            <button 
              onClick={() => setStatusType('image')}
              className={clsx("flex flex-col items-center gap-2 transition", statusType === 'image' ? "text-[#25D366]" : "text-white/50")}
            >
              <ImageIcon className="w-8 h-8" />
              <span className="text-sm">صورة</span>
            </button>
          </div>
        </div>
      )}

      {/* View Status Modal */}
      {viewingUserStatuses && viewingUserStatuses[currentStatusIndex] && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col" onClick={handleNextStatus}>
          <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center bg-gradient-to-b from-black/50 to-transparent z-10">
            <div className="flex items-center gap-3">
              <img 
                src={viewingUserStatuses[currentStatusIndex].userId === localUser.uid ? localUser.photoURL : users.find(u => u.uid === viewingUserStatuses[currentStatusIndex].userId)?.photoURL} 
                className="w-10 h-10 rounded-full" 
                alt="User"
              />
              <span className="text-white font-bold drop-shadow-md">
                {viewingUserStatuses[currentStatusIndex].userId === localUser.uid ? 'أنت' : users.find(u => u.uid === viewingUserStatuses[currentStatusIndex].userId)?.displayName}
              </span>
            </div>
            <button onClick={(e) => { e.stopPropagation(); setViewingUserStatuses(null); }} className="p-2 text-white hover:bg-white/10 rounded-full">
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="flex-1 flex items-center justify-center relative">
            {viewingUserStatuses[currentStatusIndex].type === 'image' ? (
              <img src={viewingUserStatuses[currentStatusIndex].content} alt="Status" className="max-w-full max-h-full object-contain" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-500 to-pink-500 p-8">
                <p className="text-white text-4xl text-center font-bold drop-shadow-lg leading-relaxed whitespace-pre-wrap">
                  {viewingUserStatuses[currentStatusIndex].content}
                </p>
              </div>
            )}
          </div>
          
          {/* Progress bars */}
          <div className="absolute top-2 left-2 right-2 flex gap-1 z-20">
            {viewingUserStatuses.map((_, idx) => (
              <div key={idx} className="h-1 flex-1 bg-white/30 rounded-full overflow-hidden">
                <div 
                  className={clsx(
                    "h-full bg-white transition-all",
                    idx < currentStatusIndex ? "w-full" : idx === currentStatusIndex ? "animate-shrink" : "w-0"
                  )} 
                  onAnimationEnd={idx === currentStatusIndex ? handleNextStatus : undefined}
                ></div>
              </div>
            ))}
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
