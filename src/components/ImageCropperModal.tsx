import React, { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { getCroppedImg } from '../lib/imageUtils';
import { Check, X } from 'lucide-react';

interface Props {
  imageSrc: string;
  onCropComplete: (croppedBase64: string) => void;
  onCancel: () => void;
}

export default function ImageCropperModal({ imageSrc, onCropComplete, onCancel }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const onCropCompleteHandler = useCallback((croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleSave = async () => {
    if (!croppedAreaPixels) return;
    try {
      setIsProcessing(true);
      const croppedImage = await getCroppedImg(imageSrc, croppedAreaPixels);
      onCropComplete(croppedImage);
    } catch (e) {
      console.error(e);
      alert('حدث خطأ أثناء قص الصورة');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-90 p-4" dir="rtl">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden flex flex-col h-[80vh]">
        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
          <h3 className="font-bold text-lg">قص الصورة</h3>
          <button onClick={onCancel} className="p-2 text-gray-500 hover:bg-gray-200 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="relative flex-1 bg-gray-900">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onCropComplete={onCropCompleteHandler}
            onZoomChange={setZoom}
          />
        </div>

        <div className="p-4 bg-white border-t space-y-4">
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">تكبير</span>
            <input
              type="range"
              value={zoom}
              min={1}
              max={3}
              step={0.1}
              aria-labelledby="Zoom"
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-[#25D366]"
            />
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 py-3 px-4 rounded-xl border border-gray-300 font-bold text-gray-700 hover:bg-gray-50 transition"
            >
              إلغاء
            </button>
            <button
              onClick={handleSave}
              disabled={isProcessing}
              className="flex-1 py-3 px-4 rounded-xl bg-[#25D366] text-white font-bold hover:bg-[#128C7E] transition flex items-center justify-center gap-2"
            >
              {isProcessing ? 'جاري المعالجة...' : (
                <>
                  <Check className="w-5 h-5" />
                  حفظ الصورة
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
