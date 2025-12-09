import React, { useState, useEffect, useRef } from 'react';
import { Department, FeedbackItem, DepartmentTables, Status, Comment, TelegramConfig } from '../types';
import { getFeedbackByDepartment, updateFeedbackStatus, addComment, saveSheetConfig, getSheetConfig, removeSheetConfig, SheetConfig, saveTelegramConfig, getTelegramConfig, fetchFromGoogleSheet, downloadBackup } from '../services/storage';
import { analyzeFeedback, draftResponse, generateManagementReport } from '../services/geminiService';
import { sendManagementReport } from '../services/telegramService';
import { 
    RefreshCw, MessageSquare, AlertCircle, CheckCircle, 
    Sparkles, BrainCircuit, X, Loader2, Database, Send, Lock, LogOut, ShieldCheck, Link as LinkIcon, Settings, ExternalLink, Key,
    FileSpreadsheet, MessageCircle, FileText, Share, HardDrive, Cloud, Server, Download
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

export const AdminDashboard: React.FC = () => {
  // Authentication State
  const [loggedInDept, setLoggedInDept] = useState<Department | null>(null);

  // Dashboard Data State
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<FeedbackItem | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Integrations State
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [activeConfigTab, setActiveConfigTab] = useState<'SHEETS' | 'TELEGRAM' | 'SYSTEM'>('SHEETS');
  
  // Report State
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportContent, setReportContent] = useState('');
  
  // Sheet Config
  const [sheetConfig, setSheetConfigState] = useState<SheetConfig | null>(null);
  const [tempSheetId, setTempSheetId] = useState('');
  const [tempTabName, setTempTabName] = useState('');
  const [tempAccessToken, setTempAccessToken] = useState('');
  
  // Telegram Config
  const [telegramConfig, setTelegramConfigState] = useState<TelegramConfig | null>(null);
  const [tempBotToken, setTempBotToken] = useState('');
  const [tempChatId, setTempChatId] = useState('');

  // AI States
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [draftingId, setDraftingId] = useState<string | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [sendingReport, setSendingReport] = useState(false);
  const [draftResult, setDraftResult] = useState<string>('');
  
  // UI States
  const [filterStatus, setFilterStatus] = useState<Status | 'ALL'>('ALL');
  const [newComment, setNewComment] = useState('');
  const commentsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (loggedInDept) {
        // Load configurations
        const shConfig = getSheetConfig(loggedInDept);
        setSheetConfigState(shConfig);
        if (shConfig) {
            setTempSheetId(shConfig.sheetId);
            setTempTabName(shConfig.tabName);
            setTempAccessToken(shConfig.accessToken || '');
        } else {
            setTempSheetId('');
            setTempTabName(DepartmentTables[loggedInDept]);
            setTempAccessToken('');
        }
        
        const tgConfig = getTelegramConfig();
        setTelegramConfigState(tgConfig);
        if (tgConfig) {
            setTempBotToken(tgConfig.botToken);
            setTempChatId(tgConfig.chatId);
        }

        loadItems(shConfig); // Initial Load
    }
  }, [loggedInDept]);

  useEffect(() => {
    if (commentsEndRef.current) {
        commentsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [selectedItem?.comments]);

  const loadItems = async (configOverride?: SheetConfig | null) => {
    if (!loggedInDept) return;
    setLoading(true);
    
    const config = configOverride !== undefined ? configOverride : sheetConfig;

    // If connected to Google Sheets, try to fetch fresh data
    if (config && config.accessToken && config.sheetId) {
        try {
            const sheetItems = await fetchFromGoogleSheet(loggedInDept, config);
            if (sheetItems.length > 0) {
                setItems(sheetItems);
                setLoading(false);
                return;
            }
        } catch (e) {
            console.error("Failed to fetch from sheet, falling back to local", e);
        }
    }

    // Fallback to local storage
    setTimeout(() => {
        const data = getFeedbackByDepartment(loggedInDept);
        setItems(data);
        setLoading(false);
    }, 300);
  };

  const handleStatusChange = (id: string, newStatus: Status) => {
    if (!loggedInDept) return;
    updateFeedbackStatus(id, loggedInDept, newStatus);
    loadItems(); // Reload to reflect local changes (sync back to sheet not implemented in this direction for status updates unless using complex row logic)
    if (selectedItem?.id === id) {
        setSelectedItem(prev => prev ? {...prev, status: newStatus} : null);
    }
  };

  const handleAddComment = () => {
      if (!selectedItem || !newComment.trim() || !loggedInDept) return;
      
      const comment: Comment = {
          id: uuidv4(),
          author: `${loggedInDept} Админ`, 
          text: newComment,
          timestamp: Date.now()
      };

      addComment(selectedItem.id, loggedInDept, comment);
      setNewComment('');
      
      const updatedItem = { ...selectedItem, comments: [...(selectedItem.comments || []), comment] };
      setSelectedItem(updatedItem);
      setItems(prev => prev.map(i => i.id === selectedItem.id ? updatedItem : i));
  };

  const handleAIAnalyze = async (item: FeedbackItem) => {
      if (!loggedInDept) return;
      setAnalyzingId(item.id);
      const analysis = await analyzeFeedback(item.message, item.urgency);
      
      const updatedItem = { ...item, aiAnalysis: analysis };
      
      const sysComment: Comment = {
          id: uuidv4(),
          author: 'Gemini AI',
          text: `[АНАЛИЗ ЗАВЕРШЕН]\nТональность: ${analysis.sentiment}\nДействие: ${analysis.suggestedAction}`,
          timestamp: Date.now()
      };
      addComment(item.id, loggedInDept, sysComment);
      
      setItems(prev => prev.map(i => i.id === item.id ? updatedItem : i));
      if (selectedItem?.id === item.id) setSelectedItem(updatedItem);
      
      setAnalyzingId(null);
  };

  const handleGenerateReport = async () => {
      if (!loggedInDept) return;
      setGeneratingReport(true);
      const reportText = await generateManagementReport(items, loggedInDept);
      setReportContent(reportText);
      setGeneratingReport(false);
      setShowReportModal(true);
  }

  const handleSendReport = async () => {
      if (!loggedInDept || !telegramConfig) {
          alert("Пожалуйста, сначала настройте Telegram для отправки отчета.");
          setShowReportModal(false);
          setShowConfigModal(true);
          setActiveConfigTab('TELEGRAM');
          return;
      }
      setSendingReport(true);
      await sendManagementReport(reportContent, loggedInDept, telegramConfig);
      setSendingReport(false);
      setShowReportModal(false);
      alert("Отчет успешно отправлен в Telegram!");
  }

  const handleDraftResponse = async (item: FeedbackItem) => {
      setDraftingId(item.id);
      const text = await draftResponse(item);
      setDraftResult(text);
      setDraftingId(null);
  };
  
  // --- CONFIG HANDLERS ---

  const handleSheetIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      const match = val.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (match && match[1]) {
          setTempSheetId(match[1]);
      } else {
          setTempSheetId(val);
      }
  };

  const handleSaveSheetConfig = () => {
      if (!loggedInDept) return;
      if (!tempSheetId.trim()) {
          alert("Пожалуйста, введите ID таблицы");
          return;
      }
      const newConfig: SheetConfig = { 
          sheetId: tempSheetId, 
          tabName: tempTabName || DepartmentTables[loggedInDept],
          accessToken: tempAccessToken
      };
      saveSheetConfig(loggedInDept, newConfig);
      setSheetConfigState(newConfig);
      
      alert(tempAccessToken ? "Подключено (Запись разрешена)" : "Подключено (Только чтение)");
      loadItems(newConfig);
  };

  const handleSaveTelegramConfig = () => {
      if (!tempBotToken.trim() || !tempChatId.trim()) {
          alert("Пожалуйста, введите Bot Token и Chat ID");
          return;
      }
      const newConfig: TelegramConfig = {
          botToken: tempBotToken,
          chatId: tempChatId
      };
      saveTelegramConfig(newConfig);
      setTelegramConfigState(newConfig);
      alert("Telegram настроен! Уведомления будут приходить.");
  };

  const handleDisconnectSheet = () => {
      if (!loggedInDept) return;
      removeSheetConfig(loggedInDept);
      setSheetConfigState(null);
      setTempSheetId('');
      setTempAccessToken('');
  };

  const filteredItems = items.filter(i => filterStatus === 'ALL' || i.status === filterStatus);

  // ----------------------------------------------------------------------
  // LOGIN SCREEN
  // ----------------------------------------------------------------------
  if (!loggedInDept) {
      return (
          <div className="min-h-[calc(100vh-100px)] flex flex-col items-center justify-center bg-slate-50 p-4 animate-in fade-in duration-500">
              <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-200 max-w-2xl w-full text-center">
                  <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white mx-auto mb-6 shadow-lg shadow-blue-200">
                      <Lock size={32} />
                  </div>
                  <h2 className="text-3xl font-bold text-slate-900 mb-2">Вход в систему</h2>
                  <p className="text-slate-500 mb-8">Выберите ваш департамент для доступа к таблице обратной связи.</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {Object.values(Department).map(dept => (
                          <button
                              key={dept}
                              onClick={() => setLoggedInDept(dept)}
                              className="flex flex-col items-center justify-center p-6 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50/50 hover:shadow-md transition-all group bg-white"
                          >
                              <div className="font-bold text-slate-800 text-lg mb-1 group-hover:text-blue-700">{dept}</div>
                              <div className="text-[10px] text-slate-400 font-mono bg-slate-100 px-2 py-1 rounded">
                                  {DepartmentTables[dept]}
                              </div>
                          </button>
                      ))}
                  </div>
                  <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-center gap-2 text-xs text-slate-400">
                      <ShieldCheck size={14} /> Локальное защищенное хранилище
                  </div>
              </div>
          </div>
      );
  }

  // ----------------------------------------------------------------------
  // MAIN DASHBOARD
  // ----------------------------------------------------------------------
  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-100px)] gap-6 animate-in slide-in-from-bottom-4 duration-500 relative">
      
      {/* Sidebar: Access Info */}
      <div className="w-full lg:w-64 flex flex-col gap-4 shrink-0">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Уровень доступа</div>
            <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                    {loggedInDept.charAt(0)}
                </div>
                <div>
                    <div className="font-bold text-slate-800">{loggedInDept} Менеджер</div>
                    <div className="text-xs text-green-600 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span> Онлайн
                    </div>
                </div>
            </div>
            
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Интеграции</div>
            
            {/* Sheet Status */}
            <div className="mb-2 p-2 rounded bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs">
                    <FileSpreadsheet size={14} className="text-green-600"/>
                    <span className={sheetConfig ? "font-medium text-slate-700" : "text-slate-400"}>
                        {sheetConfig ? "Подключено" : "Нет таблицы"}
                    </span>
                </div>
                {sheetConfig && <div className="w-2 h-2 rounded-full bg-green-500"></div>}
            </div>

            {/* Telegram Status */}
            <div className="mb-4 p-2 rounded bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs">
                    <MessageCircle size={14} className="text-blue-500"/>
                    <span className={telegramConfig ? "font-medium text-slate-700" : "text-slate-400"}>
                        {telegramConfig ? "Бот активен" : "Нет бота"}
                    </span>
                </div>
                {telegramConfig && <div className="w-2 h-2 rounded-full bg-blue-500"></div>}
            </div>

            <button 
                onClick={() => setShowConfigModal(true)}
                className="w-full py-2 px-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 shadow-sm text-xs font-bold rounded flex items-center justify-center gap-2 transition-all"
            >
                <Settings size={12} /> Система и настройки
            </button>

            <button 
                onClick={() => { setLoggedInDept(null); setSelectedItem(null); }}
                className="w-full py-2 flex items-center justify-center gap-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors mt-2"
            >
                <LogOut size={16} /> Отключиться
            </button>
        </div>
        
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-4 rounded-xl text-white shadow-lg mt-auto">
            <h3 className="font-semibold text-sm flex items-center gap-2 mb-2">
                <Sparkles size={14} className="text-yellow-400" /> AI Менеджер
            </h3>
            <p className="text-xs text-slate-300 opacity-80 leading-relaxed mb-3">
                Создать стратегический отчет на основе текущих трендов обратной связи.
            </p>
            <button 
                onClick={handleGenerateReport}
                disabled={generatingReport}
                className="w-full py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors"
            >
                {generatingReport ? <Loader2 size={12} className="animate-spin"/> : <FileText size={12}/>}
                Создать отчет
            </button>
        </div>
      </div>

      {/* Main List Area */}
      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div>
                <h2 className="font-bold text-lg text-slate-800">Входящие {loggedInDept}</h2>
                <div className="text-xs text-slate-500">
                    {sheetConfig ? "Синхронизировано с Google Sheet" : "Только локальные данные"} • {filteredItems.length} записей
                </div>
            </div>
            
            <div className="flex items-center gap-2">
                <select 
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value as any)}
                    className="text-sm border-slate-300 rounded-lg focus:ring-blue-500 py-1.5"
                >
                    <option value="ALL">Все статусы</option>
                    {Object.values(Status).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <button onClick={() => loadItems()} className="p-2 text-slate-500 hover:bg-white rounded-lg hover:shadow-sm transition-all border border-transparent hover:border-slate-200" title="Обновить / Синхронизировать">
                    <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
                </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
             {filteredItems.length === 0 ? (
                 <div className="flex flex-col items-center justify-center h-full text-slate-400">
                     <div className="bg-slate-50 p-6 rounded-full mb-4">
                        <Database size={32} className="opacity-40" />
                     </div>
                     <p className="font-medium">Обращений не найдено</p>
                     <p className="text-xs mt-1">Ожидание новых заявок...</p>
                 </div>
             ) : (
                 filteredItems.map(item => (
                     <div 
                        key={item.id}
                        onClick={() => { setSelectedItem(item); setDraftResult(''); }}
                        className={`p-4 rounded-xl border cursor-pointer transition-all hover:shadow-md ${
                            selectedItem?.id === item.id 
                            ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-500' 
                            : 'border-slate-200 bg-white hover:border-blue-300'
                        }`}
                     >
                        <div className="flex justify-between items-start mb-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                item.type === 'Жалоба' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                            }`}>
                                {item.type}
                            </span>
                            <span className="text-xs text-slate-400 font-mono">
                                {new Date(item.createdAt).toLocaleDateString('ru-RU')}
                            </span>
                        </div>
                        <p className="font-medium text-slate-800 line-clamp-2 mb-3 text-sm">{item.message}</p>
                        <div className="flex items-center gap-4 text-xs text-slate-500">
                            <span className="flex items-center gap-1.5">
                                <AlertCircle size={14} className={item.urgency === 'Срочно' ? "text-red-500" : "text-slate-400"} />
                                {item.urgency}
                            </span>
                            <span className={`flex items-center gap-1.5 ${
                                item.status === Status.RESOLVED ? 'text-green-600 font-medium' : 
                                item.status === Status.NEW ? 'text-blue-600 font-medium' : 'text-orange-600 font-medium'
                            }`}>
                                <CheckCircle size={14} />
                                {item.status}
                            </span>
                            {item.comments?.length > 0 && (
                                <span className="flex items-center gap-1 text-slate-400 ml-auto">
                                    <MessageSquare size={14} /> {item.comments.length}
                                </span>
                            )}
                        </div>
                     </div>
                 ))
             )}
          </div>
      </div>

      {/* REPORT MODAL */}
      {showReportModal && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl border border-slate-200 m-4 flex flex-col max-h-[85vh]">
                  <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center">
                            <BrainCircuit size={18} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">Стратегический отчет</h3>
                            <p className="text-xs text-slate-500">Сгенерировано Gemini 3.0 Pro</p>
                        </div>
                      </div>
                      <button onClick={() => setShowReportModal(false)} className="p-1 hover:bg-slate-200 rounded-full"><X size={20}/></button>
                  </div>
                  
                  <div className="p-6 overflow-y-auto bg-white font-serif text-slate-800 leading-relaxed whitespace-pre-wrap">
                      {reportContent}
                  </div>

                  <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 rounded-b-2xl">
                      <button 
                        onClick={() => setShowReportModal(false)} 
                        className="px-4 py-2 text-slate-500 hover:text-slate-800 font-medium text-sm"
                      >
                          Закрыть
                      </button>
                      <button 
                        onClick={handleSendReport}
                        disabled={sendingReport}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-md text-sm font-bold flex items-center gap-2 transition-all"
                      >
                          {sendingReport ? <Loader2 size={16} className="animate-spin"/> : <Share size={16}/>}
                          Отправить в Telegram
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Integrations Modal */}
      {showConfigModal && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 m-4 flex flex-col max-h-[90vh]">
                  <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                      <h3 className="text-lg font-bold text-slate-800">Система и интеграции</h3>
                      <button onClick={() => setShowConfigModal(false)} className="p-1 hover:bg-slate-100 rounded-full"><X size={20}/></button>
                  </div>
                  
                  <div className="flex border-b border-slate-100">
                      <button 
                        onClick={() => setActiveConfigTab('SHEETS')}
                        className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${activeConfigTab === 'SHEETS' ? 'border-green-500 text-green-700 bg-green-50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                      >
                          <div className="flex items-center justify-center gap-2">
                             <FileSpreadsheet size={16}/> Таблицы
                          </div>
                      </button>
                      <button 
                        onClick={() => setActiveConfigTab('TELEGRAM')}
                        className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${activeConfigTab === 'TELEGRAM' ? 'border-blue-500 text-blue-700 bg-blue-50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                      >
                          <div className="flex items-center justify-center gap-2">
                             <MessageCircle size={16}/> Телеграм
                          </div>
                      </button>
                      <button 
                        onClick={() => setActiveConfigTab('SYSTEM')}
                        className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${activeConfigTab === 'SYSTEM' ? 'border-indigo-500 text-indigo-700 bg-indigo-50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                      >
                          <div className="flex items-center justify-center gap-2">
                             <HardDrive size={16}/> Система
                          </div>
                      </button>
                  </div>

                  <div className="p-6 overflow-y-auto">
                      {activeConfigTab === 'SHEETS' && (
                          <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-200">
                              <p className="text-sm text-slate-500 mb-4">Подключите Google Таблицу для хранения и редактирования данных отдела <b>{loggedInDept}</b>.</p>
                              <div>
                                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">ID Таблицы</label>
                                  <input 
                                      type="text" 
                                      value={tempSheetId}
                                      onChange={handleSheetIdChange}
                                      placeholder="Вставьте ID или ссылку..."
                                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                                  />
                              </div>
                              <div>
                                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Имя листа (Tab Name)</label>
                                  <input 
                                      type="text" 
                                      value={tempTabName}
                                      onChange={(e) => setTempTabName(e.target.value)}
                                      placeholder={DepartmentTables[loggedInDept]}
                                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                                  />
                              </div>
                              <div>
                                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
                                     <Key size={10} /> Токен доступа (Access Token)
                                  </label>
                                  <input 
                                      type="password" 
                                      value={tempAccessToken}
                                      onChange={(e) => setTempAccessToken(e.target.value)}
                                      placeholder="OAuth Access Token"
                                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none font-mono"
                                  />
                              </div>
                              <div className="flex gap-3 pt-4">
                                  {sheetConfig && (
                                      <button onClick={handleDisconnectSheet} className="px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 text-sm">Откл.</button>
                                  )}
                                  <button onClick={handleSaveSheetConfig} className="flex-1 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-bold">Сохранить настройки</button>
                              </div>
                          </div>
                      )}

                      {activeConfigTab === 'TELEGRAM' && (
                          <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-200">
                              <p className="text-sm text-slate-500 mb-4">Настройте бота для получения уведомлений и отчетов.</p>
                              <div>
                                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Bot Token</label>
                                  <input 
                                      type="password" 
                                      value={tempBotToken}
                                      onChange={(e) => setTempBotToken(e.target.value)}
                                      placeholder="123456:ABC-DEF1234..."
                                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                                  />
                                  <p className="text-[10px] text-slate-400 mt-1">От @BotFather</p>
                              </div>
                              <div>
                                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Chat ID</label>
                                  <input 
                                      type="text" 
                                      value={tempChatId}
                                      onChange={(e) => setTempChatId(e.target.value)}
                                      placeholder="123456789"
                                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                                  />
                                  <p className="text-[10px] text-slate-400 mt-1">От @userinfobot</p>
                              </div>
                              <div className="pt-4">
                                  <button onClick={handleSaveTelegramConfig} className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-bold">Сохранить настройки Telegram</button>
                              </div>
                          </div>
                      )}

                      {activeConfigTab === 'SYSTEM' && (
                          <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-200">
                              
                              {/* Storage Status */}
                              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                                  <h4 className="font-bold text-sm text-slate-800 mb-3 flex items-center gap-2">
                                      <Server size={16} /> Статус хранилища
                                  </h4>
                                  <div className="space-y-2 text-sm">
                                      <div className="flex items-center justify-between">
                                          <span className="text-slate-600">Локальное хранилище:</span>
                                          <span className="text-green-600 font-bold flex items-center gap-1"><CheckCircle size={12}/> Активно</span>
                                      </div>
                                      <div className="flex items-center justify-between">
                                          <span className="text-slate-600">Google Таблицы:</span>
                                          {sheetConfig ? (
                                              <span className="text-green-600 font-bold flex items-center gap-1"><CheckCircle size={12}/> Подключено</span>
                                          ) : (
                                              <span className="text-amber-500 font-bold flex items-center gap-1"><AlertCircle size={12}/> Отключено</span>
                                          )}
                                      </div>
                                  </div>
                              </div>

                              {/* Backup */}
                              <div>
                                  <h4 className="font-bold text-sm text-slate-800 mb-2 flex items-center gap-2">
                                      <HardDrive size={16} /> Резервная копия
                                  </h4>
                                  <p className="text-xs text-slate-500 mb-3">
                                      Скачать полную копию данных всех департаментов в формате CSV (для Excel).
                                  </p>
                                  <button 
                                    onClick={downloadBackup}
                                    className="w-full py-2.5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 rounded-lg font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-all"
                                  >
                                      <Download size={16} /> Скачать бэкап (.csv)
                                  </button>
                              </div>

                              {/* Deployment Guide */}
                              <div>
                                  <h4 className="font-bold text-sm text-slate-800 mb-2 flex items-center gap-2">
                                      <Cloud size={16} /> Инструкция по деплою
                                  </h4>
                                  <div className="text-xs text-slate-600 space-y-2 bg-blue-50/50 p-3 rounded-lg border border-blue-100">
                                      <p>Это <b>статическое веб-приложение (Serverless)</b>.</p>
                                      <ol className="list-decimal pl-4 space-y-1">
                                          <li>Выполните <code>npm run build</code> в терминале.</li>
                                          <li>Возьмите созданную папку <code>dist</code>.</li>
                                          <li>Загрузите её на любой хостинг: <b>Netlify, Vercel или GitHub Pages</b>.</li>
                                          <li>"Бэкенд" - это Google API и Telegram API, поддержка серверов не требуется!</li>
                                      </ol>
                                  </div>
                              </div>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* Detail View Panel */}
      {selectedItem && (
          <div className="w-full lg:w-[400px] bg-white rounded-2xl shadow-xl border border-slate-200 flex flex-col overflow-hidden animate-in slide-in-from-right duration-300 absolute lg:static right-0 top-0 h-full z-20">
              <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                  <h3 className="font-bold text-slate-800">Просмотр заявки</h3>
                  <button onClick={() => setSelectedItem(null)} className="lg:hidden p-1 bg-white rounded-full shadow"><X size={16}/></button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 scrollbar-thin">
                  {/* Status & Controls */}
                  <div className="mb-6 bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <label className="text-xs font-bold text-slate-400 uppercase block mb-2">Статус</label>
                      <select 
                        value={selectedItem.status}
                        onChange={(e) => handleStatusChange(selectedItem.id, e.target.value as Status)}
                        className="w-full p-2 rounded-lg border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                      >
                          {Object.values(Status).map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                  </div>

                  {/* Message Content */}
                  <div className="mb-6">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-xs">
                            {selectedItem.isAnonymous ? '?' : selectedItem.name?.charAt(0)}
                        </div>
                        <div>
                            <div className="font-bold text-sm text-slate-900">{selectedItem.isAnonymous ? 'Анонимно' : selectedItem.name}</div>
                            <div className="text-xs text-slate-500">{selectedItem.role} {selectedItem.contact && `• ${selectedItem.contact}`}</div>
                        </div>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-sm text-slate-700 leading-relaxed">
                          {selectedItem.message}
                      </div>
                  </div>

                  {/* AI Analysis Card */}
                  <div className="mb-6 p-4 rounded-xl bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 relative overflow-hidden group">
                      <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity"><BrainCircuit size={80}/></div>
                      <div className="relative z-10">
                          <div className="flex justify-between items-center mb-3">
                              <h4 className="font-bold text-indigo-900 text-sm flex items-center gap-2">
                                  <Sparkles size={14} /> Анализ Gemini
                              </h4>
                              {analyzingId === selectedItem.id ? (
                                  <Loader2 size={16} className="animate-spin text-indigo-600" />
                              ) : (
                                  <button onClick={() => handleAIAnalyze(selectedItem)} className="text-xs bg-white/80 hover:bg-white px-2 py-1 rounded text-indigo-700 font-medium transition-colors shadow-sm">
                                      Анализировать
                                  </button>
                              )}
                          </div>
                          
                          {selectedItem.aiAnalysis ? (
                              <div className="space-y-3 text-xs">
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="bg-white/60 p-2 rounded">
                                        <span className="block text-indigo-400 text-[10px] uppercase font-bold">Тональность</span>
                                        <span className={`font-semibold capitalize ${
                                            selectedItem.aiAnalysis.sentiment === 'negative' ? 'text-red-600' : 
                                            selectedItem.aiAnalysis.sentiment === 'positive' ? 'text-green-600' : 'text-slate-600'
                                        }`}>{selectedItem.aiAnalysis.sentiment}</span>
                                    </div>
                                    <div className="bg-white/60 p-2 rounded">
                                        <span className="block text-indigo-400 text-[10px] uppercase font-bold">Срочность</span>
                                        <div className="flex items-center gap-2 mt-1">
                                            <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                                <div className="h-full bg-indigo-500" style={{width: `${selectedItem.aiAnalysis.urgencyScore * 10}%`}} />
                                            </div>
                                            <span className="font-mono font-bold">{selectedItem.aiAnalysis.urgencyScore}</span>
                                        </div>
                                    </div>
                                  </div>
                                  <div className="pt-2 border-t border-indigo-100/50">
                                      <p className="text-slate-700 leading-relaxed">{selectedItem.aiAnalysis.summary}</p>
                                  </div>
                                  <div className="bg-white/50 p-2 rounded border border-indigo-100/50">
                                      <span className="text-indigo-800 font-bold mr-1">Предложение:</span>
                                      <span className="text-slate-600">{selectedItem.aiAnalysis.suggestedAction}</span>
                                  </div>
                              </div>
                          ) : (
                              <p className="text-xs text-indigo-400 italic">Нажмите анализировать, чтобы получить план действий.</p>
                          )}
                      </div>
                  </div>

                  {/* Comments Section */}
                  <div className="mb-6">
                      <h4 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2">
                          <MessageSquare size={16} className="text-slate-400"/> Обсуждение
                      </h4>
                      <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 min-h-[100px] max-h-[200px] overflow-y-auto mb-3 space-y-3 scrollbar-thin">
                          {(!selectedItem.comments || selectedItem.comments.length === 0) && (
                              <div className="text-center text-xs text-slate-400 py-4">Комментариев нет.</div>
                          )}
                          {selectedItem.comments?.map(comment => (
                              <div key={comment.id} className={`text-sm p-3 rounded-lg ${comment.author === 'Gemini AI' ? 'bg-indigo-50 border border-indigo-100' : 'bg-white border border-slate-200 shadow-sm'}`}>
                                  <div className="flex justify-between items-center mb-1">
                                      <span className={`font-bold text-xs ${comment.author === 'Gemini AI' ? 'text-indigo-700 flex items-center gap-1' : 'text-slate-700'}`}>
                                          {comment.author === 'Gemini AI' && <Sparkles size={10}/>}
                                          {comment.author}
                                      </span>
                                      <span className="text-[10px] text-slate-400">{new Date(comment.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                  </div>
                                  <p className="text-slate-600 whitespace-pre-wrap">{comment.text}</p>
                              </div>
                          ))}
                          <div ref={commentsEndRef} />
                      </div>
                      <div className="flex gap-2">
                          <input 
                              type="text" 
                              value={newComment}
                              onChange={e => setNewComment(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && handleAddComment()}
                              className="flex-1 text-sm px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                              placeholder="Написать комментарий..."
                          />
                          <button 
                            onClick={handleAddComment}
                            disabled={!newComment.trim()}
                            className="p-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors"
                          >
                              <Send size={16} />
                          </button>
                      </div>
                  </div>
                  
                  {/* Draft Response Feature */}
                  <div className="pt-4 border-t border-slate-100">
                      <div className="flex justify-between items-center mb-2">
                          <h4 className="font-bold text-slate-800 text-sm">Черновик ответа</h4>
                          <button 
                            onClick={() => handleDraftResponse(selectedItem)}
                            disabled={!!draftingId}
                            className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50 transition-colors"
                          >
                             {draftingId === selectedItem.id ? <Loader2 size={12} className="animate-spin"/> : <Sparkles size={12}/>} 
                             Авто-ответ
                          </button>
                      </div>
                      {draftResult ? (
                          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <textarea 
                                className="w-full text-sm p-3 border border-slate-200 rounded-lg focus:ring-blue-500 h-32 mb-2 resize-none" 
                                value={draftResult}
                                onChange={(e) => setDraftResult(e.target.value)}
                            />
                            <button className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
                                Копировать
                            </button>
                          </div>
                      ) : (
                          <div className="text-center p-6 bg-slate-50 rounded-lg border border-dashed border-slate-200 text-xs text-slate-400">
                              Сгенерировать профессиональный ответ на основе контекста.
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};