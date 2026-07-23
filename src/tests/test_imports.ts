import { useAppStore } from '../store/useAppStore';

console.log('Testing store initialization...');
const state = useAppStore.getState();
console.log('Initial activeTab:', state.activeTab);
console.log('Initial dryRunMode:', state.dryRunMode);
console.log('Initial driverBackupPath:', state.driverBackupPath);
console.log('Initial selectedDnsProvider:', state.selectedDnsProvider);
