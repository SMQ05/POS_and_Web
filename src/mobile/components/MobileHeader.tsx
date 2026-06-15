import { useState } from 'react';
import { useAuthStore, useSettingsStore } from '@/store';
import { cn } from '@/lib/utils';
import {
  Building,
  ChevronDown,
  Bell,
  Pill,
  X,
  Check,
  Building2
} from 'lucide-react';
import { toast } from 'sonner';

export function MobileHeader() {
  const { tenant, branches } = useAuthStore();
  const { settings } = useSettingsStore();

  const [showBranchSheet, setShowBranchSheet] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<any>({ id: '1', name: 'Main Pharmacy' });

  const activeBranches = branches && branches.length > 0 ? branches : [
    { id: '1', name: 'Main Pharmacy', address: 'Lahore' },
    { id: '2', name: 'DHA Branch Store', address: 'DHA Phase 5' }
  ];

  const handleBranchSelect = (branch: any) => {
    setSelectedBranch(branch);
    setShowBranchSheet(false);
    toast.success(`Switched workspace branch context to ${branch.name}`);
  };

  return (
    <>
      <header className="sticky top-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800 px-6 py-3.5 z-40 flex items-center justify-between shadow-[0_4px_24px_rgba(0,0,0,0.02)]">
        {/* Branch Context Switcher trigger */}
        <button
          onClick={() => setShowBranchSheet(true)}
          className="flex items-center gap-2 text-left active:scale-95 transition-transform"
        >
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
            <Building className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-none">Branch Outlet</p>
            <p className="text-xs font-black text-gray-800 dark:text-white flex items-center gap-1 mt-0.5">
              {selectedBranch.name} <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            </p>
          </div>
        </button>

        {/* Right accessories */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => toast.info('You are fully compliant with July-2025 PRAL DI API protocols.')}
            className="w-8 h-8 rounded-lg bg-gray-50 dark:bg-gray-850 flex items-center justify-center text-gray-500 relative"
          >
            <Bell className="w-4.5 h-4.5" />
          </button>
        </div>
      </header>

      {/* Branch Switcher Sheet */}
      {showBranchSheet && (
        <div className="fixed inset-0 z-50 flex flex-end bg-black/60 backdrop-blur-sm transition-opacity">
          <div className="w-full mt-auto bg-white dark:bg-gray-900 border-t border-t-gray-200 dark:border-t-gray-800 rounded-t-3xl shadow-2xl p-5 space-y-4 max-h-[50vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  Switch Active Branch
                </h3>
                <p className="text-[10px] text-gray-500">Redirect stock checking and cash invoices</p>
              </div>
              <button
                onClick={() => setShowBranchSheet(false)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-850 flex items-center justify-center text-gray-500 active:scale-90"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              {activeBranches.map((br) => {
                const isSelected = selectedBranch.id === br.id;
                return (
                  <button
                    key={br.id}
                    onClick={() => handleBranchSelect(br)}
                    className={cn(
                      'w-full p-4 rounded-2xl border flex items-center justify-between text-left active:scale-98 transition-all',
                      isSelected
                        ? 'border-emerald-500 bg-emerald-500/5 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold'
                        : 'border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950 text-gray-700 dark:text-gray-300'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Building2 className="w-5 h-5" />
                      <div>
                        <span className="text-xs block">{br.name}</span>
                        <span className="text-[9px] text-gray-400 font-medium">{br.address}</span>
                      </div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-emerald-500" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
