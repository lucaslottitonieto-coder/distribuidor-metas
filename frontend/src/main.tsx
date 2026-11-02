import React from 'react';
import { createRoot } from 'react-dom/client';
import { UIProvider, ConfirmProvider, Toaster } from 'broto-ui';
import '@fontsource-variable/exo-2';
import '@fontsource-variable/exo-2/wght-italic.css';
import '@fontsource-variable/nunito';
import '../../vendor/broto-ui/src/styles/tokens.css';
import '../../vendor/broto-ui/src/styles/base.css';
import '../../vendor/broto-ui/src/styles/components.css';
import '../../vendor/broto-ui/src/styles/forms.css';
import '../../vendor/broto-ui/src/styles/data.css';
import '../../vendor/broto-ui/src/styles/overlays.css';
import '../../vendor/broto-ui/src/styles/layout.css';
import '../../vendor/broto-ui/src/styles/patterns.css';
import './styles.css';
import App from './App';
import './layout-density.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><UIProvider><ConfirmProvider><App /><Toaster /></ConfirmProvider></UIProvider></React.StrictMode>);
