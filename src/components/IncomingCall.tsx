import React from 'react';
import { Phone, Video, X, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { UserProfile, Call } from '../types';

interface IncomingCallProps {
  caller: UserProfile;
  call: Call;
  onAccept: () => void;
  onReject: () => void;
}

const IncomingCall: React.FC<IncomingCallProps> = ({ caller, call, onAccept, onReject }) => {
  return (
    <motion.div 
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -100, opacity: 0 }}
      className="fixed top-4 left-4 right-4 z-[110] bg-[#075e54] text-white p-4 rounded-2xl shadow-2xl flex items-center gap-4 border border-white/10 backdrop-blur-md"
    >
      <img src={caller?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(caller?.displayName || 'User')}`} alt={caller.displayName} className="w-14 h-14 rounded-full object-cover border-2 border-[#25D366]" />
      <div className="flex-1">
        <h3 className="font-bold text-lg">{caller.displayName}</h3>
        <p className="text-sm opacity-80 flex items-center gap-1.5">
          {call.type === 'video' ? <Video className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
          مكالمة {call.type === 'video' ? 'فيديو' : 'صوتية'} واردة...
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button 
          onClick={onReject}
          className="p-3 bg-red-500 rounded-full hover:bg-red-600 transition-colors shadow-lg"
        >
          <X className="w-6 h-6" />
        </button>
        <button 
          onClick={onAccept}
          className="p-3 bg-[#25D366] rounded-full hover:bg-[#128C7E] transition-colors shadow-lg animate-bounce"
        >
          <Check className="w-6 h-6" />
        </button>
      </div>
    </motion.div>
  );
};

export default IncomingCall;
