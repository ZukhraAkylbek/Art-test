import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserRole, FeedbackType } from '../types';
import { User, Briefcase, Truck, AlertTriangle, Lightbulb, QrCode } from 'lucide-react';

export const Home: React.FC = () => {
  const navigate = useNavigate();
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);

  const handleStart = (role: UserRole) => {
    setSelectedRole(role);
  };

  const handleTypeSelect = (type: FeedbackType) => {
    if (selectedRole) {
      navigate('/form', { state: { role: selectedRole, type } });
    }
  };

  if (selectedRole) {
    return (
      <div className="max-w-lg mx-auto py-10">
        <button 
          onClick={() => setSelectedRole(null)}
          className="text-slate-500 hover:text-slate-800 mb-6 text-sm flex items-center gap-1"
        >
          ← Назад
        </button>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Что вы хотите отправить?</h2>
        <p className="text-slate-500 mb-8">Вы вошли как: <span className="font-semibold text-blue-600">{selectedRole}</span></p>
        
        <div className="grid gap-4">
          <button
            onClick={() => handleTypeSelect(FeedbackType.COMPLAINT)}
            className="group relative p-6 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-red-400 hover:shadow-md transition-all text-left"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center text-red-500 group-hover:scale-110 transition-transform">
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 text-lg">Сообщить о проблеме</h3>
                <p className="text-slate-500 text-sm">Жалоба на условия, качество или инцидент</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => handleTypeSelect(FeedbackType.PROPOSAL)}
            className="group relative p-6 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-green-400 hover:shadow-md transition-all text-left"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center text-green-600 group-hover:scale-110 transition-transform">
                <Lightbulb size={24} />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 text-lg">Предложить идею</h3>
                <p className="text-slate-500 text-sm">Предложение по улучшению процессов</p>
              </div>
            </div>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] text-center">
      <div className="mb-8 p-4 bg-white rounded-2xl shadow-lg border border-slate-100">
         <QrCode size={120} className="text-slate-800" />
         <p className="mt-2 text-xs text-slate-400 font-mono">СКАНИРУЙТЕ ДЛЯ НАЧАЛА</p>
      </div>

      <h1 className="text-4xl font-extrabold text-slate-900 mb-4 tracking-tight">
        Artwin <span className="text-blue-600">Обратная связь</span>
      </h1>
      <p className="text-lg text-slate-600 max-w-md mb-10">
        Мы ценим ваше мнение. Пожалуйста, выберите вашу роль, чтобы начать.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl px-4">
        <RoleCard 
          icon={<User size={32} />} 
          label="Сотрудник" 
          onClick={() => handleStart(UserRole.EMPLOYEE)} 
        />
        <RoleCard 
          icon={<Briefcase size={32} />} 
          label="Клиент" 
          onClick={() => handleStart(UserRole.CLIENT)} 
        />
        <RoleCard 
          icon={<Truck size={32} />} 
          label="Подрядчик" 
          onClick={() => handleStart(UserRole.CONTRACTOR)} 
        />
      </div>
    </div>
  );
};

const RoleCard: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void }> = ({ icon, label, onClick }) => (
  <button 
    onClick={onClick}
    className="flex flex-col items-center justify-center p-6 bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-lg hover:border-blue-300 hover:-translate-y-1 transition-all duration-200"
  >
    <div className="text-slate-600 mb-3">{icon}</div>
    <span className="font-semibold text-slate-900">{label}</span>
  </button>
);