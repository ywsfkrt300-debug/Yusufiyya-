import React, { useEffect, useRef, useState } from 'react';
import { db } from '../firebase';
import { doc, onSnapshot, updateDoc, collection, addDoc, getDoc, setDoc } from 'firebase/firestore';
import { Phone, Video, X, Mic, MicOff, VideoOff, PhoneOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import clsx from 'clsx';
import { UserProfile, Call } from '../types';

interface CallScreenProps {
  localUser: UserProfile;
  remoteUser: UserProfile;
  call: Call;
  onEnd: () => void;
}

const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

const CallScreen: React.FC<CallScreenProps> = ({ localUser, remoteUser, call, onEnd }) => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(call.type === 'audio');
  const [status, setStatus] = useState<Call['status']>(call.status);

  const pc = useRef<RTCPeerConnection>(new RTCPeerConnection(servers));
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const isCaller = localUser.uid === call.callerId;

  useEffect(() => {
    const setupWebRTC = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: call.type === 'video',
        });
        setLocalStream(stream);
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        stream.getTracks().forEach((track) => {
          pc.current.addTrack(track, stream);
        });

        pc.current.ontrack = (event) => {
          setRemoteStream(event.streams[0]);
          if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
        };

        pc.current.onicecandidate = (event) => {
          if (event.candidate) {
            const candidateCollection = isCaller ? 'callerCandidates' : 'receiverCandidates';
            addDoc(collection(db, 'calls', call.id, candidateCollection), event.candidate.toJSON());
          }
        };

        if (isCaller) {
          const offerDescription = await pc.current.createOffer();
          await pc.current.setLocalDescription(offerDescription);

          const offer = {
            sdp: offerDescription.sdp,
            type: offerDescription.type,
          };

          await updateDoc(doc(db, 'calls', call.id), { offer });

          // Listen for answer
          onSnapshot(doc(db, 'calls', call.id), (snapshot) => {
            const data = snapshot.data() as Call;
            if (!pc.current.currentRemoteDescription && data?.answer) {
              const answerDescription = new RTCSessionDescription(data.answer);
              pc.current.setRemoteDescription(answerDescription);
            }
            if (data?.status) setStatus(data.status);
            if (data?.status === 'ended' || data?.status === 'rejected') onEnd();
          });

          // Listen for receiver candidates
          onSnapshot(collection(db, 'calls', call.id, 'receiverCandidates'), (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              if (change.type === 'added') {
                const data = change.doc.data();
                const candidate = new RTCIceCandidate(data);
                pc.current.addIceCandidate(candidate);
              }
            });
          });
        } else {
          // Receiver
          const callDoc = await getDoc(doc(db, 'calls', call.id));
          const data = callDoc.data() as Call;

          if (data?.offer) {
            const offerDescription = new RTCSessionDescription(data.offer);
            await pc.current.setRemoteDescription(offerDescription);

            const answerDescription = await pc.current.createAnswer();
            await pc.current.setLocalDescription(answerDescription);

            const answer = {
              sdp: answerDescription.sdp,
              type: answerDescription.type,
            };

            await updateDoc(doc(db, 'calls', call.id), { answer, status: 'accepted' });
          }

          // Listen for caller candidates
          onSnapshot(collection(db, 'calls', call.id, 'callerCandidates'), (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              if (change.type === 'added') {
                const data = change.doc.data();
                const candidate = new RTCIceCandidate(data);
                pc.current.addIceCandidate(candidate);
              }
            });
          });

          // Listen for call status
          onSnapshot(doc(db, 'calls', call.id), (snapshot) => {
            const data = snapshot.data() as Call;
            if (data?.status) setStatus(data.status);
            if (data?.status === 'ended') onEnd();
          });
        }
      } catch (error) {
        console.error('Error setting up WebRTC:', error);
        onEnd();
      }
    };

    setupWebRTC();

    return () => {
      pc.current.close();
      localStream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const handleEndCall = async () => {
    await updateDoc(doc(db, 'calls', call.id), { status: 'ended' });
    onEnd();
  };

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => (track.enabled = !track.enabled));
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localStream && call.type === 'video') {
      localStream.getVideoTracks().forEach((track) => (track.enabled = !track.enabled));
      setIsVideoOff(!isVideoOff);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center text-white p-4"
    >
      {/* Remote Video (Full Screen) */}
      {call.type === 'video' && (
        <video 
          ref={remoteVideoRef} 
          autoPlay 
          playsInline 
          className="absolute inset-0 w-full h-full object-cover opacity-80"
        />
      )}

      {/* User Info Overlay */}
      <div className="relative z-10 flex flex-col items-center gap-4 mb-12">
        <img 
          src={remoteUser.photoURL} 
          alt={remoteUser.displayName} 
          className={clsx(
            "w-32 h-32 rounded-full object-cover border-4 border-[#25D366] shadow-2xl",
            status === 'ringing' && "animate-pulse"
          )} 
        />
        <h2 className="text-3xl font-bold drop-shadow-lg">{remoteUser.displayName}</h2>
        <p className="text-lg opacity-80 drop-shadow-md">
          {status === 'ringing' ? 'جاري الاتصال...' : status === 'accepted' ? 'مكالمة نشطة' : 'جاري التوصيل...'}
        </p>
      </div>

      {/* Local Video (Small Overlay) */}
      {call.type === 'video' && !isVideoOff && (
        <div className="absolute top-8 right-8 w-32 h-48 bg-gray-900 rounded-xl overflow-hidden border-2 border-white/20 shadow-xl z-20">
          <video 
            ref={localVideoRef} 
            autoPlay 
            playsInline 
            muted 
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Controls */}
      <div className="relative z-10 mt-auto mb-12 flex items-center gap-8">
        <button 
          onClick={toggleMute}
          className={clsx(
            "p-5 rounded-full transition-all shadow-lg",
            isMuted ? "bg-red-500 hover:bg-red-600" : "bg-white/20 hover:bg-white/30 backdrop-blur-md"
          )}
        >
          {isMuted ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
        </button>

        <button 
          onClick={handleEndCall}
          className="p-6 bg-red-600 rounded-full hover:bg-red-700 transition-all shadow-xl transform hover:scale-105"
        >
          <PhoneOff className="w-10 h-10" />
        </button>

        {call.type === 'video' && (
          <button 
            onClick={toggleVideo}
            className={clsx(
              "p-5 rounded-full transition-all shadow-lg",
              isVideoOff ? "bg-red-500 hover:bg-red-600" : "bg-white/20 hover:bg-white/30 backdrop-blur-md"
            )}
          >
            {isVideoOff ? <VideoOff className="w-8 h-8" /> : <Video className="w-8 h-8" />}
          </button>
        )}
      </div>
    </motion.div>
  );
};

export default CallScreen;
