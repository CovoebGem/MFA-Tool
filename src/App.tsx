import { useState } from "react";
import type { Page, OTPAccount, Group, DedupResult } from "./types";
import Sidebar from "./components/Sidebar";
import HomePage from "./components/HomePage";
import AccountPage from "./components/AccountPage";
import GroupPage from "./components/GroupPage";
import { TempPanel } from "./components/TempPanel";
import type { TempEntry } from "./components/TempPanel";
import DedupDialog from "./components/DedupDialog";
import { useAccounts } from "./hooks/useAccounts";
import { useGroups } from "./hooks/useGroups";
import { skipDuplicates, overrideDuplicates } from "./lib/dedup-checker";
import { saveGroups } from "./lib/group-manager";
import { saveAccounts } from "./lib/account-manager";

function App() {
  const [currentPage, setCurrentPage] = useState<Page>("home");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [dedupState, setDedupState] = useState<{
    result: DedupResult;
    newGroups: Group[];
  } | null>(null);
  const [tempEntries, setTempEntries] = useState<TempEntry[]>([]);

  const {
    accounts,
    setAccounts,
    loading: accountsLoading,
    error: accountsError,
    addNewAccounts,
    deleteAccount,
    batchMoveToGroup,
  } = useAccounts();

  const {
    groups,
    setGroups,
    loading: groupsLoading,
    error: groupsError,
    addGroup,
    editGroup,
    removeGroup,
  } = useGroups();

  const loading = accountsLoading || groupsLoading;
  const error = accountsError || groupsError;

  const handleDedupDetected = (result: DedupResult, newGroups: Group[]) => {
    setDedupState({ result, newGroups });
  };

  const handleDedupSkip = async () => {
    if (!dedupState) return;
    const uniqueAccounts = skipDuplicates(dedupState.result);
    await addNewAccounts(uniqueAccounts);
    setGroups(dedupState.newGroups);
    await saveGroups(dedupState.newGroups);
    setDedupState(null);
  };

  const handleDedupOverride = async () => {
    if (!dedupState) return;
    const updated = overrideDuplicates(accounts, dedupState.result);
    setAccounts(updated);
    await saveAccounts(updated);
    setGroups(dedupState.newGroups);
    await saveGroups(dedupState.newGroups);
    setDedupState(null);
  };

  const handleDedupCancel = () => {
    setDedupState(null);
  };

  const handleDeleteGroup = async (groupId: string) => {
    const updatedAccounts = await removeGroup(groupId, accounts);
    if (updatedAccounts) {
      setAccounts(updatedAccounts);
      await saveAccounts(updatedAccounts);
    }
  };

  const handleSaveToAccount = async (account: OTPAccount) => {
    await addNewAccounts([account]);
  };

  const renderPage = () => {
    switch (currentPage) {
      case "home":
        return (
          <HomePage
            accounts={accounts}
            groups={groups}
            onAccountsAdded={addNewAccounts}
            onGroupsUpdated={setGroups}
            onDedupDetected={handleDedupDetected}
          />
        );
      case "accounts":
        return (
          <AccountPage
            accounts={accounts}
            groups={groups}
            onDelete={deleteAccount}
            onBatchMoveToGroup={batchMoveToGroup}
          />
        );
      case "groups":
        return (
          <GroupPage
            groups={groups}
            accounts={accounts}
            onCreateGroup={addGroup}
            onRenameGroup={editGroup}
            onDeleteGroup={handleDeleteGroup}
            onDeleteAccount={deleteAccount}
          />
        );
      case "temp":
        return <TempPanel entries={tempEntries} onEntriesChange={setTempEntries} onSaveToAccount={handleSaveToAccount} />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <Sidebar
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
      />
      <main className={`${sidebarCollapsed ? "ml-16" : "ml-48"} min-h-screen transition-all duration-200`}>
        {error && (
          <div
            role="alert"
            className="mx-4 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <svg
              className="h-8 w-8 animate-spin text-blue-500"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <span className="ml-3 text-gray-500">加载中...</span>
          </div>
        ) : (
          renderPage()
        )}
      </main>
      {dedupState && (
        <DedupDialog
          result={dedupState.result}
          onSkip={handleDedupSkip}
          onOverride={handleDedupOverride}
          onCancel={handleDedupCancel}
        />
      )}
    </div>
  );
}

export default App;
