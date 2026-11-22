import type { Locale } from "./locale-store";

export const translations = {
  zh: {
    nav: {
      home: "首页",
      accounts: "账户",
      groups: "分组",
      temp: "临时",
      sync: "云同步",
    },
    home: {
      title: "首页",
      noAccounts: "还没有任何账户",
      addFirst: "通过上传二维码图片或手动输入来添加你的第一个 2FA 账户",
      stats: {
        totalAccounts: "账户总数",
        totalGroups: "分组总数",
        recentCount: "近 7 天新增",
      },
    },
    accounts: {
      title: "账户管理",
      empty: "暂无账户",
      emptyHint: "请上传二维码或手动添加",
      search: "搜索账户...",
      searchAriaLabel: "搜索账户",
      searchPlaceholder: "搜索服务商、账户名称、备注或分组...",
      clearSearch: "清空搜索",
      noMatch: "未找到匹配「{query}」的账户",
      dragDisabledHint: "清空搜索后可调整顺序",
      pinnedSection: "已置顶",
      otherSection: "其他账户",
      pinnedQuickAccess: "已置顶账户",
      view: {
        grid: "网格",
        list: "列表",
        gridAriaLabel: "网格视图",
        listAriaLabel: "列表视图",
        switchAriaLabel: "视图切换",
      },
      sort: {
        name: "名称",
        issuer: "服务",
        createdAt: "创建时间",
        asc: "升序",
        desc: "降序",
      },
      card: {
        unknown: "未知服务",
        key: "密钥",
        detail: "详情",
        edit: "编辑",
        delete: "删除",
        confirmDelete: "确认删除",
        copied: "已复制",
        pin: "置顶",
        unpin: "取消置顶",
        pinnedBadge: "已置顶",
        remark: "备注",
      },
      batch: {
        selectAll: "全选",
        deselectAll: "取消全选",
        moveTo: "移动到",
        delete: "删除选中",
        check: "检查",
        pin: "批量置顶",
        unpin: "取消置顶",
      },
    },
    groups: {
      title: "分组管理",
      create: "新建分组",
      default: "默认分组",
      empty: "该分组暂无账户",
      accounts: "个账户",
    },
    temp: {
      title: "临时验证",
      placeholder: "输入 otpauth:// URL 或密钥",
      add: "添加",
      clear: "清空",
      saveToAccount: "保存到账户",
    },
    backup: {
      export: "导出",
      import: "导入",
      importing: "导入中...",
      noAccounts: "没有账户可导出",
      exportSuccess: "成功导出 {count} 个账户",
      importSuccess: "成功导入 {count} 个账户",
      invalidFile: "无效的备份文件格式",
    },
    theme: {
      light: "浅色",
      dark: "深色",
      system: "跟随系统",
    },
    locale: {
      zh: "中文",
      en: "English",
    },
    loading: "加载中...",
    error: "出错了",
  },
  en: {
    nav: {
      home: "Home",
      accounts: "Accounts",
      groups: "Groups",
      temp: "Temp",
      sync: "Sync",
    },
    home: {
      title: "Home",
      noAccounts: "No accounts yet",
      addFirst: "Add your first 2FA account by uploading a QR code or entering manually",
      stats: {
        totalAccounts: "Total Accounts",
        totalGroups: "Total Groups",
        recentCount: "Added This Week",
      },
    },
    accounts: {
      title: "Account Management",
      empty: "No accounts",
      emptyHint: "Upload a QR code or add manually",
      search: "Search accounts...",
      searchAriaLabel: "Search accounts",
      searchPlaceholder: "Search issuer, account name, remark, or group...",
      clearSearch: "Clear search",
      noMatch: "No accounts matching \"{query}\"",
      dragDisabledHint: "Clear search to reorder accounts",
      pinnedSection: "Pinned",
      otherSection: "Other Accounts",
      pinnedQuickAccess: "Pinned Accounts",
      view: {
        grid: "Grid",
        list: "List",
        gridAriaLabel: "Grid view",
        listAriaLabel: "List view",
        switchAriaLabel: "Switch view",
      },
      sort: {
        name: "Name",
        issuer: "Service",
        createdAt: "Created",
        asc: "Ascending",
        desc: "Descending",
      },
      card: {
        unknown: "Unknown Service",
        key: "Key",
        detail: "Detail",
        edit: "Edit",
        delete: "Delete",
        confirmDelete: "Confirm",
        copied: "Copied",
        pin: "Pin",
        unpin: "Unpin",
        pinnedBadge: "Pinned",
        remark: "Remark",
      },
      batch: {
        selectAll: "Select All",
        deselectAll: "Deselect All",
        moveTo: "Move to",
        delete: "Delete Selected",
        check: "Check",
        pin: "Pin Selected",
        unpin: "Unpin",
      },
    },
    groups: {
      title: "Group Management",
      create: "New Group",
      default: "Default Group",
      empty: "No accounts in this group",
      accounts: "accounts",
    },
    temp: {
      title: "Temporary Verification",
      placeholder: "Enter otpauth:// URL or secret key",
      add: "Add",
      clear: "Clear",
      saveToAccount: "Save to Account",
    },
    backup: {
      export: "Export",
      import: "Import",
      importing: "Importing...",
      noAccounts: "No accounts to export",
      exportSuccess: "Exported {count} accounts",
      importSuccess: "Imported {count} accounts",
      invalidFile: "Invalid backup file format",
    },
    theme: {
      light: "Light",
      dark: "Dark",
      system: "System",
    },
    locale: {
      zh: "中文",
      en: "English",
    },
    loading: "Loading...",
    error: "Error",
  },
} as const;

export type TranslationKey = keyof typeof translations.zh;

export function t(locale: Locale, key: string, params?: Record<string, string | number>): string {
  const keys = key.split(".");
  let value: unknown = translations[locale];
  
  for (const k of keys) {
    if (typeof value !== "object" || value === null) {
      return key;
    }
    value = (value as Record<string, unknown>)[k];
  }
  
  if (typeof value !== "string") {
    return key;
  }
  
  if (params) {
    return value.replace(/\{(\w+)\}/g, (_, paramKey) => {
      return String(params[paramKey] ?? `{${paramKey}}`);
    });
  }
  
  return value;
}
