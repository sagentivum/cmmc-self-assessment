import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/app.css';
import { CATALOGUE } from './domain/catalogue';
import { assertCatalogueInvariants } from './scoring/engine';

// Fail loudly in development if the compiled catalogue ever drifts.
if (import.meta.env.DEV) assertCatalogueInvariants(CATALOGUE);

const root = document.getElementById('root');
if (!root) throw new Error('#root missing from index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
