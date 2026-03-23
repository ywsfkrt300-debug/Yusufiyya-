import React, { useState } from 'react';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { Camera, LogOut, User as UserIcon, Check, Edit2, Shield, Moon, Sun, Phone } from 'lucide-react';
import ImageCropperModal from './ImageCropperModal';

interface Props {
  localUser: any;
  setLocalUser: (user: any) => void;
  onLogout: () => void;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
}

export default function SettingsTab({ localUser, setLocalUser, onLogout, theme, setTheme }: Props) {
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

  const handleThemeChange = async (newTheme: 'light' | 'dark') => {
    setIsUpdating(true);
    try {
      await updateDoc(doc(db, 'users', localUser.uid), {
        theme: newTheme
      });
      
      const updatedUser = { ...localUser, theme: newTheme };
      setLocalUser(updatedUser);
      setTheme(newTheme);
      localStorage.setItem('youssefia_user', JSON.stringify(updatedUser));
      
      if (newTheme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    } catch (error) {
      console.error(error);
      alert('حدث خطأ أثناء تحديث المظهر');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#f0f2f5] dark:bg-[#111b21]" dir="rtl">
      <div className="bg-white dark:bg-[#202c33] p-8 shadow-sm flex flex-col items-center border-b border-gray-100 dark:border-gray-800/50 relative overflow-hidden">
        {/* Background decorative elements */}
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-[#25D366]/10 to-transparent"></div>
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-[#25D366]/5 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-[#128C7E]/5 rounded-full blur-3xl"></div>

        <div className="relative mb-8 group z-10">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-tr from-[#25D366] to-[#128C7E] rounded-full blur-md opacity-40 group-hover:opacity-60 transition-opacity duration-300"></div>
            <img 
              src={localUser.photoURL} 
              alt="Profile" 
              className="w-36 h-36 rounded-full object-cover border-4 border-white dark:border-[#202c33] shadow-xl relative z-10 transition-transform duration-300 group-hover:scale-[1.02]" 
            />
          </div>
          <label className="absolute bottom-1 right-1 bg-[#25D366] text-white p-3.5 rounded-full shadow-lg cursor-pointer hover:bg-[#128C7E] transition-all transform hover:scale-110 z-20 border-2 border-white dark:border-[#202c33]">
            <Camera className="w-5 h-5" />
            <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </label>
        </div>

        <div className="w-full max-w-md z-10">
          <div className="bg-gray-50 dark:bg-[#111b21] rounded-2xl p-5 mb-5 border border-gray-100 dark:border-gray-800/50 shadow-sm transition-all hover:shadow-md">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-500 dark:text-gray-400 font-bold flex items-center gap-2">
                <UserIcon className="w-4 h-4 text-[#25D366]" />
                الاسم
              </span>
              {!isEditingName && (
                <button onClick={() => setIsEditingName(true)} className="text-[#25D366] hover:text-[#128C7E] p-1.5 rounded-md hover:bg-[#25D366]/10 transition-colors">
                  <Edit2 className="w-4 h-4" />
                </button>
              )}
            </div>
            
            {isEditingName ? (
              <div className="flex items-center gap-3 mt-3 animate-in fade-in slide-in-from-top-2 duration-200">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="flex-1 bg-white dark:bg-[#2a3942] dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#25D366] focus:border-transparent shadow-sm transition-shadow"
                  autoFocus
                />
                <button 
                  onClick={handleUpdateName}
                  disabled={isUpdating}
                  className="bg-[#25D366] text-white p-2.5 rounded-xl hover:bg-[#128C7E] disabled:opacity-50 shadow-sm hover:shadow-md transition-all transform hover:scale-105"
                >
                  <Check className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <div className="text-xl font-bold text-gray-900 dark:text-white mt-1">{localUser.displayName}</div>
            )}
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-3 font-medium leading-relaxed">هذا ليس اسم المستخدم أو رقم التعريف الشخصي. سيظهر هذا الاسم لجهات اتصالك.</p>
          </div>

          <div className="bg-gray-50 dark:bg-[#111b21] rounded-2xl p-5 border border-gray-100 dark:border-gray-800/50 shadow-sm transition-all hover:shadow-md">
            <span className="text-sm text-gray-500 dark:text-gray-400 font-bold mb-2 flex items-center gap-2">
              <Phone className="w-4 h-4 text-[#25D366]" />
              رقم الهاتف
            </span>
            <div className="text-xl font-medium text-gray-900 dark:text-white mt-1" dir="ltr">{localUser.phoneNumber}</div>
          </div>
        </div>
      </div>

      <div className="p-6 pt-0 mt-6 max-w-2xl mx-auto">
        <div className="bg-white dark:bg-[#202c33] rounded-3xl shadow-sm p-6 mb-6 border border-gray-100 dark:border-gray-800/50 transition-all hover:shadow-md relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#25D366]/5 rounded-full blur-2xl -mr-10 -mt-10"></div>
          
          <div className="flex items-center gap-4 mb-6 relative z-10">
            <div className="bg-gradient-to-br from-[#25D366]/20 to-[#128C7E]/20 p-3 rounded-2xl shadow-inner">
              <Shield className="w-6 h-6 text-[#25D366]" />
            </div>
            <h3 className="font-extrabold text-gray-900 dark:text-gray-100 text-xl tracking-tight">الخصوصية</h3>
          </div>
          
          <div className="space-y-6 relative z-10">
            <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-700/50 pb-6 group">
              <div className="flex-1 pr-4">
                <div className="font-bold text-gray-800 dark:text-gray-200 text-lg group-hover:text-[#25D366] transition-colors">آخر ظهور</div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-1 font-medium">من يمكنه رؤية آخر ظهور لي</div>
              </div>
              <div className="relative">
                <select 
                  value={localUser.privacy?.lastSeen || 'everyone'}
                  onChange={(e) => handlePrivacyChange('lastSeen', e.target.value as any)}
                  disabled={isUpdating}
                  className="appearance-none bg-gray-50 dark:bg-[#2a3942] border-2 border-transparent hover:border-gray-200 dark:hover:border-gray-600 text-gray-800 dark:text-gray-200 text-sm font-bold rounded-xl focus:ring-4 focus:ring-[#25D366]/20 focus:border-[#25D366] block p-3 pr-10 min-w-[120px] outline-none transition-all cursor-pointer shadow-sm"
                >
                  <option value="everyone">الكل</option>
                  <option value="nobody">لا أحد</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-500">
                  <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                </div>
              </div>
            </div>
            
            <div className="flex justify-between items-center group pt-2">
              <div className="flex-1 pr-4">
                <div className="font-bold text-gray-800 dark:text-gray-200 text-lg group-hover:text-[#25D366] transition-colors">الحالة</div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-1 font-medium">من يمكنه رؤية حالتي</div>
              </div>
              <div className="relative">
                <select 
                  value={localUser.privacy?.status || 'everyone'}
                  onChange={(e) => handlePrivacyChange('status', e.target.value as any)}
                  disabled={isUpdating}
                  className="appearance-none bg-gray-50 dark:bg-[#2a3942] border-2 border-transparent hover:border-gray-200 dark:hover:border-gray-600 text-gray-800 dark:text-gray-200 text-sm font-bold rounded-xl focus:ring-4 focus:ring-[#25D366]/20 focus:border-[#25D366] block p-3 pr-10 min-w-[120px] outline-none transition-all cursor-pointer shadow-sm"
                >
                  <option value="everyone">الكل</option>
                  <option value="nobody">لا أحد</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-500">
                  <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#202c33] rounded-3xl shadow-sm p-6 mb-6 border border-gray-100 dark:border-gray-800/50 transition-all hover:shadow-md relative overflow-hidden">
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-[#128C7E]/5 rounded-full blur-2xl -ml-10 -mb-10"></div>
          
          <div className="flex items-center gap-4 mb-6 relative z-10">
            <div className="bg-gradient-to-br from-[#25D366]/20 to-[#128C7E]/20 p-3 rounded-2xl shadow-inner">
              {localUser.theme === 'dark' ? <Moon className="w-6 h-6 text-[#25D366]" /> : <Sun className="w-6 h-6 text-[#25D366]" />}
            </div>
            <h3 className="font-extrabold text-gray-900 dark:text-gray-100 text-xl tracking-tight">المظهر</h3>
          </div>
          
          <div className="space-y-4 relative z-10">
            <div className="flex justify-between items-center group">
              <div className="flex-1 pr-4">
                <div className="font-bold text-gray-800 dark:text-gray-200 text-lg group-hover:text-[#25D366] transition-colors">الوضع</div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-1 font-medium">اختر مظهر التطبيق</div>
              </div>
              <div className="relative">
                <select 
                  value={localUser.theme || 'light'}
                  onChange={(e) => handleThemeChange(e.target.value as 'light' | 'dark')}
                  disabled={isUpdating}
                  className="appearance-none bg-gray-50 dark:bg-[#2a3942] border-2 border-transparent hover:border-gray-200 dark:hover:border-gray-600 text-gray-800 dark:text-gray-200 text-sm font-bold rounded-xl focus:ring-4 focus:ring-[#25D366]/20 focus:border-[#25D366] block p-3 pr-10 min-w-[120px] outline-none transition-all cursor-pointer shadow-sm"
                >
                  <option value="light">فاتح</option>
                  <option value="dark">داكن</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-500">
                  <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                </div>
              </div>
            </div>
          </div>
        </div>

        <button 
          onClick={onLogout}
          className="w-full bg-white dark:bg-[#202c33] border-2 border-red-100 dark:border-red-900/30 text-red-500 font-bold py-4 px-4 rounded-2xl shadow-sm hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-200 dark:hover:border-red-900/50 transition-all transform hover:-translate-y-0.5 flex items-center justify-center gap-3 text-lg"
        >
          <LogOut className="w-6 h-6" />
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
