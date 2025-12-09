import { FeedbackItem, Department, DepartmentTables, Status, Comment, TelegramConfig, UserRole, FeedbackType, Urgency } from '../types';
import { sendNewFeedbackAlert } from './telegramService';

// Initialize tables if they don't exist
const initializeTables = () => {
  Object.values(Department).forEach(dept => {
    const tableName = DepartmentTables[dept];
    if (!localStorage.getItem(tableName)) {
      console.log(`[Service] Creating table: ${tableName}`);
      localStorage.setItem(tableName, JSON.stringify([]));
    }
  });
};

// Ensure tables are ready on load
initializeTables();

// Helper to get all feedback from a specific "Table"
export const getFeedbackByDepartment = (dept: Department): FeedbackItem[] => {
  const tableName = DepartmentTables[dept];
  const data = localStorage.getItem(tableName);
  return data ? JSON.parse(data) : [];
};

export const getAllFeedback = (): FeedbackItem[] => {
  let allItems: FeedbackItem[] = [];
  Object.values(Department).forEach((dept) => {
    allItems = [...allItems, ...getFeedbackByDepartment(dept as Department)];
  });
  return allItems.sort((a, b) => b.createdAt - a.createdAt);
};

export const saveFeedback = async (feedback: FeedbackItem): Promise<boolean> => {
  // 1. Save Local (Always works as backup)
  const tableName = DepartmentTables[feedback.department];
  const currentItems = getFeedbackByDepartment(feedback.department);
  const updatedItems = [feedback, ...currentItems];
  localStorage.setItem(tableName, JSON.stringify(updatedItems));

  // 2. Try Google Sheet Sync
  const config = getSheetConfig(feedback.department);
  if (config && config.accessToken && config.sheetId) {
      try {
          await exportToGoogleSheet(feedback, config);
          console.log(`[Service] Synced to Google Sheet for ${feedback.department}`);
      } catch (e) {
          console.error("[Service] Failed to sync to sheet:", e);
      }
  }

  // 3. Try Telegram Notification
  const tgConfig = getTelegramConfig();
  if (tgConfig) {
      try {
          await sendNewFeedbackAlert(feedback, tgConfig);
          console.log(`[Service] Sent Telegram alert`);
      } catch (e) {
          console.error("[Service] Failed to send Telegram alert:", e);
      }
  }

  return true;
};

const exportToGoogleSheet = async (item: FeedbackItem, config: SheetConfig) => {
    // Format data as a row
    const values = [
        [
            item.id,
            new Date(item.createdAt).toISOString(),
            item.role,
            item.type,
            item.department,
            item.message,
            item.urgency,
            item.status,
            item.isAnonymous ? 'Anonymous' : (item.name || ''),
            item.contact || '',
            item.aiAnalysis?.sentiment || ''
        ]
    ];

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.sheetId}/values/${config.tabName}!A1:append?valueInputOption=USER_ENTERED`;
    
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.accessToken}`
        },
        body: JSON.stringify({
            range: `${config.tabName}!A1`,
            majorDimension: 'ROWS',
            values: values
        })
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Google Sheets API Error: ${response.status} ${err}`);
    }
};

// NEW: Read data from Google Sheet to allow bidirectional editing
export const fetchFromGoogleSheet = async (dept: Department, config: SheetConfig): Promise<FeedbackItem[]> => {
    if (!config.accessToken || !config.sheetId) return [];

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.sheetId}/values/${config.tabName}!A1:Z1000`;
    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${config.accessToken}`
        }
    });

    if (!response.ok) return [];
    
    const data = await response.json();
    const rows = data.values;
    if (!rows || rows.length === 0) return [];

    // Assuming row structure matches exportToGoogleSheet + header row
    // Skip header if it exists (heuristic: check if first col is 'ID' or similar)
    const startIndex = rows[0][0] === 'ID' || rows[0][0] === 'id' ? 1 : 0;
    
    const items: FeedbackItem[] = rows.slice(startIndex).map((row: any) => {
        // Safe access
        return {
            id: row[0] || '',
            createdAt: new Date(row[1]).getTime() || Date.now(),
            role: (row[2] as UserRole) || UserRole.EMPLOYEE,
            type: (row[3] as FeedbackType) || FeedbackType.COMPLAINT,
            department: (row[4] as Department) || dept,
            message: row[5] || '',
            urgency: (row[6] as Urgency) || Urgency.NORMAL,
            status: (row[7] as Status) || Status.NEW,
            isAnonymous: row[8] === 'Anonymous',
            name: row[8] !== 'Anonymous' ? row[8] : undefined,
            contact: row[9] || undefined,
            comments: [], // Comments stored in sheets is complex, simplified to empty for sync
            aiAnalysis: row[10] ? { sentiment: row[10] as any, summary: '', suggestedAction: '', urgencyScore: 5 } : undefined
        };
    }).filter((i: FeedbackItem) => i.id); // Filter empty rows

    // Update local storage to match sheet (True Sync)
    const tableName = DepartmentTables[dept];
    localStorage.setItem(tableName, JSON.stringify(items));
    
    return items;
};

export const updateFeedbackStatus = (id: string, department: Department, newStatus: Status): void => {
  const tableName = DepartmentTables[department];
  const items = getFeedbackByDepartment(department);
  const updatedItems = items.map(item => 
    item.id === id ? { ...item, status: newStatus } : item
  );
  localStorage.setItem(tableName, JSON.stringify(updatedItems));
};

export const addComment = (id: string, department: Department, comment: Comment): void => {
  const tableName = DepartmentTables[department];
  const items = getFeedbackByDepartment(department);
  const updatedItems = items.map(item => 
    item.id === id ? { ...item, comments: [...item.comments || [], comment] } : item
  );
  localStorage.setItem(tableName, JSON.stringify(updatedItems));
};

// --- Backup Service ---

export const downloadBackup = () => {
    const allData = getAllFeedback();
    
    // Define CSV Headers
    const headers = ['ID', 'Date', 'Role', 'Type', 'Department', 'Message', 'Urgency', 'Status', 'Name', 'Contact', 'Sentiment'];
    
    // Map data to CSV rows
    const rows = allData.map(item => {
        return [
            item.id,
            new Date(item.createdAt).toLocaleString('ru-RU'),
            item.role,
            item.type,
            item.department,
            `"${item.message.replace(/"/g, '""')}"`, // Escape quotes and wrap in quotes
            item.urgency,
            item.status,
            item.isAnonymous ? 'Анонимно' : (item.name || ''),
            `"${(item.contact || '').replace(/"/g, '""')}"`,
            item.aiAnalysis?.sentiment || ''
        ].join(',');
    });

    // Combine headers and rows
    const csvContent = [headers.join(','), ...rows].join('\n');
    
    // Add BOM for Excel UTF-8 compatibility
    const bom = "\uFEFF";
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `artwin_backup_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

// --- Google Sheet Configuration Services ---

export interface SheetConfig {
    sheetId: string;
    tabName: string;
    accessToken?: string; 
}

export const saveSheetConfig = (dept: Department, config: SheetConfig) => {
    localStorage.setItem(`artwin_sheet_config_${dept}`, JSON.stringify(config));
};

export const getSheetConfig = (dept: Department): SheetConfig | null => {
    const data = localStorage.getItem(`artwin_sheet_config_${dept}`);
    return data ? JSON.parse(data) : null;
};

export const removeSheetConfig = (dept: Department) => {
    localStorage.removeItem(`artwin_sheet_config_${dept}`);
};

// --- Telegram Configuration Services ---

export const saveTelegramConfig = (config: TelegramConfig) => {
    localStorage.setItem('artwin_telegram_config', JSON.stringify(config));
};

export const getTelegramConfig = (): TelegramConfig | null => {
    const data = localStorage.getItem('artwin_telegram_config');
    return data ? JSON.parse(data) : null;
};