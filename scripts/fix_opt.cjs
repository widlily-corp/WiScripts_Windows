const fs = require('fs');
const file = 'src/components/OptimizationView.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/set\{t\('optimization\.selected'\)\}Category/g, 'setSelectedCategory');
content = content.replace(/toggleOptimization\{t\('optimization\.selected'\)\}/g, 'toggleOptimizationSelected');
content = content.replace(/is\{t\('optimization\.selected'\)\}/g, 'isSelected');
content = content.replace(/handleExecute\{t\('optimization\.selected'\)\}/g, 'handleExecuteSelected');
content = content.replace(/Execute \{t\('optimization\.selected'\)\}/g, 'Execute ${t(\\\'optimization.selected\\\')}');

fs.writeFileSync(file, content, 'utf8');
