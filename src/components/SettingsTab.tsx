import React, { useState } from 'react';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { Camera, LogOut, User as UserIcon, Check, Edit2, Shield } from 'lucide-react';
import ImageCropperModal from './ImageCropperModal';

interface Props {
  localUser: any;
  setLocalUser: (user: any) => void;
  onLogout: () => void;
}

export default function SettingsTab({ localUser, setLocalUser, onLogout }: Props) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState(localUser.displayName);
  const [isUpdating, setIsUpdating] = useState(false);
  
  // Image Upload State
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [showCropper, setShowCropper] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        setImageSrc(reader.result?.toString() || null);
        setShowCropper(true);
      });
      reader.readAsDataURL(file);
    }
  };

  const handleCropComplete = async (croppedBase64: string) => {
    setShowCropper(false);
    setIsUpdating(true);
    
    try {
      await updateDoc(doc(db, 'users', localUser.uid), {
        photoURL: croppedBase64
      });
      
      const updatedUser = { ...localUser, photoURL: croppedBase64 };
      setLocalUser(updatedUser);
      localStorage.setItem('youssefia_user', JSON.stringify(updatedUser));
    } catch (error) {
      console.error(error);
      alert('حدث خطأ أثناء تحديث الصورة');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdateName = async () => {
    if (!newName.trim() || newName === localUser.displayName) {
      setIsEditingName(false);
      return;
    }

    setIsUpdating(true);
    try {
      await updateDoc(doc(db, 'users', localUser.uid), {
        displayName: newName
      });
      
      const updatedUser = { ...localUser, displayName: newName };
      setLocalUser(updatedUser);
      localStorage.setItem('youssefia_user', JSON.stringify(updatedUser));
      setIsEditingName(false);
    } catch (error) {
      console.error(error);
      alert('حدث خطأ أثناء تحديث الاسم');
    } finally {
      setIsUpdating(false);
    }
  };

  const handlePrivacyChange = async (field: 'lastSeen' | 'status', value: 'everyone' | 'nobody') => {
    setIsUpdating(true);
    try {
      const newPrivacy = {
        ...localUser.privacy,
        [field]: value
      };
      
      await updateDoc(doc(db, 'users', localUser.uid), {
        privacy: newPrivacy
      });
      
      const updatedUser = { ...localUser, privacy: newPrivacy };
      setLocalUser(updatedUser);
      localStorage.setItem('youssefia_user', JSON.stringify(updatedUser));
    } catch (error) {
      console.error(error);
      alert('حدث خطأ أثناء تحديث إعدادات الخصوصية');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#f0f2f5]" dir="rtl">
      <div className="bg-white p-6 shadow-sm flex flex-col items-center">
        <div className="relative mb-6 group">
          <img 
            src={localUser.photoURL} 
            alt="Profile" 
            className="w-32 h-32 rounded-full object-cover border-4 border-white shadow-md" 
          />
          <label className="absolute bottom-0 right-0 bg-[#25D366] text-white p-3 rounded-full shadow-lg cursor-pointer hover:bg-[#128C7E] transition transform hover:scale-110">
            <Camera className="w-5 h-5" />
            <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </label>
        </div>

        <div className="w-full max-w-sm">
          <div className="bg-gray-50 rounded-xl p-4 mb-4 border border-gray-100">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-gray-500 font-semibold flex items-center gap-2">
                <UserIcon className="w-4 h-4" />
                الاسم
              </span>
              {!isEditingName && (
                <button onClick={() => setIsEditingName(true)} className="text-[#25D366] hover:text-[#128C7E]">
                  <Edit2 className="w-4 h-4" />
                </button>
              )}
            </div>
            
            {isEditingName ? (
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#25D366]"
                  autoFocus
                />
                <button 
                  onClick={handleUpdateName}
                  disabled={isUpdating}
                  className="bg-[#25D366] text-white p-2 rounded-lg hover:bg-[#128C7E] disabled:opacity-50"
                >
                  <Check className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <div className="text-lg font-bold text-gray-800">{localUser.displayName}</div>
            )}
            <p className="text-xs text-gray-400 mt-2">هذا ليس اسم المستخدم أو رقم التعريف الشخصي. سيظهر هذا الاسم لجهات اتصالك.</p>
          </div>

          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
            <span className="text-sm text-gray-500 font-semibold mb-1 block">رقم الهاتف</span>
            <div className="text-lg text-gray-800" dir="ltr">{localUser.phoneNumber}</div>
          </div>
        </div>
      </div>

      <div className="p-6 pt-0">
        <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-[#25D366]" />
            <h3 className="font-bold text-gray-800">الخصوصية</h3>
          </div>
          
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b border-gray-100 pb-4">
              <div>
                <div className="font-semibold text-gray-800">آخر ظهور</div>
                <div className="text-xs text-gray-500">من يمكنه رؤية آخر ظهور لي</div>
              </div>
              <select 
                value={localUser.privacy?.lastSeen || 'everyone'}
                onChange={(e) => handlePrivacyChange('lastSeen', e.target.value as any)}
                disabled={isUpdating}
                className="bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-lg focus:ring-[#25D366] focus:border-[#25D366] block p-2"
              >
                <option value="everyone">الكل</option>
                <option value="nobody">لا أحد</option>
              </select>
            </div>
            
            <div className="flex justify-between items-center">
              <div>
                <div className="font-semibold text-gray-800">الحالة</div>
                <div className="text-xs text-gray-500">من يمكنه رؤية حالتي</div>
              </div>
              <select 
                value={localUser.privacy?.status || 'everyone'}
                onChange={(e) => handlePrivacyChange('status', e.target.value as any)}
                disabled={isUpdating}
                className="bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-lg focus:ring-[#25D366] focus:border-[#25D366] block p-2"
              >
                <option value="everyone">الكل</option>
                <option value="nobody">لا أحد</option>
              </select>
            </div>
          </div>
        </div>

        <button 
          onClick={onLogout}
          className="w-full bg-white border border-red-200 text-red-500 font-bold py-4 px-4 rounded-xl shadow-sm hover:bg-red-50 transition flex items-center justify-center gap-2"
        >
          <LogOut className="w-5 h-5" />
          تسجيل الخروج
        </button>
      </div>

      {showCropper && imageSrc && (
        <ImageCropperModal
          imageSrc={imageSrc}
          onCropComplete={handleCropComplete}
          onCancel={() => {
            setShowCropper(false);
            setImageSrc(null);
          }}
        />
      )}
    </div>
  );
}
