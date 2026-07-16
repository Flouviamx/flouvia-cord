// Shim de compatibilidad para resolución "node10"/classic de TypeScript (no lee
// package.json#exports). Los consumidores modernos (bundler/node16/nodenext)
// resuelven vía el exports map de package.json, no este archivo.
export * from './dist/types/react.js';
export { default } from './dist/types/react.js';
