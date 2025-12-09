export enum UserRole {
  EMPLOYEE = 'Сотрудник',
  CLIENT = 'Клиент',
  CONTRACTOR = 'Подрядчик'
}

export enum FeedbackType {
  COMPLAINT = 'Жалоба',
  PROPOSAL = 'Предложение'
}

export enum Department {
  HR = 'HR',
  CONSTRUCTION = 'Стройка',
  FINANCE = 'Финансы',
  SUPPLY = 'Снабжение',
  OTHER = 'Прочее'
}

export enum Urgency {
  NORMAL = 'Обычно',
  URGENT = 'Срочно'
}

export enum Status {
  NEW = 'Новая',
  IN_PROGRESS = 'В работе',
  RESOLVED = 'Решена',
  REJECTED = 'Отклонена'
}

// Maps departments to specific "Table" names as requested
export const DepartmentTables: Record<Department, string> = {
  [Department.HR]: 'Artwin_HR_Feedback',
  [Department.CONSTRUCTION]: 'Artwin_Construction_Feedback',
  [Department.FINANCE]: 'Artwin_Finance_Feedback',
  [Department.SUPPLY]: 'Artwin_Supply_Feedback',
  [Department.OTHER]: 'Artwin_General_Feedback',
};

export interface FeedbackItem {
  id: string;
  role: UserRole;
  type: FeedbackType;
  department: Department;
  message: string;
  urgency: Urgency;
  status: Status;
  createdAt: number;
  
  // Optional fields
  name?: string;
  contact?: string;
  isAnonymous: boolean;
  attachmentName?: string; // Simulating a file reference
  
  // Admin/System fields
  comments: Comment[];
  aiAnalysis?: AIAnalysis;
}

export interface Comment {
  id: string;
  author: string;
  text: string;
  timestamp: number;
}

export interface AIAnalysis {
  sentiment: 'positive' | 'neutral' | 'negative';
  summary: string;
  suggestedAction: string;
  urgencyScore: number; // 1-10
}

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}