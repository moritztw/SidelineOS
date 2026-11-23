import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registriereCoreSharedRuntime } from './plugins/sharedRuntime.ts';

registriereCoreSharedRuntime();

createRoot(document.getElementById('root')!).render(<App />);
