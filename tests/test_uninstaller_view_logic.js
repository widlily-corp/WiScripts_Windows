// Tests for UninstallerView.tsx logic (filtering, search, sorting, size formatting, storage calculation)

function formatAppSize(sizeKb) {
  if (!sizeKb || sizeKb <= 0) return 'Unknown';
  if (sizeKb < 1024) {
    return `${sizeKb} KB`;
  } else if (sizeKb < 1024 * 1024) {
    return `${(sizeKb / 1024).toFixed(1)} MB`;
  }
  return `${(sizeKb / (1024 * 1024)).toFixed(2)} GB`;
}

function filterAndSortApps(installedApps, searchQuery, hideSystemApps, sortField, sortOrder) {
  let result = installedApps.filter((app) => {
    if (hideSystemApps && app.isSystemComponent) return false;
    if (!searchQuery.trim()) return true;

    const q = searchQuery.toLowerCase();
    const matchName = app.name.toLowerCase().includes(q);
    const matchPublisher = app.publisher?.toLowerCase().includes(q) ?? false;
    const matchVersion = app.version?.toLowerCase().includes(q) ?? false;
    const matchPath = app.registryPath.toLowerCase().includes(q);

    return matchName || matchPublisher || matchVersion || matchPath;
  });

  result.sort((a, b) => {
    let cmp = 0;
    if (sortField === 'name') {
      cmp = a.name.localeCompare(b.name);
    } else if (sortField === 'size') {
      const sizeA = a.estimatedSizeKb || 0;
      const sizeB = b.estimatedSizeKb || 0;
      cmp = sizeA - sizeB;
    } else if (sortField === 'publisher') {
      cmp = (a.publisher || '').localeCompare(b.publisher || '');
    } else if (sortField === 'date') {
      cmp = (a.installDate || '').localeCompare(b.installDate || '');
    }
    return sortOrder === 'asc' ? cmp : -cmp;
  });

  return result;
}

function calculateTotalStorageKb(filteredApps) {
  return filteredApps.reduce((acc, app) => acc + (app.estimatedSizeKb || 0), 0);
}

// Mock test dataset
const mockApps = [
  {
    id: 'app_1',
    name: '7-Zip 23.01',
    publisher: 'Igor Pavlov',
    version: '23.01',
    estimatedSizeKb: 5120, // 5 MB
    installDate: '20260110',
    registryPath: 'HKLM\\Software\\...\\7-Zip',
    isSystemComponent: false,
    uninstallString: '"C:\\Program Files\\7-Zip\\Uninstall.exe"',
  },
  {
    id: 'app_2',
    name: 'Microsoft Edge Update',
    publisher: 'Microsoft Corporation',
    version: '1.3.187.37',
    estimatedSizeKb: null,
    installDate: '20251105',
    registryPath: 'HKLM\\Software\\...\\EdgeUpdate',
    isSystemComponent: true,
    uninstallString: 'msiexec /x {1234}',
  },
  {
    id: 'app_3',
    name: 'Visual Studio Code',
    publisher: 'Microsoft Corporation',
    version: '1.85.0',
    estimatedSizeKb: 358400, // 350 MB
    installDate: '01/15/2026', // Different date format MM/DD/YYYY
    registryPath: 'HKCU\\Software\\...\\Code',
    isSystemComponent: false,
    uninstallString: '"C:\\Users\\Test\\AppData\\Local\\Programs\\Microsoft VS Code\\unins000.exe"',
  },
  {
    id: 'app_4',
    name: 'Python 3.11.0',
    publisher: null,
    version: '3.11.0',
    estimatedSizeKb: 1572864, // 1.5 GB
    installDate: null,
    registryPath: 'HKLM\\Software\\...\\Python311',
    isSystemComponent: false,
    uninstallString: '',
  },
];

console.log('=== TEST 1: Size Formatting ===');
console.log('5120 KB =>', formatAppSize(5120));
console.log('358400 KB =>', formatAppSize(358400));
console.log('1572864 KB =>', formatAppSize(1572864));
console.log('null KB =>', formatAppSize(null));
console.log('0 KB =>', formatAppSize(0));

console.log('\n=== TEST 2: System Component Filtering ===');
const hideSys = filterAndSortApps(mockApps, '', true, 'name', 'asc');
console.log('Hide system apps count:', hideSys.length, '(Expected: 3)');
console.log('Hidden apps names:', hideSys.map(a => a.name));

const showSys = filterAndSortApps(mockApps, '', false, 'name', 'asc');
console.log('Show system apps count:', showSys.length, '(Expected: 4)');

console.log('\n=== TEST 3: Search Query Filtering ===');
const searchMicro = filterAndSortApps(mockApps, 'Microsoft', false, 'name', 'asc');
console.log('Search "Microsoft" count:', searchMicro.length, '=>', searchMicro.map(a => a.name));

const searchCode = filterAndSortApps(mockApps, 'Code', true, 'name', 'asc');
console.log('Search "Code" count:', searchCode.length, '=>', searchCode.map(a => a.name));

console.log('\n=== TEST 4: Sorting by Size ===');
const sortSizeAsc = filterAndSortApps(mockApps, '', false, 'size', 'asc');
console.log('Sort Size ASC:', sortSizeAsc.map(a => `${a.name}: ${a.estimatedSizeKb}`));

const sortSizeDesc = filterAndSortApps(mockApps, '', false, 'size', 'desc');
console.log('Sort Size DESC:', sortSizeDesc.map(a => `${a.name}: ${a.estimatedSizeKb}`));

console.log('\n=== TEST 5: Sorting by Date (Date Format Inconsistency Bug) ===');
const sortDateAsc = filterAndSortApps(mockApps, '', false, 'date', 'asc');
console.log('Sort Date ASC:', sortDateAsc.map(a => `${a.name}: date='${a.installDate}'`));

console.log('\n=== TEST 6: Total Storage Dynamic Calculation ===');
const totalStorageAll = calculateTotalStorageKb(showSys);
console.log('Total Storage All Apps:', formatAppSize(totalStorageAll));

const totalStorageFiltered = calculateTotalStorageKb(searchCode);
console.log('Total Storage Filtered Search "Code":', formatAppSize(totalStorageFiltered));
