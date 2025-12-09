import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { UserRole, FeedbackType, Department, Urgency, Status, FeedbackItem, DepartmentTables } from '../types';
import { saveFeedback } from '../services/storage';
import { suggestDepartment } from '../services/geminiService';
import { ArrowLeft, Send, Sparkles, Loader2, Upload, Database } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface LocationState {
  role: UserRole;
  type: FeedbackType;
}

export const FeedbackForm: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState;

  // Redirect if accessed directly without state
  useEffect(() => {
    if (!state?.role) navigate('/');
  }, [state, navigate]);

  const [formData, setFormData] = useState({
    name: '',
    contact: '',
    department: Department.OTHER, // Default, but we'll try to auto-detect
    message: '',
    urgency: Urgency.NORMAL,
    isAnonymous: false,
    attachmentName: ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [success, setSuccess] = useState(false);

  // Auto-categorize when user stops typing for 1.5s
  useEffect(() => {
    const timer = setTimeout(async () => {
        if (formData.message.length > 20 && formData.department === Department.OTHER) {
            setAiThinking(true);
            const suggested = await suggestDepartment(formData.message);
            if (suggested !== Department.OTHER) {
                setFormData(prev => ({ ...prev, department: suggested }));
            }
            setAiThinking(false);
        }
    }, 1500);
    return () => clearTimeout(timer);
  }, [formData.message, formData.department]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const newItem: FeedbackItem = {
      id: uuidv4(),
      role: state.role,
      type: state.type,
      department: formData.department,
      message: formData.message,
      urgency: formData.urgency,
      status: Status.NEW,
      createdAt: Date.now(),
      isAnonymous: formData.isAnonymous,
      name: formData.isAnonymous ? undefined : formData.name,
      contact: formData.isAnonymous ? undefined : formData.contact,
      attachmentName: formData.attachmentName,
      comments: []
    };

    // Use await here to allow Google Sheet sync and Telegram alerts to complete (or fail gracefully)
    await saveFeedback(newItem);
    
    setIsSubmitting(false);
    setSuccess(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          setFormData({...formData, attachmentName: e.target.files[0].name});
      }
  };

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-fade-in">
        <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6">
          <Send size={40} />
        </div>
        <h2 className="text-3xl font-bold text-slate-900 mb-2">Спасибо!</h2>
        <p className="text-slate-600 mb-2 max-w-md">
          Ваша заявка успешно отправлена.
        </p>
        <p className="text-xs text-slate-400 mb-8 font-mono bg-slate-100 px-3 py-1 rounded">
           Назначение: {DepartmentTables[formData.department]}
        </p>
        <button 
          onClick={() => navigate('/')}
          className="px-6 py-3 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors"
        >
          Вернуться на главную
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <button 
        onClick={() => navigate(-1)}
        className="text-slate-500 hover:text-slate-800 mb-6 text-sm flex items-center gap-1"
      >
        <ArrowLeft size={16} /> Назад
      </button>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
        <div className="flex items-center justify-between mb-8">
            <h1 className="text-2xl font-bold text-slate-900">
                {state?.type} <span className="text-slate-400 text-lg font-normal">от {state?.role}</span>
            </h1>
            <div className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide
                ${state?.type === FeedbackType.COMPLAINT ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                {state?.type}
            </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* Identity Section */}
          <div className="space-y-4 p-4 bg-slate-50 rounded-xl">
             <div className="flex items-center justify-between">
                <h3 className="font-medium text-slate-900">Ваши данные</h3>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600 select-none">
                    <input 
                        type="checkbox" 
                        checked={formData.isAnonymous}
                        onChange={(e) => setFormData({...formData, isAnonymous: e.target.checked})}
                        className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                    />
                    Оставить анонимно
                </label>
             </div>

             {!formData.isAnonymous && (
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                     <div>
                         <label className="block text-sm font-medium text-slate-700 mb-1">Имя</label>
                         <input 
                            required
                            type="text" 
                            value={formData.name}
                            onChange={(e) => setFormData({...formData, name: e.target.value})}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                            placeholder="Иван Петров"
                         />
                     </div>
                     <div>
                         <label className="block text-sm font-medium text-slate-700 mb-1">Email / Телефон</label>
                         <input 
                            type="text" 
                            value={formData.contact}
                            onChange={(e) => setFormData({...formData, contact: e.target.value})}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                            placeholder="+7 900..."
                         />
                     </div>
                 </div>
             )}
          </div>

          {/* Message Section */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Сообщение</label>
            <textarea 
                required
                rows={5}
                value={formData.message}
                onChange={(e) => setFormData({...formData, message: e.target.value})}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                placeholder="Опишите ситуацию подробно..."
            />
          </div>

          {/* Dynamic Category Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
             <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center justify-between">
                    Категория
                    {aiThinking && <span className="text-xs text-blue-600 flex items-center gap-1"><Loader2 size={12} className="animate-spin"/> ИИ определяет...</span>}
                </label>
                <div className="relative">
                    <select 
                        value={formData.department}
                        onChange={(e) => setFormData({...formData, department: e.target.value as Department})}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none appearance-none bg-white"
                    >
                        {Object.values(Department).map(dept => (
                            <option key={dept} value={dept}>{dept}</option>
                        ))}
                    </select>
                    {/* Add visual indicator if Gemini selected this */}
                    {formData.department !== Department.OTHER && !aiThinking && formData.message.length > 0 && (
                        <div className="absolute right-8 top-1/2 -translate-y-1/2 text-blue-500 pointer-events-none" title="Предложено ИИ">
                            <Sparkles size={16} />
                        </div>
                    )}
                </div>
                <div className="mt-2 text-xs text-slate-400 flex items-center gap-1">
                    <Database size={10} /> Таблица: {DepartmentTables[formData.department]}
                </div>
             </div>

             <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Срочность</label>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => setFormData({...formData, urgency: Urgency.NORMAL})}
                        className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${formData.urgency === Urgency.NORMAL ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                        Обычно
                    </button>
                    <button
                        type="button"
                        onClick={() => setFormData({...formData, urgency: Urgency.URGENT})}
                        className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${formData.urgency === Urgency.URGENT ? 'bg-red-50 border-red-200 text-red-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                        Срочно
                    </button>
                </div>
             </div>
          </div>

          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Вложения (опционально)</label>
            <div className="relative border-2 border-dashed border-slate-300 rounded-lg p-4 hover:bg-slate-50 transition-colors text-center cursor-pointer">
                <input type="file" onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                <div className="flex flex-col items-center justify-center text-slate-500">
                    <Upload size={24} className="mb-2" />
                    <span className="text-sm">{formData.attachmentName || "Нажмите, чтобы загрузить фото или файл"}</span>
                </div>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={isSubmitting}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isSubmitting ? <Loader2 className="animate-spin" /> : <Send size={20} />}
            Отправить обращение
          </button>
        </form>
      </div>
    </div>
  );
};