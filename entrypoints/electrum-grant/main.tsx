import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  parseElectrumGrantSearch,
} from '../../src/domain/electrum/grantFlow';
import ElectrumGrantView from '../../src/ui/views/ElectrumGrantView';
import './style.css';

const params = parseElectrumGrantSearch(window.location.search);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {params ? (
      <ElectrumGrantView action={params.action} rawUrl={params.url} />
    ) : (
      <main className="grant">
        <p className="error" role="alert">
          Missing grant parameters. Open this page from Network → Add or Test.
        </p>
      </main>
    )}
  </React.StrictMode>
);
