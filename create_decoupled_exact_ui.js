const fs = require('fs');

const original = fs.readFileSync('d:/trifilpla/components/ui/Garage.tsx', 'utf-8');
const lines = original.split('\n');

// Exact line boundaries (1-based to 0-based indexing)
// Dealer: lines 2408 to 3242
// Drive: lines 3243 to 4355
// Tuning: lines 4356 to 4585
// Menu: lines 4586 to 4608

const dealerCode = lines.slice(2407, 3242).join('\n');
const driveCode = lines.slice(3242, 4355).join('\n');
const tuningCode = lines.slice(4355, 4585).join('\n');
const menuCode = lines.slice(4585, 4608).join('\n');

console.log('Extracted Dealer length:', dealerCode.length);
console.log('Extracted Drive length:', driveCode.length);
console.log('Extracted Tuning length:', tuningCode.length);
console.log('Extracted Menu length:', menuCode.length);
