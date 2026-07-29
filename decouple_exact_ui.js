const fs = require('fs');

const original = fs.readFileSync('d:/trifilpla/components/ui/Garage.tsx', 'utf-8');
const lines = original.split('\n');

// Find line indexes for section comments
let dealerStart = 0;
let dealerEnd = 0;
let driveStart = 0;
let driveEnd = 0;
let tuningStart = 0;
let tuningEnd = 0;
let menuStart = 0;
let menuEnd = 0;

lines.forEach((line, idx) => {
  if (line.includes('{/* DEDICATED DEALER CITY MAP */}')) dealerStart = idx;
  if (line.includes('{/* DEDICATED DRIVE MODES INTERFACE */}')) {
    dealerEnd = idx;
    driveStart = idx;
  }
  if (line.includes('{/* DEDICATED TUNING BAY */}')) {
    driveEnd = idx;
    tuningStart = idx;
  }
  if (line.includes('{/* TOP PADDOCK MENU OVERLAY */}')) {
    tuningEnd = idx;
    menuStart = idx;
  }
});
menuEnd = lines.length - 3; // before final closing brackets

console.log('Dealer range:', dealerStart + 1, 'to', dealerEnd);
console.log('Drive range:', driveStart + 1, 'to', driveEnd);
console.log('Tuning range:', tuningStart + 1, 'to', tuningEnd);
console.log('Menu range:', menuStart + 1, 'to', menuEnd);
