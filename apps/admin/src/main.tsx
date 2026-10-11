import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

function App() {
  return <div className="p-6 font-sans">Sitewright console: scaffold (M9 fills this in)</div>;
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
